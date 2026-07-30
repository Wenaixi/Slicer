# Slicer 项目规范与记忆库

> 项目根：`D:\newC\stick2\Slicer`（Vite + React 19 + TypeScript + Tailwind CSS v4 + Tauri v2）
> 定位：纯前端高性能文件分割/合并工具，可选 SealGo 密码加密，黑白极简 + Apple 流体动效，三端（Windows / Linux / Android）打包。
> 最后更新：2026-07-30

## 1. 项目结构

```
Slicer/
├── app/                       # 前端工程（Vite + React）
│   ├── public/wasm/           # SealGo WASM 资产
│   ├── src/
│   │   ├── lib/               # 纯逻辑层（无 React 依赖）
│   │   │   ├── sealgo.ts      # WASM 加载器（单例 + instantiateStreaming 兜底）
│   │   │   ├── crypto.ts      # 加密高层封装（Argon2id 派生、切片加/解密、魔数检测）
│   │   │   ├── split.ts       # 分割参数计算、命名规范
│   │   │   ├── merge.ts       # 切片文件名解析、分组、连续性校验
│   │   │   ├── store.ts       # 全局状态（主题/Tab，useSyncExternalStore 手写）
│   │   │   ├── toast.ts       # 轻量 Toast store
│   │   │   ├── fs-access.ts   # File System Access API 适配
│   │   │   ├── password-gen.ts # CSPRNG 密码生成器
│   │   │   ├── perf.ts        # 加密吞吐量估算
│   │   │   ├── stream-split.ts # 流式分割执行器
│   │   │   ├── stream-merge.ts # 流式合并执行器
│   │   │   ├── resume.ts      # 断点续传：probeResumePlan + sessionStorage
│   │   │   ├── archive.ts     # ZIP 打包/解压（fflate）
│   │   │   ├── cross-tab.ts   # 跨标签进度共享
│   │   │   ├── progress-meter.ts # 实时吞吐仪表
│   │   │   ├── virtualize.ts  # 轻量虚拟滚动
│   │   │   ├── decrypt-error.ts # 解密错误分类
│   │   │   ├── worker-kdf.ts  # Worker KDF 后台派生
│   │   │   ├── manifest.ts    # 切片清单 SHA-256 完整性校验
│   │   │   ├── panel-error.ts # 面板错误兜底
│   │   │   ├── i18n.ts        # 双语字典
│   │   │   └── utils.ts       # 通用工具
│   │   ├── components/        # React 组件层（全部函数组件 + hooks）
│   │   │   ├── App.tsx
│   │   │   ├── Header.tsx / TabBar.tsx / Footer.tsx
│   │   │   ├── SplitPanel.tsx / MergePanel.tsx
│   │   │   ├── DropZone.tsx / FileCard.tsx / PasswordPanel.tsx
│   │   │   ├── ProgressBar.tsx / ToastStack.tsx
│   │   │   ├── ErrorBoundary.tsx / ErrorStack.tsx
│   │   │   ├── GlobalDropOverlay.tsx
│   │   │   └── hooks/         # useSyncExternalStore 包装层
│   │   ├── index.css          # Tailwind v4 入口 + 设计 token + 动效关键帧
│   │   ├── test/              # 14 个测试文件
│   │   └── main.tsx
│   ├── index.html
│   ├── vite.config.ts
│   └── package.json
├── src-tauri/                 # Tauri 壳（v2.11，wry + 系统 WebView）
│   ├── src/
│   ├── capabilities/
│   ├── icons/
│   ├── gen/                   # Android 工程（CI 生成后入 git）
│   ├── Cargo.toml             # [lib] name = "slicer_lib"（cdylib 给 Android）
│   ├── tauri.conf.json
│   ├── tauri.linux.conf.json
│   └── build.rs
├── .github/workflows/         # tauri-build.yml（Windows/Linux/Android 三 job 并行）
├── .gitignore                 # 根级统一
├── CLAUDE.md                  # 本文件
└── README.md                  # 公开介绍
```

## 2. SealGo 加密协议

### 2.1 文件格式（SealGo v1，100B 固定头）

```
[0..3]   magic "SC01"
[4]      version = 1
[5]      flags（bit0 = FlagPassword）
[6]      recipientCount（密码模式 = 1）
[7]      reserved
[8..39]  salt（32B，Argon2id 盐）
[40..63] noncePrefix
[64..67] chunkSize（默认 64*1024）
[68..79] Argon2 参数（time=3, memory=64MB, threads=4）
[92..99] 明文长度（uint64 LE）
[100..]  stanza + 加密块流
```

### 2.2 加密流程（分割端）

1. `salt = generateSalt()`（WASM `randBytes(32)`）
2. `fileKey = deriveKeyFromPassword(password, salt)`（Argon2id）
3. 每片：`cipher = encryptChunkWithKey(bytes, fileKey, salt)`
4. 文件名追加 `.sc`
5. 完成后 `fileKey.fill(0)` 擦除

**关键不变量：盐必须同时传给 derive 与 encrypt**。encryptWithKey 会把盐写入头部；解密端从头部读盐重新派生 fileKey，两者不一致则永远解不开。

### 2.3 解密流程（合并端）

1. `isSealGoFile(bytes)` 检测魔数
2. `salt = extractSalt(cipher)`（bytes[8..39]）
3. `fileKey = derivePasswordKey(password, salt)`
4. `plain = decryptChunkWithKey(cipher, fileKey)`
5. 认证失败即抛 `wrong-password` / `header-corrupt` / `cipher-corrupt`

### 2.4 WASM 桥 API（`window.SealGo`）

| 函数 | 签名 | 说明 |
|---|---|---|
| `generateKeypair()` | `() -> {public, private}` hex | 官方 X25519 |
| `encrypt(dataHex, pubHex)` | hex | 官方兼容 |
| `decrypt(dataHex, privHex)` | hex | 官方兼容 |
| `randBytes(n)` | `-> Uint8Array` | CSPRNG |
| `derivePasswordKey(pw, salt)` | `-> Uint8Array(32)` | Argon2id |
| `encryptWithKey(data, fileKey, salt)` | `-> Uint8Array` | 密码模式加密 |
| `decryptWithKey(data, fileKey)` | `-> Uint8Array` | 密码模式解密 |

WASM 源位于 `D:\newC\stick2\SealGo-src\wasm\main.go`（基于官方 v0.1.0 定制）。
重新编译：`cd D:\newC\stick2\SealGo-src; $env:GOOS="js"; $env:GOARCH="wasm"; go build -o dist/SealGo.wasm ./wasm/`，再拷贝到 `app/public/wasm/`。

## 3. 设计规范（黑白极简 + Apple 流体）

### 3.1 色彩

- 深色：`bg-zinc-950` 底，`bg-zinc-900` 卡片，`border-zinc-800`，文本 `zinc-100/zinc-400/zinc-500`
- 浅色：`light:` variant，`bg-white` 卡片，`border-zinc-200/300`
- 状态色（克制使用）：`emerald-400` 成功、`amber-400` 警告、`red-400` 错误、`blue-400` 信息

### 3.2 圆角

- 默认零圆角（极简工业感）
- 仅交互元素允许 4-10px：按钮 `:active` 缩放反馈、Toast、密码面板、进度条、状态徽标
- Tailwind 类：`rounded` / `rounded-md` / `rounded-lg`，不得超 `rounded-xl`

### 3.3 动效

| 场景 | 值 | 依据 |
|---|---|---|
| 按钮按压 | `transform: scale(0.97)` on `:active` | Apple：pointer-down 立即反馈 |
| 通用过渡 | 160ms `var(--ease-out)` | UI < 300ms，ease-out 起手快 |
| Toast 进入/退出 | 220ms，底部 `translateY(12px→0/8px)` 同路径 | Apple：空间一致性 |
| 进度条纹 | 0.9s `linear` infinite | 恒定运动用 linear |
| 拖拽遮罩 | 180ms `opacity` 淡入 | 仅透明度，无位移 |
| 减少动态 | `prefers-reduced-motion` 全局禁用动画 | Apple §14 |
| 触屏 hover | `@media (hover: none)` 禁用 hover 变换 | 防误触 |

**禁止项**：`transition: all`、`scale(0)` 起始、键盘触发场景加动画、超过 300ms 的 UI 动画。

### 3.4 字体

- 无衬线：`ui-sans-serif, system-ui, -apple-system, "PingFang SC", "Microsoft YaHei"`
- 等宽：`ui-monospace, SFMono-Regular, Menlo, Consolas`（所有数字/文件名/参数值用等宽）
- 大标题：`tracking-display`（-0.03em 负字距，Apple typography）

## 4. 工程规范

### 4.1 构建与验证

- 前端构建：`cd app && npm run build`（`tsc -b && vite build`，必须通过零错误）
- 前端开发：`cd app && npm run dev`
- 前端测试：`cd app && npm test`（Vitest + jsdom）
- Tauri 构建（Windows）：`cargo tauri build` → `.msi` + `nsis .exe`
- Tauri 构建（Linux）：`cargo tauri build --config src-tauri/tauri.linux.conf.json` → `.deb` + `.AppImage`
- Tauri 构建（Android）：`cargo tauri android build --apk --target aarch64 --split-per-abi`（需 JDK17 + Android SDK34 + NDK26；CI 自动；--target 用短名 aarch64 不是 rust triple）

### 4.2 提交规范

- 完成一个小组件/小模块/小修复立即 commit
- 消息格式：`type(scope): 简述`（feat/fix/chore/refactor/style/perf）
- 不 push 远程，除非用户明确批准

### 4.3 代码风格

- 注释全简体中文；公开 API 用 TSDoc 块注释
- 纯逻辑放 `src/lib/`（无 React 依赖，可单测）；组件只做组合与交互
- React hook wrapper 放 `src/components/hooks/`（`useAppState`/`useToasts`/`useLocale`/`useVirtualWindow`/`usePanelErrors`），禁止在 `lib/` 内 `import 'react'`
- 状态优先用 `useSyncExternalStore` 手写 store；不引 Redux/Zustand 等依赖
- 不加未要求的依赖（ponytail：能用原生就不用库）

### 4.4 性能红线

- 分割/合并主路径必须分块处理 + `await nextFrame()` 让出主线程，UI 不得冻结
- WASM 单例预热，避免首次加密卡顿
- fileKey 用完立即 `fill(0)` 擦除
- Blob 构造前 `bytes.slice().buffer as ArrayBuffer` 规避 SharedArrayBuffer 类型不兼容
- `sha256Hex` 必须先 `data.buffer.slice(byteOffset, byteOffset+byteLength)`，否则 subarray 越界 hash

## 5. Tauri 多平台架构

- **壳位置**：`src-tauri/`（仓库根，与 `app/` 平级，单代码库三端）
- **前端零改动**：除 `vite.config.ts` 加 `base: './'` 外，`app/src/` 业务代码零改；**不引** `@tauri-apps/api`（壳与前端单向依赖）
- **Linux 特殊**：必须 `tauri-plugin-localhost` + `portpicker`，否则 `crypto.subtle` 不可用（WebKitGTK secure-context 限制）
- **Android 特殊**：包名 `com.slicer.app`；`src-tauri/gen/android/` 由 CI `android init` 生成（不入 git）；签名目前 debug keystore，正式发布需 GitHub Secrets 注入 release keystore
- **CSP 红线**：`script-src 'self' 'wasm-unsafe-eval'`（Go wasm 必须）；`connect-src 'self' ipc: http://ipc.localhost`
- **CI 流水线**：`.github/workflows/tauri-build.yml` 触发 `v*` tag push + `workflow_dispatch`，四 job 并行
  - `build-windows`（`windows-latest`）→ `.msi + NSIS .exe`，tauri-action 写 Release
  - `build-linux`（`ubuntu-22.04`）→ 装 webkit2gtk-4.1 等，`configFile: src-tauri/tauri.linux.conf.json` → `.deb + .AppImage`
  - `build-android`（`ubuntu-latest`）→ Rust target `aarch64-linux-android` + Temurin JDK17 + `android-actions/setup-android@v3`（platform-tools / platforms;android-34 / build-tools;34.0.0 / ndk;26.1.10909125）+ `cargo install tauri-cli` + `cargo tauri android init` + `cargo tauri android build --apk --target aarch64 --split-per-abi` → `gh release upload` 上传 arm64 APK
  - `build-html-zip` → `npm run build` + zip `app/dist` → softprops 上传 portable HTML
- **Android CLI 坑**（已踩）：
  1. `--target` 合法值是短名 `aarch64`/`armv7`/`i686`/`x86_64`，**不是** rust triple `aarch64-linux-android`（会 invalid value）
  2. `cargo tauri android build` **默认就是 release**，不要再加 `--release`（会 unexpected argument）
  3. `android-actions/setup-android@v3` 的 `packages` 必须**单行空格分隔**，`package-list` 输入无效；多行 `|` 会被当成一个包名
  4. 上传用 `find ... -print0 | xargs -0 gh release upload "${{ github.ref_name }}" --clobber`（glob 在 shell 不展开；tagName 不要再加 `v` 前缀）
  5. universal debug 四 ABI ≈ 433MB；release + arm64 only + split-per-abi 目标 ≈ 30MB
  6. **Maven Central 429**：GHA 出口 IP 常被限流。`~/.gradle/init.gradle` + settings.gradle 前置 `https://maven-central.storage-download.googleapis.com/maven2/`；构建 step 3 次退避重试

## 6. 测试基线

- Vitest + jsdom + @testing-library/react
- 协议级（crypto/merge/split/stream-split/stream-merge/resume/archive/decrypt-error/progress-meter/i18n/manifest/worker-kdf）常跑
- WASM e2e 默认跳过（jsdom 兼容性边界，`WASM_E2E=1` 门控）
