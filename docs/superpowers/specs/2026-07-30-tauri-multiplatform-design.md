# Slicer 多平台 WebView 打包设计（Tauri v2）

> 状态：头脑风暴设计稿（待主人复核）
> 最后更新：2026-07-30
> 目标读者：v18 收尾完成、准备把 Slicer 从「纯浏览器单页」升级为「Windows / Linux / Android 三端可分发」的维护者

## 1. 目标与边界

### 1.1 目标

把 `app/` 下现有的 Vite + React 19 + TypeScript + Tailwind v4 纯静态前端，打包成：

- **Windows**：`.msi`（NSIS/WiX 由 Tauri bundle 自动出）+ 便携 `.exe`（portable build）
- **Linux**：`.deb` + `.AppImage`
- **Android**：`.apk`（release 签名）

同时保留浏览器 `npm run dev` / `npm run build` 现有工作流不变。

### 1.2 不做的事

- ❌ iOS（无 Xcode + 无 Apple 开发者账号，且超出「apk / exe / linux」诉求）
- ❌ macOS（不在诉求；后续如需，加一行 target 即可）
- ❌ 原生文件系统桥接（File System Access API 在不支持的平台上自动降级内存模式，见 CLAUDE.md 7.3）
- ❌ Service Worker / 推送 / 后台任务
- ❌ 对 SealGo WASM / 分割合并算法 / i18n / 测试基线的任何重构

### 1.3 必须满足

- 单一源代码（`app/src/` + `app/public/`）能在三端构建。
- SealGo WASM（`fetch('/wasm/SealGo.wasm')`）三端可加载、可 instantiate、可执行 deriveKeyFromPassword / encryptChunkWithKey / decryptChunkWithKey。
- `crypto.subtle` 三端可用（Linux WebKitGTK 需要 secure context 特殊处理，见 §5.2）。
- 97 个 vitest 用例 + `tsc -b` 在接入 Tauri 后仍零错零失败。

## 2. 架构

### 2.1 仓库布局

在根目录 `D:\newC\stick2\Slicer\` 新建 `src-tauri/`（Tauri 官方默认位置）：

```
Slicer/
├── app/                        # 现有前端，零改动（仅 vite.config.ts 增加 base:'./'）
│   ├── public/wasm/            # SealGo WASM 资产，构建后自动拷到 dist/
│   └── src/                    # 现有 React 代码
├── src-tauri/                  # 新增：Tauri 壳
│   ├── Cargo.toml
│   ├── build.rs
│   ├── tauri.conf.json         # 主配置（Windows / Linux 共用）
│   ├── tauri.linux.conf.json   # Linux 覆盖（启用 localhost 插件）
│   ├── tauri.android.conf.json # Android 覆盖（包名、权限、图标）
│   ├── icons/                  # 32/128/256 png + icon.ico + icon.icns（生成一次，三端复用）
│   ├── capabilities/
│   │   └── default.json        # 最小权限集
│   └── src/
│       ├── main.rs             # 入口：构建 Tauri App，按 cfg 装载 localhost 插件
│       └── lib.rs              # Tauri v2 mobile 入口（#[cfg_attr(mobile, tauri::mobile_entry_point)]）
├── .github/workflows/
│   └── tauri-build.yml         # 三端并行打包
└── docs/superpowers/specs/     # 本设计稿所在
```

**设计取舍**：
- 不在 `app/` 内嵌 `src-tauri`，保持 `app/` 是「纯前端可被任何壳包装」的中性形态。v19 后想换壳（Wails、Capacitor）也只动 `src-tauri/`。
- 前端**不需要知道**自己跑在浏览器还是 Tauri 壳里——这是单向依赖（壳依赖前端 dist，前端不依赖壳 API）。本次设计**不使用** `@tauri-apps/api` 的 invoke/event 体系。

### 2.2 构建管线

```
源代码 → Vite build → app/dist/  →  Tauri 拷贝 dist 进 webview 资产  →  bundle（msi/exe/deb/AppImage/apk）
```

`tauri.conf.json` 关键字段：

```json
{
  "build": {
    "frontendDist": "../app/dist",
    "devUrl": "http://localhost:5173",
    "beforeDevCommand": "npm --prefix app run dev",
    "beforeBuildCommand": "npm --prefix app run build"
  },
  "app": {
    "windows": [{ "title": "Slicer", "width": 960, "height": 720, "minWidth": 640, "minHeight": 480 }],
    "security": {
      "csp": "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; connect-src 'self' ipc: http://ipc.localhost; style-src 'self' 'unsafe-inline'; img-src 'self' data:"
    }
  },
  "bundle": {
    "active": true,
    "targets": ["msi", "nsis", "deb", "appimage"],
    "icon": ["icons/32x32.png", "icons/128x128.png", "icons/icon.ico"]
  },
  "identifier": "com.slicer.app",
  "productName": "Slicer",
  "version": "0.19.0"
}
```

`vite.config.ts` 仅需一行改动：`base: './'`（让 dist 里的资源相对路径生效，Tauri 内嵌资产要求）。

### 2.3 单代码库三端构建

| 端 | 触发 | 输出 | 备注 |
|---|---|---|---|
| Windows | `cargo tauri build`（本机） | `.msi` + `nsis .exe` | WebView2，生产 OK |
| Linux | `cargo tauri build --config src-tauri/tauri.linux.conf.json`（CI ubuntu-latest） | `.deb` + `.AppImage` | WebKitGTK，需要 §5.2 处理 |
| Android | `cargo tauri android build -- --apk`（CI ubuntu-latest） | `.apk`（debug 签名） | 需要 `tauri android init` 一次，gen/android 入 git |

`frontendDist` / `identifier` / 图标三端共享；差异只在「Linux 启用 localhost 插件」「Android 包名 / 权限 / 启动 activity」两个覆盖文件。

## 3. 组件清单

| 组件 | 位置 | 职责 | 备注 |
|---|---|---|---|
| Tauri 壳主程序 | `src-tauri/src/main.rs` | 装配 plugin、build、run | ≤ 30 行 |
| Mobile 入口 | `src-tauri/src/lib.rs` | 给 `cargo tauri android dev` 提供 `run()` 符号 | Tauri v2 模板 |
| localhost 插件装载 | `main.rs` 内 `#[cfg(target_os = "linux")]` 分支 | 把 webview 内容改走 `http://localhost:<port>`，拿 secure context | 仅 Linux 需要 |
| CSP 配置 | `tauri.conf.json → app.security.csp` | 允许 wasm / 限制 connect-src | 见 §5.1 |
| 图标集 | `src-tauri/icons/` | 32/128/256 png + ico | 一次性用 `tauri icon` 生成 |
| Capabilities | `src-tauri/capabilities/default.json` | 最小权限（core:default） | 无需 shell/open/notification |
| GitHub Actions | `.github/workflows/tauri-build.yml` | 三端并行打包 + 上传 release | 见 §8 |

## 4. 数据流

### 4.1 前端资产加载

```
启动 → Tauri 加载 frontendDist 内嵌资产 → webview 渲染 index.html
     → 前端 fetch('/wasm/SealGo.wasm') → webview 命中内嵌 wasm 资产
     → wasm_exec.js 在 webview 内启动 Go 运行时 → window.SealGo 可用
```

三端**路径完全一致**（`/wasm/SealGo.wasm`），零改动。CSP 中 `'wasm-unsafe-eval'` 允许 Go wasm 的 instantiate。

### 4.2 用户输入 → 文件输出

完全沿用现有 `SplitPanel / MergePanel / stream-split / stream-merge / fs-access` 链路：

```
用户拖文件 → File System Access API 选目录 → 逐切片 createWritable 写盘
```

WebView2（Windows）/ Android WebView 原生支持 `showDirectoryPicker / createWritable`；WebKitGTK（Linux）不支持 → `supportsFsAccess()` 返回 false → 现有降级路径走「内存模式 + toast 提示」。**该降级逻辑在 v15 已实现（CLAUDE.md 7.3），本次零改动**。

### 4.3 状态与持久化

- `sessionStorage['slicer:split-progress']` 在三端 WebView 都可用。
- `localStorage['slicer:locale']` 同上。
- BroadcastChannel `'slicer:split-progress'` 在 Tauri 单窗口场景下天然只有一窗口——但代码保留，未来若开多窗口立即生效，零成本。

## 5. 三端差异与兼容策略

### 5.1 共享（零改动）

- React 19 / Tailwind v4 / vitest / i18n / panel-error / manifest / stream-split / stream-merge / progress-meter / cross-tab / virtualize / decrypt-error
- `fetch('/wasm/SealGo.wasm')`、`new Blob`、`Array.prototype.slice`、Web Worker（worker-kdf）、`crypto.getRandomValues`、BroadcastChannel、sessionStorage、localStorage

### 5.2 Linux WebKitGTK 差异（**最大风险点**）

| 风险 | 现状 | 对策 |
|---|---|---|
| `crypto.subtle` 不可用 | `tauri://localhost` scheme 在 WebKitGTK 上 `isSecureContext = false`（tauri#9174） | 启用 `tauri-plugin-localhost`，把 webview 内容改走 `http://localhost:<port>`，得到 secure context |
| File System Access API 缺失 | WebKitGTK 完全不支持 `showXxxPicker` | 沿用 v15 降级：`supportsFsAccess()` 返回 false → 内存模式 + toast 提示 |
| WASM 加载 | CSP 限制 wasm instantiate | CSP 加 `'wasm-unsafe-eval'`（Go wasm 必须） |
| 系统依赖 | Ubuntu 需要 `libwebkit2gtk-4.1-dev` 等 | CI 用 `tauri-apps/tauri-action` 自动装 |

`tauri.linux.conf.json` 覆盖：

```json
{
  "app": {
    "security": {
      "csp": "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; connect-src 'self' http://localhost:*; style-src 'self' 'unsafe-inline'; img-src 'self' data:"
    }
  },
  "bundle": { "targets": ["deb", "appimage"] }
}
```

`src-tauri/src/main.rs` 关键逻辑：

```rust
#[cfg(target_os = "linux")]
let builder = builder.plugin(tauri_plugin_localhost::Builder::new(port).build());
```

端口由 `portpicker` 在启动时挑一个空闲端口，避免冲突。

### 5.3 Android 差异

| 项 | 现状 | 对策 |
|---|---|---|
| WebView 内核 | 系统 Chromium | 天然支持 FS Access / WASM / Worker / SubtleCrypto |
| File System Access | Android WebView ≥ 105 支持 | 直写磁盘可用 |
| WASM 加载 | 内嵌资产可 fetch | 与桌面端同路径 |
| 包体 | 包含 Go WASM + V8，APK ≈ 8-12 MB | 无需精简，现代 Android 可接受 |
| 签名 | debug keystore 默认 | 出 release APK 需 `~/.android/slicer.keystore`，CI 通过 secrets 注入 |
| 权限 | 纯前端无需特殊权限 | `AndroidManifest.xml` 只保留 `INTERNET`（WasmEdge）即可 |

`tauri.android.conf.json` 关键覆盖：

```json
{
  "identifier": "com.slicer.app",
  "bundle": { "targets": ["apk"] },
  "plugins": {}
}
```

`src-tauri/gen/android/` 由 `cargo tauri android init` 生成，**入 git**（Tauri 官方推荐）。

### 5.4 Windows 差异

| 项 | 现状 | 对策 |
|---|---|---|
| WebView 内核 | WebView2（Edge Chromium） | 全功能 |
| File System Access | 完整支持 | 直写磁盘可用 |
| WebView2 Runtime | Win10 1803+ / Win11 自带 | 无需捆绑 |

## 6. 错误处理

| 失败点 | 现象 | 处理 |
|---|---|---|
| SealGo WASM fetch 失败 | `loadSealGo()` reject | 沿用 v12 readyPromise 失败重置（CLAUDE.md 坑 #12）；UI toast 提示 |
| `crypto.subtle` 缺失 | Linux WebKitGTK 未启用 localhost | 启动时 `if (!crypto.subtle) throw new Error('secure context required')`，配合 localhost 插件默认开启，理论不可达 |
| FS Access 不支持 | `supportsFsAccess() === false` | 沿用 v15 内存降级 + toast |
| Worker 创建失败 | 内存不足 | 沿用 v18 坑 #11 worker-kdf 回退主线程派生 |
| Tauri 启动失败 | 端口占用 / webview2 缺失 | Tauri 默认 panic 弹系统对话框；Windows 由 WebView2 bootstrapper 兜底 |

## 7. 测试策略

### 7.1 不变（保留）

- 97 个 vitest 用例全跑通（协议级 / store / stream / manifest / panel-error / i18n / archive / decrypt-error / progress-meter）
- WASM e2e `WASM_E2E=1` 门控不变
- `tsc -b` 零错误

### 7.2 新增

- **冒烟测试脚本**（手测，不进 CI）：Windows 双击 exe → 拖一个 1 MB 文件分割 → 拖回切片合并 → 校验哈希。
- **CI 构建产物校验**：`tauri-action` 出包后 `ls -la` 确认 `*.msi / *.deb / *.AppImage / *.apk` 至少各一个。
- **WebKitGTK secure context 自检**：CI 在 ubuntu 构建完后启动 AppImage（headless 不可跑，仅检查文件存在）。

**不做**：E2E 跨端 UI 自动化（Playwright / WebDriver）——投入产出比低，手工冒烟 5 分钟就够。

## 8. 发布与签名

### 8.1 GitHub Actions

`.github/workflows/tauri-build.yml`：

```yaml
on:
  push:
    tags: ['v*']

jobs:
  build-windows:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable
      - uses: tauri-apps/tauri-action@v0
        with:
          projectPath: .
          tauriScript: cargo tauri build
  build-linux-android:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        target: [linux, android]
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable
        with:
          targets: ${{ matrix.target == 'android' && 'aarch64-linux-android,armv7-linux-androideabi,i686-linux-android,x86_64-linux-android' || '' }}
      - if: matrix.target == 'android'
        uses: android-actions/setup-android@v3
      - if: matrix.target == 'android'
        run: cargo tauri android init && cargo tauri android build -- --apk
      - if: matrix.target == 'linux'
        run: cargo tauri build --config src-tauri/tauri.linux.conf.json
      - uses: tauri-apps/tauri-action@v0
        with:
          projectPath: .
```

密钥：

- `TAURI_SIGNING_PRIVATE_KEY` + `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`（用于 Updater，**本期不用**，占位即可）
- `ANDROID_KEYSTORE_BASE64` / `ANDROID_KEY_ALIAS` / `ANDROID_KEY_PASSWORD`（用于 release APK 签名；debug 期可省略）

### 8.2 产物上传

- Windows / Linux 走 `tauri-action` 自动上传 GitHub Release
- Android 走 `actions/upload-artifact` + 手工附加 Release

## 9. 工程红线与节奏

### 9.1 红线

- **不能动** `app/src/lib/`、`app/src/components/`、`app/public/wasm/`、`app/src/test/`
- **vite.config.ts 只允许**加 `base: './'` 一行
- **不能引新前端依赖**（`@tauri-apps/api` 不引入）
- **Rust 依赖只允许**：`tauri`、`tauri-build`、`tauri-plugin-localhost`、`portpicker`（Linux）
- **三端构建必须 green** 才允许合 PR

### 9.2 节奏（每个勾独立可验证）

| 步 | 内容 | 验证 | 提交粒度 |
|---|---|---|---|
| 0 | v18 收尾（解冲突 + commit） | `git status` 干净 | 1 commit |
| 1 | `cargo tauri init` + `tauri.conf.json` 基础 | `cargo tauri dev` 起得来看得见 UI | 1 commit |
| 2 | vite.config.ts `base:'./'` + CSP | `cargo tauri build` 出 msi | 1 commit |
| 3 | Linux localhost 插件 + linux conf | CI ubuntu build 绿 | 1 commit |
| 4 | Android init + icon + conf | `cargo tauri android build -- --apk` 出 debug APK | 1 commit |
| 5 | GitHub Actions 三端流水线 | push tag 触发三端 release | 1 commit |
| 6 | 文档 + CLAUDE.md v19 章节 + 收尾 commit | 三端各跑一次 1 MB 文件 split→merge，对结果 SHA-256 与原始文件一致 | 1 commit |

### 9.3 回退策略

任何一步卡死 → 回滚到上一个勾的 commit。`src-tauri/` 是独立目录，删除即回滚。

## 10. 已明确的取舍（ponytail）

- **不做** Tauri command / invoke——纯前端足够，壳不暴露任何 IPC。
- **不做** 多窗口 / 系统托盘 / 菜单——单窗口够用。
- **不做** 自动更新（tauri-plugin-updater）——v19 范围内不引，未来需要再加。
- **不做** iOS / macOS——不在诉求。
- **不做** FS Access 原生桥接——v15 已有降级路径。
- **不做** E2E UI 自动化测试——冒烟手测 5 分钟够。
- **不改** 任何 `app/` 内业务代码——只加 `src-tauri/`。

## 11. 风险与开放问题

| 风险 | 概率 | 影响 | 缓解 |
|---|---|---|---|
| WebKitGTK localhost 插件与 SealGo WASM 兼容性 | 低 | 高 | 步骤 3 单独验证；失败则回退 WebKitGTK 内存模式（功能可用，仅 crypto 性能略降） |
| Android NDK / SDK 版本兼容性 | 中 | 中 | 用 `tauri-action` 自带 setup-android；固定 NDK 26 |
| v18 收尾与新工作交织 | 中 | 低 | 步骤 0 单独一个 commit 完成，与后续 Tauri 工作隔离 |
| CSP 过严导致 WASM / Worker 失败 | 低 | 高 | 步骤 2 手工验证一次再推后续步骤 |
| Windows 便携 exe 与 NSIS 冲突 | 低 | 低 | bundle targets 同时开两者，二者不互斥 |

## 12. 验收清单

- [ ] `git status` 干净
- [ ] `cd app && npm run build` 零错误
- [ ] `cd app && npx vitest run` 97/97 通过
- [ ] `cargo tauri build`（Windows 本机）出 `.msi` + 便携 `.exe`
- [ ] GitHub Actions 三端构建绿
- [ ] Android APK 安装到真机 → 拖文件分割 → 合并 → 校验哈希通过
- [ ] Linux AppImage 双击运行 → 同上冒烟通过
- [ ] CLAUDE.md 加 v19 章节，记录 Tauri 架构、CSP 红线、localhost 插件用途
