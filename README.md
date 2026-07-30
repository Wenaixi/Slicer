# Slicer

> 高性能文件分割与合并工具｜Blazing-fast file splitter & merger

把一个大文件切成多个小片段，方便传输与备份；也可把片段还原回原文件。
可选 SealGo 密码加密（Argon2id + XChaCha20），AES-GCM-级 256-bit 安全。
单文件前端，无服务端，零账户零上传——所有处理在浏览器或本地 Tauri 壳内完成。

## 特性 / Features

- **极速分块**：File.slice 零拷贝流式切分，内存峰值只跟单切片大小有关
- **可选加密**：SealGo Argon2id 派生（64 MB / 3 轮 / 4 线程）+ AES-GCM 流式认证
- **断点续传**：检测磁盘切片续传，进度本地 sessionStorage 持久化
- **跨标签页进度**：BroadcastChannel 共享 split 状态
- **错误分类**：解密失败时给出 wrong-password / not-sealgo / header-corrupt / cipher-corrupt 五类诊断
- **ZIP 批量**：压缩包内自动识别切片并归组合并
- **三端可分发**：Windows MSI+NSIS、Linux deb+AppImage、Android APK
- **零账号零上传**：纯客户端计算，文件不离开本机
- **深色 / 浅色 / 中英双语**

## 预览 / Screenshots

（待补：插入 src/assets/hero.png 截图）

## 本地运行 / Run locally

需要 Node 24+ 与（可选）Rust 1.94+。

```powershell
git clone https://github.com/Wenaixi/Slicer.git
cd Slicer/app
npm install
npm run dev          # 启动 Vite 开发服务器，浏览器打开 http://localhost:5173
```

无 Rust 也能用纯浏览器版（Split / Merge / 加密 / 测试都跑得起来）。

### 跑测试

```powershell
cd Slicer/app
npm test
```

### 出 Tauri 桌面应用

```powershell
cd Slicer
cargo install tauri-cli --version "^2.0"
cargo tauri build
# 产物在 src-tauri/target/release/bundle/{msi,nsis,deb,appimage}/
```

### 出 Android APK

需要 JDK 17 + Android SDK 34 + NDK 26，建议走 GitHub Actions 自动出（见下）。

## 下载 / Downloads

切到 GitHub Releases 页下载以下构建产物：
- **Windows**：`Slicer_x.y.z_x64-setup.exe`（NSIS 安装包）
- **Linux**：`slicer_x.y.z_amd64.deb` 或 `Slicer_x.y.z_amd64.AppImage`
- **Android**：`slicer-android-apk`（GitHub Actions artifact）

## 技术栈 / Stack

| 层 | 选型 |
|---|---|
| 前端 | React 19 · TypeScript · Vite 8 · Tailwind CSS v4 |
| 加密 | SealGo WASM（Go → wasm32-wasi）+ Go argon2 + Go chacha20poly1305 |
| 切片流 | Web Streams + File.slice 零拷贝 |
| 跨标签 | BroadcastChannel |
| 桌面壳 | Tauri v2.11（wry + 系统 WebView） |
| 移动壳 | Tauri v2 Android（Chromium WebView） |
| 测试 | Vitest + jsdom + @testing-library/react，142 个用例 |

## 参与贡献 / Contributing

欢迎开 Issue、PR、翻译、维护者加入。Commit 规范见 `CLAUDE.md`。

## 协议 / License

MIT
