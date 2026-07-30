# Tauri Android 初始化受阻证据（v19 Task 8）

> 本文档记录在 `D:\newC\stick2\Slicer` 仓库上执行 `cargo tauri android init` 的现场结果。
> 目的：让后续 agent（特别是 CI 配置）直接复用本文件中的错误原文与已通过的子步骤，无需复跑失败命令。

## 1. 触发时间与分支

- 时间：2026-07-30
- 分支：`main`
- HEAD：`684f7cad99fb9fc0fbf63bbc73eceb404713d979`
- 任务：v19 路线表中「Android 初始化」一项（Task 8）。

## 2. 本机预飞环境

| 检查项 | 结果 |
|---|---|
| `Test-Path env:ANDROID_HOME` | `False`（未设置） |
| `Test-Path env:JAVA_HOME` | `True`，指向 `D:\Program Files (x86)\Microsoft Visual Studio\Shared\Android\openjdk\jdk-21.0.8` |
| `Get-ChildItem $env:JAVA_HOME\bin` | **目录不存在**（`ls: cannot access ...jdk-21.0.8/bin/`），`java -version` 报 `CommandNotFound` |
| `cargo tauri --version` | `tauri-cli 2.11.4` |
| `rustc -V` | `rustc 1.94.0 (4a4ef493e 2026-03-02)` |

**结论**：本机不具备 Android 工具链。

## 3. 已成功完成的子步骤

```powershell
rustup target add aarch64-linux-android armv7-linux-androideabi i686-linux-android x86_64-linux-android
```

`rustup target list --installed` 输出末尾：

```
aarch64-linux-android
armv7-linux-androideabi
i686-linux-android
wasm32-unknown-unknown
x86_64-linux-android
x86_64-pc-windows-msvc
```

四个 Android 目标全部安装成功，无需 SDK 即可完成。

## 4. 失败步骤与错误原文

```powershell
cd D:\newC\stick2\Slicer
cargo tauri android init 2>&1 | Tee-Object -FilePath $env:TEMP\tauri-android-init.log
```

完整 stderr（去除 ansi 颜色后）：

```
Info ANDROID_HOME not set, trying to locate Android SDK...
Error Android SDK not found at C:\Users\Administrator\AppData\Local\Android/Sdk
Error failed to ensure Android environment: Skipping Android Studio command line tools installation. Please go through the manual setup process described in the documentation: https://tauri.app/start/prerequisites/#android
```

退出码：`1`。

`src-tauri/gen/android/` 未生成；`src-tauri/gen/schemas/`（之前已存在）保持原状，且已在 `.gitignore` 排除。

## 5. 为什么不再尝试

- 任务约束明确禁止在本机安装 Android SDK（属于宿主环境初始化，非本任务范围）。
- 手工伪造 `src-tauri/gen/android/` 工程风险极高：Tauri v2 的 Android 子工程对 Gradle / AGP / Kotlin / Tauri plugin 版本有强约束，任何字段缺失都会让 `cargo tauri android build` 在 CI 上首跑即爆。
- 计划本身已声明 Android 走 CI（见 `CLAUDE.md` §7.6 中的 `Android 特殊` 行），本任务只是在本机做一次 "best effort local probe"。

## 6. 建议的 CI 步骤（供后续 agent 直接搬运）

```yaml
- name: Setup JDK 17
  uses: actions/setup-java@v4
  with:
    distribution: temurin
    java-version: 17

- name: Setup Android SDK
  uses: android-actions/setup-android@v3

- name: Cache Rust Android targets
  uses: Swatinem/rust-cache@v2
  with:
    cache-on-failure: true

- name: Install Rust Android targets
  run: |
    rustup target add aarch64-linux-android armv7-linux-androideabi i686-linux-android x86_64-linux-android

- name: Generate Android project
  working-directory: src-tauri
  run: cargo tauri android init

- name: Build debug APK
  working-directory: src-tauri
  env:
    TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}
    TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY_PASSWORD }}
  run: cargo tauri android build -- --apk --debug
```

## 7. 后续需要回写的事项

- CI 跑通后回写 `tauri.conf.json` 中 `productName` / `identifier` 是否需要调整（当前已是 `Slicer` / `com.slicer.app`，可直用）。
- 首版 APK 通过后，向 `CLAUDE.md` §5 路线表的 v19 行追加完成标记。
- 评估是否要把 `src-tauri/gen/android/` 真正入库（当前 `.gitignore` 未排除；按 v19 §7.6 决策需要入 git，建议保留并改 `.gitignore`）。
