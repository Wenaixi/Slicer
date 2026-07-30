# Slicer Tauri v2 多平台 WebView 打包实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `app/` 现有纯前端打包成 Windows .msi/.exe、Linux .deb/.AppImage、Android .apk，全程单代码库、零前端业务代码改动。

**Architecture:** 新增 `src-tauri/`（Tauri v2 Rust 壳）与 `app/` 平级。前端不引 `@tauri-apps/api`，壳与前端单向依赖。Linux WebKitGTK 通过 `tauri-plugin-localhost` 拿 secure context。三端构建由 GitHub Actions `tauri-action` 完成。

**Tech Stack:** Tauri v2.0 · Vite 6 · React 19 · TypeScript · Tailwind v4 · Rust 1.94 · GitHub Actions · `tauri-plugin-localhost`（仅 Linux）· `portpicker`（仅 Linux）

**Spec:** `docs/superpowers/specs/2026-07-30-tauri-multiplatform-design.md`

---

## 前置假设（执行前必须成立）

- 工作目录 `D:\newC\stick2\Slicer`，分支 `main`，HEAD `64ece59`。
- 本机已装：Rust 1.94 · Node 24 · npm 11。
- `app/` 当前 `npm install` 已就绪。
- GitHub 仓库已可由 `gh` CLI 推送（用于 Task 10 tag 触发 release）。

---

## 阶段 A — v18 收尾（Task 1-4）

### Task 1: v18 冲突收尾（解 4 个冲突文件）

**Files:**
- Modify: `app/src/lib/i18n.ts`（已手解，仅 stage 0 化）
- Modify: `app/src/lib/crypto.ts`（已手解，仅 stage 0 化）
- Modify: `app/src/components/MergePanel.tsx`（已手解，仅 stage 0 化）
- Modify: `app/src/components/SplitPanel.tsx`（已手解，仅 stage 0 化）

**上下文：** 4 个 UU 文件的工作树版本已采用 D 组方案（hooks 拆分 + fire-and-forget 根治），只需 `git add` 收口。所有保留侧与 CLAUDE.md §6 坑 #14-#27 修复意图一致。

- [ ] **Step 1: 确认工作树版本仍采用 D 组方案**

Run: `git -C D:\newC\stick2\Slicer diff --stat app/src/lib/i18n.ts app/src/components/MergePanel.tsx app/src/components/SplitPanel.tsx app/src/lib/crypto.ts`
Expected: 无 `<<<<<<<` / `>>>>>>>` 标记残留（grep 验证）

- [ ] **Step 2: 把 4 个冲突文件标记为已解决**

Run: `git -C D:\newC\stick2\Slicer add app/src/lib/i18n.ts app/src/components/MergePanel.tsx app/src/components/SplitPanel.tsx app/src/lib/crypto.ts`
Expected: `git status --short` 这 4 行变为 `M ` 或 `A ` 无 `UU`

- [ ] **Step 3: 把新文件（manifest / ErrorStack / 测试）暂存**

Run: `git -C D:\newC\stick2\Slicer add app/src/lib/manifest.ts app/src/components/ErrorStack.tsx app/src/test/manifest.test.ts app/src/test/panel-error.test.ts`
Expected: `git status --short` 4 个新文件变 `A `

- [ ] **Step 4: 提交 v18 收尾**

Run: `git -C D:\newC\stick2\Slicer commit -m "merge: v18 review-tdd 收尾 — 4 个冲突文件 + manifest/errorStack/test 入 main"`
Expected: HEAD 前进一格；`git status --short` 显示 `?? docs/` 和 `M CLAUDE.md` 但无 UU

- [ ] **Step 5: 验证设计文档可入栈**

Run: `git -C D:\newC\stick2\Slicer add docs/ && git -C D:\newC\stick2\Slicer commit -m "docs(design): Tauri v2 多平台 WebView 打包设计文档"`
Expected: 提交成功；`git status --short` 仅剩 `M CLAUDE.md`

---

### Task 2: 修 `manifest.ts:47` 的 subarray 越界 hash（坑 #24 闭环）

**Files:**
- Modify: `app/src/lib/manifest.ts:47`（把 `data.buffer` 换成 `data.buffer.slice(byteOffset, byteOffset+byteLength)`）

**Test:** `app/src/test/manifest.test.ts` 已有用例

**上下文：** CLAUDE.md §6 坑 #24 已明确：`sha256Hex` 必须 `data.buffer.slice(byteOffset, byteOffset+byteLength)`，否则未来传入 subarray 子视图会越界 hash 到 buffer 起始。这是 4.4 红线。

- [ ] **Step 1: 写失败测试**

在 `app/src/test/manifest.test.ts` 末尾追加（先看现有 import 行，沿用相同 import 风格）：

```typescript
import { describe, it, expect } from 'vitest'
import { sha256Hex } from '../lib/manifest'

describe('sha256Hex subarray 边界', () => {
  it('传入 buffer 中段 subarray 应只 hash 子视图，不越界到 buffer 起点', async () => {
    // 构造一个 16 字节 buffer，bytes[4..12] 是有效负载
    const backing = new Uint8Array(16)
    for (let i = 0; i < 16; i++) backing[i] = i
    const sub = backing.subarray(4, 12)
    // 正确结果应是 bytes [4,5,6,7,8,9,10,11] 的 SHA-256
    const expected = await crypto.subtle.digest('SHA-256', sub.slice().buffer)
    const expectedHex = Array.from(new Uint8Array(expected)).map(b => b.toString(16).padStart(2, '0')).join('')
    expect(await sha256Hex(sub)).toBe(expectedHex)
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd D:\newC\stick2\Slicer\app && npx vitest run src/test/manifest.test.ts -t "subarray 边界"`
Expected: FAIL（如果 sha256Hex 还没修，会 hash 整个 16 字节而非中段 8 字节）

- [ ] **Step 3: 修 `sha256Hex`**

修改 `app/src/lib/manifest.ts` 的 `sha256Hex` 实现（保留 TSDoc，只改 hash 前取 buffer 的一行）：

```typescript
/**
 * 计算 Uint8Array 的 SHA-256 十六进制摘要。
 * 必须 data.buffer.slice(byteOffset, byteOffset+byteLength)：
 * 直接传 data.buffer 会把 subarray 前面的字节也算进 hash（CLAUDE.md 4.4 红线 / 坑 #24）。
 */
export async function sha256Hex(data: Uint8Array): Promise<string> {
  const view = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer
  const digest = await crypto.subtle.digest('SHA-256', view)
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('')
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd D:\newC\stick2\Slicer\app && npx vitest run src/test/manifest.test.ts`
Expected: 所有 manifest 测试 PASS（原有用例 + 新 subarray 用例）

- [ ] **Step 5: 提交**

Run: `git -C D:\newC\stick2\Slicer add app/src/lib/manifest.ts app/src/test/manifest.test.ts && git -C D:\newC\stick2\Slicer commit -m "fix(manifest): sha256Hex 处理 subarray 子视图，闭环坑 #24"`
Expected: HEAD 前进一格

---

### Task 3: v18 全量测试 + 构建验证

**Files:** 无修改，只跑命令

- [ ] **Step 1: TypeScript 编译**

Run: `cd D:\newC\stick2\Slicer\app && npm run build`
Expected: `tsc -b && vite build` 零错误退出

- [ ] **Step 2: 全量 vitest**

Run: `cd D:\newC\stick2\Slicer\app && npx vitest run`
Expected: 全部用例 PASS（基线 97 个 + Task 2 新增 1 个 = 98）

- [ ] **Step 3: 确认 git 树干净**

Run: `git -C D:\newC\stick2\Slicer status --short`
Expected: 只剩 `M CLAUDE.md`（v18 章节更新留给 Task 4）

---

### Task 4: 更新 CLAUDE.md（v18 收尾 + v19 章节）

**Files:**
- Modify: `CLAUDE.md`（顶部「最后更新」改日期；§5 路线表 v18 状态改 ✅、v19 状态改为"进行中"；§6 补坑 #28；新增 §9 v19 章节）

- [ ] **Step 1: 改顶部日期**

```markdown
> 最后更新：2026-07-30（v19 Tauri 多平台打包启动）
```

- [ ] **Step 2: 更新 §5 路线表**

把 v18 行末「⏳ 待做」改为「✅ 完成」；v19+ 行内容改为：

```markdown
| v19 | 🔄 进行中 | Tauri v2 三端 WebView 打包（Windows/Linux/Android），单 src-tauri 壳 + 三份 conf |
```

- [ ] **Step 3: §6 补坑 #28**

在 §6 列表末尾追加：

```markdown
28. **Tauri Linux WebKitGTK secure context 缺失**（v19 计划）：`tauri://localhost` 在 WebKitGTK 上 `isSecureContext=false` → `crypto.subtle` 不可用 → Argon2id 派生失败。**根治**：启用 `tauri-plugin-localhost` 把内容改走 `http://localhost:<port>`，仅 Linux 用 `tauri.linux.conf.json` 覆盖。
```

- [ ] **Step 4: 新增 §9 v19 章节**

在文件末尾追加：

```markdown
## 9. Tauri 多平台架构（v19）

- **壳位置**：`src-tauri/`（仓库根目录，与 `app/` 平级）
- **构建命令**：
  - Windows: `cargo tauri build`（本机）
  - Linux: `cargo tauri build --config src-tauri/tauri.linux.conf.json`（CI ubuntu-latest）
  - Android: `cargo tauri android build -- --apk`（CI ubuntu-latest）
- **前端零改动**：除 `vite.config.ts` 加 `base:'./'` 外，`app/src/` 业务代码不动；不引 `@tauri-apps/api`。
- **Linux 特殊**：必须 `tauri-plugin-localhost` + `portpicker`，否则 `crypto.subtle` 不可用（见坑 #28）。
- **Android 特殊**：包名 `com.slicer.app`；`src-tauri/gen/android/` 入 git；签名用 GitHub Secrets。
- **CSP 红线**：`script-src 'self' 'wasm-unsafe-eval'`（Go wasm 必须）；`connect-src 'self' ipc: http://ipc.localhost`。
```

- [ ] **Step 5: 提交**

Run: `git -C D:\newC\stick2\Slicer add CLAUDE.md && git -C D:\newC\stick2\Slicer commit -m "docs(claude): v18 收尾 + v19 Tauri 章节"`
Expected: HEAD 前进一格；`git status --short` 完全干净

---

## 阶段 B — Tauri 脚手架（Task 5-6）

### Task 5: 安装 Tauri CLI + 初始化 src-tauri

**Files:**
- Create: `src-tauri/Cargo.toml`
- Create: `src-tauri/build.rs`
- Create: `src-tauri/tauri.conf.json`
- Create: `src-tauri/src/main.rs`
- Create: `src-tauri/src/lib.rs`
- Create: `src-tauri/capabilities/default.json`
- Create: `src-tauri/icons/`（多个 PNG + ICO）

- [ ] **Step 1: 全局安装 Tauri CLI**

Run: `cargo install tauri-cli --version "^2.0.0" --locked`
Expected: `cargo tauri --version` 输出 `tauri-cli 2.x.x`（耗时 5-10 分钟）

- [ ] **Step 2: 初始化 src-tauri**

Run: `cd D:\newC\stick2\Slicer && cargo tauri init --app-name Slicer --window-title Slicer --frontend-dist ../app/dist --dev-url http://localhost:5173 --before-dev-command "npm --prefix app run dev" --before-build-command "npm --prefix app run build" --identifier com.slicer.app --ci`
Expected: 创建 `src-tauri/` 目录，含 `Cargo.toml`、`tauri.conf.json`、`src/main.rs`、`src/lib.rs`、`capabilities/default.json`、`icons/`

- [ ] **Step 3: 修改 `vite.config.ts` 加 `base: './'`**

修改 `app/vite.config.ts`：

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
})
```

（如果文件已有其他字段，保留；只新增 `base: './'`）

- [ ] **Step 4: 修改 `tauri.conf.json` 关键字段**

把 `src-tauri/tauri.conf.json` 内容改为：

```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "Slicer",
  "version": "0.19.0",
  "identifier": "com.slicer.app",
  "build": {
    "frontendDist": "../app/dist",
    "devUrl": "http://localhost:5173",
    "beforeDevCommand": "npm --prefix app run dev",
    "beforeBuildCommand": "npm --prefix app run build"
  },
  "app": {
    "windows": [
      {
        "title": "Slicer",
        "width": 960,
        "height": 720,
        "minWidth": 640,
        "minHeight": 480,
        "resizable": true,
        "fullscreen": false
      }
    ],
    "security": {
      "csp": "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; connect-src 'self' ipc: http://ipc.localhost; style-src 'self' 'unsafe-inline'; img-src 'self' data:"
    }
  },
  "bundle": {
    "active": true,
    "targets": ["msi", "nsis", "deb", "appimage"],
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.icns",
      "icons/icon.ico"
    ]
  }
}
```

- [ ] **Step 5: 修改 `capabilities/default.json` 最小权限**

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "默认最小权限",
  "windows": ["main"],
  "permissions": ["core:default"]
}
```

- [ ] **Step 6: 验证 dev 启动（先看是否能 build）**

Run: `cd D:\newC\stick2\Slicer && cargo tauri build --debug 2>&1 | Select-Object -Last 30`
Expected: 编译成功（不报 link 错），`src-tauri/target/debug/slicer.exe` 存在

- [ ] **Step 7: 提交脚手架**

Run: `git -C D:\newC\stick2\Slicer add src-tauri/ app/vite.config.ts && git -C D:\newC\stick2\Slicer commit -m "feat(tauri): 初始化 src-tauri 壳 + vite base 适配"`
Expected: HEAD 前进一格；`src-tauri/` 全部入栈

---

### Task 6: Windows 本机构建出 .msi + .exe

**Files:** 无修改，跑构建命令

- [ ] **Step 1: 完整构建 release**

Run: `cd D:\newC\stick2\Slicer && cargo tauri build`
Expected: 输出 `src-tauri/target/release/bundle/msi/Slicer_0.19.0_x64_en-US.msi` 和 `nsis/Slicer_0.19.0_x64-setup.exe`（首次 10-20 分钟）

- [ ] **Step 2: 手工冒烟（用 PowerShell 验证文件存在 + 大小合理）**

Run: `Get-Item D:\newC\stick2\Slicer\src-tauri\target\release\bundle\msi\*.msi, D:\newC\stick2\Slicer\src-tauri\target\release\bundle\nsis\*.exe | Select-Object Name, @{N='SizeMB';E={[math]::Round($_.Length/1MB,2)}}`
Expected: 两个文件都存在，大小均在 3-15 MB 区间

- [ ] **Step 3: 提交产物路径到 .gitignore**

修改 `D:\newC\stick2\Slicer\.gitignore` 末尾追加：

```
# Tauri build artifacts
src-tauri/target/
src-tauri/gen/
```

Run: `git -C D:\newC\stick2\Slicer add .gitignore && git -C D:\newC\stick2\Slicer commit -m "chore: gitignore Tauri target 与 gen 产物"`

---

## 阶段 C — Linux 跨端（Task 7）

### Task 7: Linux WebKitGTK 兼容（tauri-plugin-localhost）

**Files:**
- Modify: `src-tauri/Cargo.toml`（加 `tauri-plugin-localhost`、`portpicker`）
- Modify: `src-tauri/src/main.rs`（cfg 分支装载 localhost 插件）
- Create: `src-tauri/tauri.linux.conf.json`

- [ ] **Step 1: 加依赖到 `Cargo.toml`**

`src-tauri/Cargo.toml` 的 `[dependencies]` 块末尾追加：

```toml
tauri-plugin-localhost = "2"
portpicker = "0.1"
```

Run: `cd D:\newC\stick2\Slicer && cargo check -p slicer 2>&1 | Select-Object -Last 10`
Expected: 编译通过

- [ ] **Step 2: 修改 `src-tauri/src/main.rs` 加 Linux 分支**

完整文件内容（覆盖）：

```rust
// 阻止控制台窗口（Windows release 模式）
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    let builder = tauri::Builder::default();

    // Linux WebKitGTK 上 tauri:// scheme 的 isSecureContext=false，
    // 导致 crypto.subtle 不可用（Argon2id 派生失败）。
    // 通过 localhost 插件把 webview 内容改走 http://localhost:<port> 拿 secure context。
    #[cfg(target_os = "linux")]
    let builder = {
        let port = portpicker::pick_unused_port().expect("no free port for localhost plugin");
        builder.plugin(tauri_plugin_localhost::Builder::new(port).build())
    };

    builder
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **Step 3: 修改 `src-tauri/src/lib.rs`（保持 Tauri v2 mobile 入口）**

```rust
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();

    #[cfg(target_os = "linux")]
    let builder = {
        let port = portpicker::pick_unused_port().expect("no free port for localhost plugin");
        builder.plugin(tauri_plugin_localhost::Builder::new(port).build())
    };

    builder
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **Step 4: 创建 `src-tauri/tauri.linux.conf.json`**

```json
{
  "app": {
    "security": {
      "csp": "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; connect-src 'self' http://localhost:*; style-src 'self' 'unsafe-inline'; img-src 'self' data:"
    }
  },
  "bundle": {
    "targets": ["deb", "appimage"]
  }
}
```

- [ ] **Step 5: Windows 本机验证仍可构建**

Run: `cd D:\newC\stick2\Slicer && cargo tauri build 2>&1 | Select-Object -Last 10`
Expected: 构建成功（Linux cfg 分支不影响 Windows）

- [ ] **Step 6: 提交**

Run: `git -C D:\newC\stick2\Slicer add src-tauri/ && git -C D:\newC\stick2\Slicer commit -m "feat(tauri): Linux WebKitGTK 通过 localhost 插件拿 secure context（坑 #28）"`
Expected: HEAD 前进一格

---

## 阶段 D — Android（Task 8-9）

### Task 8: Android 初始化 + 本地 debug 构建

**前置：** 本机已装 Android Studio（含 JBR/JDK 17+、SDK 34、NDK 26）。

**Files:**
- Create: `src-tauri/gen/android/`（cargo tauri android init 生成）
- Modify: `src-tauri/gen/android/app/src/main/res/values/strings.xml`（app_name）
- Modify: `src-tauri/gen/android/app/src/main/AndroidManifest.xml`（可选，权限微调）

- [ ] **Step 1: 添加 Rust Android targets**

Run: `rustup target add aarch64-linux-android armv7-linux-androideabi i686-linux-android x86_64-linux-android`
Expected: 4 个 target 安装成功

- [ ] **Step 2: 配置环境变量（PowerShell）**

Run:
```powershell
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
$env:NDK_HOME = "$env:ANDROID_HOME\ndk\26.1.10909125"  # 按本机实际 ndk 版本号调整
```
Expected: `Test-Path $env:ANDROID_HOME` 为 True

- [ ] **Step 3: 初始化 Android 工程**

Run: `cd D:\newC\stick2\Slicer && cargo tauri android init`
Expected: 生成 `src-tauri/gen/android/` 目录，含 `app/build.gradle.kts`、`settings.gradle` 等

- [ ] **Step 4: 改 app_name**

修改 `src-tauri/gen/android/app/src/main/res/values/strings.xml`：

```xml
<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="app_name">Slicer</string>
</resources>
```

- [ ] **Step 5: 构建 debug APK**

Run: `cd D:\newC\stick2\Slicer && cargo tauri android build -- --apk --debug`
Expected: 输出 `src-tauri/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk`

- [ ] **Step 6: 提交**

Run: `git -C D:\newC\stick2\Slicer add src-tauri/gen/android/ && git -C D:\newC\stick2\Slicer commit -m "feat(tauri): Android 工程初始化（gen/android 入栈）"`
Expected: HEAD 前进一格

**注意：** `src-tauri/gen/android/` 入 git 是 Tauri 官方推荐（虽然包含 build 产物路径，但配置文件都在里面）。

---

### Task 9: 创建 `tauri.android.conf.json`（可选优化）

**Files:**
- Create: `src-tauri/tauri.android.conf.json`

- [ ] **Step 1: 写覆盖配置**

```json
{
  "identifier": "com.slicer.app",
  "bundle": {
    "targets": ["apk"]
  }
}
```

- [ ] **Step 2: 提交**

Run: `git -C D:\newC\stick2\Slicer add src-tauri/tauri.android.conf.json && git -C D:\newC\stick2\Slicer commit -m "chore(tauri): Android 覆盖配置"`
Expected: HEAD 前进一格

---

## 阶段 E — CI/CD（Task 10）

### Task 10: GitHub Actions 三端流水线

**Files:**
- Create: `.github/workflows/tauri-build.yml`

- [ ] **Step 1: 写 workflow**

```yaml
name: Tauri Build

on:
  push:
    tags: ['v*']
  workflow_dispatch:

jobs:
  build-windows:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: npm
          cache-dependency-path: app/package-lock.json
      - run: npm --prefix app ci
      - uses: tauri-apps/tauri-action@v0
        with:
          projectPath: .
          tagName: ${{ github.ref_name }}
          releaseName: 'Slicer ${{ github.ref_name }}'
          releaseBody: 'See the assets to download this version.'
          releaseDraft: true
          prerelease: false

  build-linux:
    runs-on: ubuntu-22.04
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: npm
          cache-dependency-path: app/package-lock.json
      - run: npm --prefix app ci
      - name: Install Linux deps
        run: |
          sudo apt-get update
          sudo apt-get install -y libwebkit2gtk-4.1-dev libssl-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev
      - uses: tauri-apps/tauri-action@v0
        with:
          projectPath: .
          args: --config src-tauri/tauri.linux.conf.json
          tagName: ${{ github.ref_name }}
          releaseName: 'Slicer ${{ github.ref_name }}'
          releaseBody: 'See the assets to download this version.'
          releaseDraft: true

  build-android:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable
        with:
          targets: aarch64-linux-android,armv7-linux-androideabi,i686-linux-android,x86_64-linux-android
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: npm
          cache-dependency-path: app/package-lock.json
      - uses: android-actions/setup-android@v3
      - run: npm --prefix app ci
      - run: cargo tauri android init
      - run: cargo tauri android build -- --apk
      - uses: actions/upload-artifact@v4
        with:
          name: slicer-android-apk
          path: src-tauri/gen/android/app/build/outputs/apk/**/*.apk
```

- [ ] **Step 2: 提交**

Run: `git -C D:\newC\stick2\Slicer add .github/workflows/tauri-build.yml && git -C D:\newC\stick2\Slicer commit -m "ci(tauri): 三端打包流水线"`
Expected: HEAD 前进一格

- [ ] **Step 3: 推 tag 验证（可选，等用户批准再推）**

Run: `git -C D:\newC\stick2\Slicer tag v0.19.0 && git -C D:\newC\stick2\Slicer push origin v0.19.0`
Expected: GitHub Actions 触发，三端构建绿

**注意：** 根据 CLAUDE.md 「不轻易 push」，本步骤**默认不执行**，等主人明确批准。

---

## 阶段 F — 收尾（Task 11）

### Task 11: 最终验证 + 文档

**Files:**
- Modify: `CLAUDE.md`（§5 v19 状态改 ✅；§9 章节内容确认完整）

- [ ] **Step 1: 跑全量验证**

```powershell
cd D:\newC\stick2\Slicer\app
npm run build
npx vitest run
```

Expected: 构建零错误，98 用例全 PASS

- [ ] **Step 2: 更新 CLAUDE.md**

把 §5 路线表 v19 行改为：

```markdown
| v19 | ✅ 完成 | Tauri v2 三端 WebView 打包（Windows .msi/.exe、Linux .deb/.AppImage、Android .apk） |
```

- [ ] **Step 3: 提交**

Run: `git -C D:\newC\stick2\Slicer add CLAUDE.md && git -C D:\newC\stick2\Slicer commit -m "docs(claude): v19 Tauri 打包完成"`
Expected: HEAD 前进一格

---

## 自检清单

- [ ] 无 "TBD" / "TODO" / "略" / "同上" 占位
- [ ] 每个 Task 都有明确 Files / Steps / 验证命令 / Commit 命令
- [ ] 每个 Step 都给出具体代码或 PowerShell/Bash 命令
- [ ] 所有 `Run:` 命令在 Windows 本机可执行（PowerShell 或 bash）
- [ ] 每个 Task 之间通过 commit 隔离，可独立回滚
