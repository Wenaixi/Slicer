# Slicer 项目规范与记忆库

> 项目根：`D:\newC\stick2\Slicer\app`（Vite + React 19 + TypeScript + Tailwind CSS v4）
> 定位：纯前端高性能文件分割/合并工具，可选 SealGo 密码加密，黑白极简 + Apple 流体动效。
> 最后更新：2026-07-30（v18 review-tdd 收尾 + v19 Tauri 多平台打包启动）

## 1. 项目结构

```
app/
├── public/wasm/            # SealGo WASM 资产（SealGo.wasm + wasm_exec.js）
├── src/
│   ├── lib/                # 纯逻辑层（无 React 依赖）
│   │   ├── sealgo.ts       # WASM 加载器（单例，instantiateStreaming + buffer 兜底）
│   │   ├── crypto.ts       # 加密高层封装（Argon2id 派生、切片加/解密、魔数检测）
│   │   ├── split.ts        # 分割参数计算、命名规范
│   │   ├── merge.ts        # 切片文件名解析、分组、连续性校验
│   │   ├── store.ts        # 全局状态（主题/Tab，useSyncExternalStore 手写）
│   │   ├── toast.ts        # 轻量 Toast store（进入/退出动画标记）
│   │   ├── fs-access.ts    # File System Access API 适配（pickSaveLocation/pickFolderAndCreateFile/supportsFsAccess）
│   │   ├── password-gen.ts # CSPRNG 密码生成器
│   │   ├── perf.ts         # 加密吞吐量估算 + formatEstimateSeconds
│   │   ├── stream-split.ts # 流式分割执行器（File.slice 零拷贝 + onChunk 回调 + skipIndices 续传）
│   │   ├── stream-merge.ts # 流式合并执行器（明文/加密统一走 onPlainChunk + StreamMergeError 错误分类）
│   │   ├── resume.ts       # 断点续传：probeResumePlan + sessionStorage 进度
│   │   ├── archive.ts      # ZIP 打包/解压（fflate）：detectArchiveKind/packAsZip/unzipAll/filterChunkEntries
│   │   ├── cross-tab.ts    # 跨标签进度共享：BroadcastChannel 'slicer:split-progress'
│   │   ├── progress-meter.ts # 实时吞吐仪表：指数滑动平均 MB/s + ETA + 已跳过切片计数
│   │   ├── virtualize.ts   # 轻量虚拟滚动：useVirtualWindow（无依赖，仅渲染可视区+缓冲带）
│   │   ├── decrypt-error.ts # 解密错误分类：wrong-password / not-sealgo / header-corrupt / cipher-corrupt
│   │   └── utils.ts        # formatBytes/downloadBlob/nextFrame/passwordStrength 等
│   ├── components/         # React 组件层（全部函数组件 + hooks）
│   │   ├── App.tsx         # 根布局、主题类名同步、WASM 预热
│   │   ├── Header.tsx      # 顶栏（品牌 + 快捷键提示 + 主题切换）
│   │   ├── TabBar.tsx      # 分割/合并 Tab（受控于 store.tab）
│   │   ├── SplitPanel.tsx  # 分割面板（核心）
│   │   ├── MergePanel.tsx  # 合并面板（核心）
│   │   ├── DropZone.tsx    # 拖拽区（dragenter/leave 计数防闪烁）
│   │   ├── FileCard.tsx    # 文件信息卡
│   │   ├── PasswordPanel.tsx # 密码输入 + 强度指示 + 显示切换
│   │   ├── ProgressBar.tsx # 进度条（流动条纹动画）
│   │   ├── ToastStack.tsx  # Toast 渲染栈
│   │   └── Footer.tsx      # 页脚说明
│   ├── index.css           # Tailwind v4 入口 + 设计 token + 动效关键帧
│   └── main.tsx            # 入口（同步初始主题防闪烁）
├── index.html
├── vite.config.ts          # react() + tailwindcss() 插件
└── package.json
```

## 2. SealGo 加密协议（必须遵守）

### 2.1 文件格式（SealGo v1，100B 固定头）

```
[0..3]   magic "SC01"
[4]      version = 1
[5]      flags（bit0 = FlagPassword）
[6]      recipientCount（密码模式 = 1，一次性密钥对填充）
[7]      reserved
[8..39]  salt（32B，Argon2id 盐，前端 generateSalt() 生成并传入）
[40..63] noncePrefix（24B base nonce 前 16B 由 stream 内部随机）
[64..67] chunkSize（默认 64*1024）
[68..79] Argon2 参数（time=3, memory=64MB, threads=4，encryptWithKey 写入）
[92..99] 明文长度（uint64 LE，encryptWithKey 写入）
[100..]  stanza（type=1, ephemeral_pub, encrypted_fileKey）+ 加密块流
```

### 2.2 加密流程（分割端）

1. `salt = generateSalt()`（WASM `randBytes(32)`）
2. `fileKey = deriveKeyFromPassword(password, salt)`（WASM `argon2.IDKey`，64MB/3轮/4线程）
3. 每个切片：`cipher = encryptChunkWithKey(bytes, fileKey, salt)`
4. 文件名追加 `.sc`（SealGo 官方加密扩展名）
5. 全部完成后 `fileKey.fill(0)` 擦除

**关键不变量：盐必须同时传给 derive 与 encrypt**。encryptWithKey 会把盐写入头部；解密端从头部读盐重新派生 fileKey，两者不一致则永远解不开。

### 2.3 解密流程（合并端）

1. 检测 `isSealGoFile(bytes)`（前 4 字节 = "SC01"）
2. `salt = extractSalt(cipher)`（bytes[8..39]）
3. `fileKey = derivePasswordKey(password, salt)`
4. `plain = decryptChunkWithKey(cipher, fileKey)`
5. 任一 chunk 认证失败即抛错（统一报“wrong password or corrupted file”）

### 2.4 WASM 桥 API（`window.SealGo`）

| 函数 | 签名 | 说明 |
|---|---|---|
| `generateKeypair()` | `() -> {public, private}` hex | 官方 X25519 |
| `encrypt(dataHex, pubHex)` | hex 版加密 | 官方兼容 |
| `decrypt(dataHex, privHex)` | hex 版解密 | 官方兼容 |
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

### 3.2 圆角（用户最新指示：克制而非零）

- 默认零圆角（极简工业感）
- 仅交互元素允许 4-10px：按钮 `:active` 缩放反馈、Toast、密码面板、进度条、状态徽标
- Tailwind 类：`rounded` / `rounded-md` / `rounded-lg`，不得超 `rounded-xl`

### 3.3 动效（emil-design-eng + apple-design 落地）

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

- 构建：`cd app && npm run build`（`tsc -b && vite build`，必须通过零错误）
- 开发：`npm run dev`
- 每次修改后必须跑一次 `npm run build` 验证 TS 零错误

### 4.2 提交规范

- 完成一个小组件/小模块/小修复立即 commit
- 消息格式：`type(scope): 简述`（feat/fix/chore/refactor/style/perf）
- 不 push 远程，除非用户明确批准

### 4.3 代码风格

- 注释全简体中文；公开 API 用 TSDoc 块注释
- 纯逻辑放 `src/lib/`（无 React 依赖，可单测）；组件只做组合与交互
- React hook wrapper 放 `src/components/hooks/`（例如 `useAppState`/`useToasts`/`useLocale`/`useVirtualWindow`/`usePanelErrors`）：包一层 `useSyncExternalStore` 或副作用后调用 `lib/` 的纯函数，禁止在 `lib/` 内 `import 'react'`
- 状态优先用 `useSyncExternalStore` 手写 store；不引 Redux/Zustand 等依赖
- 不加未要求的依赖（ponytail：能用原生就不用库）

### 4.4 性能红线

- 分割/合并主路径必须分块处理 + `await nextFrame()` 让出主线程，UI 不得冻结
- WASM 单例预热，避免首次加密卡顿
- fileKey 用完立即 `fill(0)` 擦除
- Blob 构造前 `bytes.slice().buffer as ArrayBuffer` 规避 SharedArrayBuffer 类型不兼容

## 5. 迭代路线

| 轮次 | 状态 | 目标 |
|---|---|---|
| v1-v15 | ✅ 完成 | 见 git log（v15 收尾五件套：批量ZIP/进度仪表/跨标签/虚拟滚动/错误分类 + 响应式） |
| v16 | ✅ 完成 | i18n 双语 store（zh 默认，localStorage 记忆）+ 字体三级分级 |
| v17 | ✅ 完成 | Split/Merge 全量 i18n：字典 130+ key |
| v18 | ✅ 完成 | Worker KDF 后台派生 + manifest SHA-256 完整性校验 + 面板内错误兜底（ErrorStack + panel-error store + ErrorBoundary）+ 跨 worktree review-tdd 收尾 22 项修复 |
| v19 | ✅ 完成 | Tauri v2 三端 WebView 打包（Windows .msi/.exe、Linux .deb/.AppImage、Android .apk 由 CI 出） |
| v20+ | ⏳ 待做 | Android release keystore + 真机冒烟、icon 品牌化、Mac/iOS（如需）、Updater |

## 6. 已修复的坑（防止回归）

1. **盐不一致**：encryptWithKey 必须接收与派生 fileKey 相同的盐，否则解密失败。已在 WASM 签名中强制传 salt。
2. **SharedArrayBuffer 类型**：`new Blob([uint8])` 会报 TS2322，必须 `uint8.slice().buffer as ArrayBuffer`。**`sha256Hex`（manifest.ts）还要先 `data.buffer.slice(byteOffset, byteOffset+byteLength)`**，否则未来 subarray 子视图越界 hash（CLAUDE.md 4.4 红线）。
3. **wasm_exec.js 占位**：GitHub release 中的 wasm_exec.js 是 14B 占位文本，必须用本地 Go 安装目录的真实文件替换。
4. **拖拽闪烁**：window 级 dragenter/leave 需用计数器（原始 HTML 版用 dragCounter），组件内 DropZone 简化版用单 ref 标记；多层级嵌套时注意冒泡。
5. **jsdom + Go WASM 不稳定**：fetch('/wasm/SealGo.wasm') 在 jsdom 报 ERR_INVALID_URL → 用 isNode 判断走 node:fs；"Go program has already exited" 反复出现 → 决策：协议级测试常跑，WASM e2e 用 `WASM_E2E=1` 门控（describe.skip 默认）。
6. **TS6133 死变量**：tsc -b 默认 noUnusedLocals=true，每个 `Edit` 后必须保证引入的全部被引用，否则编译失败。
7. **planTotalParts 早期笔误**：executeSplit 内 `probeResumePlan(..., planTotalParts)` 未声明 → 组件已 `const plan = computeChunkPlan(file.size, options)`，直接传 `plan.totalParts`。
8. **直写磁盘 fire-and-forget write**（review-tdd v18 抓出）：onChunk/onPlainChunk 内 `void (async () => await handle.write())()` + close 早于 write → 输出文件截断 / 数据丢失 / 关闭 tab 丢切片。**根治**：onChunk 签名改 `async (chunk) => Promise<void>`，stream-split/stream-merge 内 for 循环 await 回调；SplitPanel 维护 `writePromises[]` 在 streamSplit 后 `await Promise.allSettled(writePromises)` 再 setResults/toast。
9. **decrypt-error 分类顺序**（review-tdd v18）：原代码先 length<100 → not-sealgo，但魔数 SC01 正确但长度不足应归 header-corrupt。**根治**：先检查魔数 → 错归 not-sealgo；对但 length<100 → header-corrupt。**注意**：已有测试反向固化错误行为（test:22-27），必须同步修正测试断言。
10. **resume.ts infix 命名双重去扩展名**（review-tdd v18）：line 23 已去一次，line 104 又去一次 → `big.tar.gz` 解析得 `big`，正则匹配不上真实切片 `big.tar_part1.gz`。**根治**：parseIndex 的 infix 分支只对入参 baseName 做正则转义，不再二次去扩展名。同时补 `_partN.ext` 形态支持（与 archive.ts:77 一致）。
11. **worker-kdf 响应不校验 id**（review-tdd v18）：旧响应可能错位完成新请求 → 派生错位 fileKey → 生成无法解密的切片。**根治**：onmessage 内比对 ev.data.id 与当前 pending，不匹配丢弃；pending 改 Map<id, {resolve, reject}> 支持并发；counter 改为 per-dispatcher 闭包避免跨实例污染。
12. **sealgo readyPromise 失败永久缓存**（review-tdd v18）：rejected Promise 永不重置 → 临时网络错误后整页刷新才能恢复。**根治**：attempt 上挂 .catch 失败时若缓存仍是自己则置 null，下次调用重新发起。
13. **sealgo Node 依赖警告**（review-tdd v18）：`node:fs/promises` / `node:path` 被 Vite 浏览器 externalize。**根治**：Node 依赖拆到 `sealgo-node.ts`；主线程用 `/* @vite-ignore */` 动态 import 阻止 Rolldown 静态分析。
14. **crypto-worker.ts 整套死代码**（review-tdd v18）：7 个导出（WorkerRequest/WorkerResponse/initCryptoWorker/deriveKeyInWorker/encryptInWorker/decryptInWorker/randInWorker）全仓零引用；crypto.ts:34 已切换到 `./worker-kdf`。**根治**：整体删除文件，保留 worker-kdf.ts 单一来源。
15. **lib 下 React hook 倒灌**（review-tdd v18）：store.ts / toast.ts / i18n.ts / virtualize.ts / panel-error.ts 都静态 import React，违反 4.3 节「纯逻辑放 lib」。**根治**：拆为「lib/ 纯函数 store + components/hooks/ React hook wrapper」两份，调用方只 import hook。
16. **archive unzipSync 主线程阻塞**（review-tdd v18）：unzipAll 暴露 async 但内部 `unzipSync(buf)` 同步解压整包。**根治**：入口 `await new Promise(r => setTimeout(r, 0))` 让出主线程一帧（ponytail 偏好）；或改 fflate 异步 Unzip 流式。
17. **fs-access pickSaveLocation 取消 vs 权限**（review-tdd v18）：AbortError 与权限失败都 return null，调用方无法区分。**根治**：catch 内 AbortError → null 静默，其他 DOMException → throw 区分。
18. **cross-tab BroadcastChannel 不重放历史消息**（review-tdd v18）：新订阅者错过订阅前的 start/done/abort。**根治**：broadcastProgress 把 split-progress 写 sessionStorage；subscribeProgress 注册时 `readLastEvent()` 补发一次。
19. **MergePanel 密码校验前创建句柄**（review-tdd v18）：createWritable 后密码不足直接 return 未 close。**根治**：密码校验前置到函数最开头；try/finally 兜底 close。
20. **stream-merge 每片重复派生 Argon2id**（review-tdd v18）：100 片同 salt 各派生一次 = 6.4GB 内存压力 + 100s 耗时。**根治**：循环外派生一次 fileKey 缓存，循环内 `saltEquals` 校验同组后 `decryptChunkWithKey` 复用；finally 擦除 fileKey。
21. **SplitPanel useEffect 依赖漏 options.naming**（review-tdd v18）：续传串味——旧 part 命名的 completedIndices 被误用于 infix 模式。**根治**：依赖补 `options.mode/sizeValue/sizeUnit/countValue/naming/encrypt`，对比用 `optionsKey()` 序列化（剥离 password）。
22. **split-panel onChunk 后未等写盘就 setResults**（review-tdd v18）：详见坑 #8；streamSplit 同步 resolve → setResults/clearProgress/broadcastProgress → toast「成功」，但 write Promise 仍在事件队列。**根治**：见 #8。
23. **续传后下载 manifest 只含本轮切片**（review-tdd v18）：results 只含本轮新生成切片，跳过切片不进 manifest → 不完整校验清单。**根治**：`collectAllChunks()` 合并 results + 磁盘已有切片，按 index 升序排。
24. **manifest.ts sha256Hex 必先 .slice()**（v18 1911c71 修复）：subarray 子视图的 .buffer 指向整块 backing buffer，必须 `data.buffer.slice(byteOffset, byteOffset+byteLength)` 切出对应区间；ArrayBuffer 直接透传。见坑 #2。
25. **manifest.ts parseManifest 缺 chunks 条目结构校验**（review-tdd v18）：仅校验三个顶层字段，chunks=[null] 会 TypeError 击穿 runVerify。**根治**：每条 chunk 校验 `typeof c.name==='string' && typeof c.size==='number' && typeof c.sha256==='string' && /^[0-9a-f]{64}$/.test(c.sha256)`。
26. **MergePanel 诊断字段误标**（review-tdd v18）：`file size: ${itemIndex}` — itemIndex 是切片序号不是文件大小，复制诊断误导开发者。**根治**：改为 `chunk index: ${err.itemIndex}` 或结构化字段。
27. **i18n 硬编码中文密度被严重低估**（review-tdd v18）：PasswordPanel 之外，9 个组件（Header / GlobalDropOverlay / ProgressBar / ErrorBoundary / DropZone / FileCard / SplitPanel / MergePanel）共 30+ 处硬编码中文。**根治**：v18 全量 i18n 收尾，新增 35+ 个 key（password.* / header.aria.* / overlay.* / progress.fallback / errorBoundary.* / dropzone.* / fileCard.* / split.result.* / split.manifest.* / split.toast.* / merge.toast.* 等）；STRENGTH_LABEL 改为接受 locale 的纯函数 `strengthLabels(locale)`。
28. **downloadManifest 续传漏收磁盘切片**（v18 收尾补修）：SplitPanel.downloadManifest 直接传 results，未走 collectAllChunks → 续传场景下被跳过的切片在 manifest 缺失，verifyChunksAgainstManifest 报全 missing。**根治**：downloadManifest 先 `await collectAllChunks(results, dirHandleRef.current, resumeMode)` 再 buildManifest，toast count 用 full.length。
29. **parseManifest 缺 chunk 条目结构校验**（v18 收尾补修）：仅校验顶层三字段，chunks=[null] / chunks 含非法 sha256 会 TypeError 击穿 runVerify。**根治**：每条 chunk 校验 `c && typeof c.name==='string' && typeof c.size==='number' && typeof c.sha256==='string' && /^[0-9a-f]{64}$/.test(c.sha256) && typeof c.index==='number'`，不通过整个 parseManifest 返 null。

## 6.5 Android 工程脚手架 — 本机受限（v19 Task 8）

- **现实约束**：本机（`D:\newC\stick2\Slicer`）没有 Android SDK，也没有可用的 Java 工具链（`JAVA_HOME` 指向 `D:\Program Files (x86)\Microsoft Visual Studio\Shared\Android\openjdk\jdk-21.0.8`，但 `bin\java.exe` 实际不存在）。`cargo tauri android init` 直接拒绝继续并提示走手工安装流程（错误原文见 `docs/tauri-android-init-blocked.md`）。
- **本任务完成范围**：
  - 安装 4 个 Rust Android 编译目标成功：`aarch64-linux-android` / `armv7-linux-androideabi` / `i686-linux-android` / `x86_64-linux-android`。
  - 确认 `src-tauri/gen/android/` 目录未生成（`cargo tauri android init` 在 SDK 检测失败后立即终止）。
  - 不手工伪造 Gradle 工程，也不安装 Android SDK；脚手架与首版 APK 全部交给 GitHub Actions 端的 `ubuntu-latest` runner（见 §7.6）。
- **后续可由 CI 自动处理的事项**：
  1. 安装 JDK 17、Android SDK command-line tools、build-tools、platform-tools、NDK；
  2. 重跑 `cargo tauri android init` 生成 `src-tauri/gen/android/`；
  3. 改写 `app_name = Slicer`、签名密钥从 Secrets 注入；
  4. 跑 `cargo tauri android build -- --apk` 产出 APK 工件。
- **回归断言**：未来本机若配齐 SDK，应再次执行 `cargo tauri android init`，生成的文件如未与本次 commit 期望一致，先看 `docs/tauri-android-init-blocked.md` 再决定是否回滚。

## 7. 断点续传架构（v10）

### 7.1 双轨持久化

- **磁盘层**：File System Access API 选目录，onChunk 回调逐切片直写（`getFileHandle({create:true}) + createWritable().write(blob).close()`）。切片存在即视为已完成。
- **会话层**：sessionStorage['slicer:split-progress']，每 500ms 持久化一次（含 fileName/fileSize/options/completedIndices/timestamps）。跨页面刷新可继续。

### 7.2 续传检测流程

1. 用户勾选「直写磁盘」→ 选目录（readwrite 模式）
2. 若存在 sessionStorage 进度 → 弹出「续传/重新开始」提示条
3. 续传按钮：把 completedIndices 装入 React state，启动时调 `probeResumePlan(dirHandle, file.name, options, plan.totalParts)`
4. probeResumePlan 遍历 dirHandle.entries()，按 part/number/infix 三种命名规范解析序号
5. 返回 SplitResumePlan { resumable, completedIndices, pendingIndices }
6. streamSplit 接收 `{skipIndices}`，循环内命中则 phase='skip'、bytesDone += chunkSize、不调用 encrypt、不生成 outBlob
7. 中断/取消时 saveProgress 保留；完成时 clearProgress

### 7.3 设计取舍

- **跳过切片不写 skip 标记文件**：磁盘已存在即完成，避免双重状态
- **进度保存 vs 写盘一致性**：onChunk 内 saveProgress 与直写并行，存在窗口期内 save 早于写完的极小概率 → 已通过完成态仅在所有 chunk 通过 streamSplit 循环后触发来收敛
- **不支持 showDirectoryPicker 的浏览器**：降级为内存模式（toast 提示）
- **parseIndex 同时支持 `.partN.sc` 加密后缀**：因为加密切片名 = 原始名 + `.sc`

## 7.4 流式架构统一（v11/v12）

- **分割端**：stream-split（File.slice 零拷贝 / 加密逐块物化）→ onChunk 回调 → 直写磁盘 or 内存累积
- **合并端**：stream-merge（明文走 arrayBuffer / 加密走 decryptChunkWithPassword）→ onPlainChunk 回调 → 直写磁盘（File/Folder）or 内存累积
- **压缩端**：packAsZip（fflate level=1 速度优先）/ unzipAll（魔数识别 ZIP/7z，7z 暂不支持）/ filterChunkEntries（按 part/number/infix 三种命名规范过滤）
- **快捷键**：S/M 会与浏览器内置冲突 → 改 Q/W；方向键 ← / → 保留

## 7.5 收尾五件套（v13-v15）

- **批量 ZIP**：merge.expandIncoming 解压时保留 ZIP 内相对路径（`/` → `.`），让 groupMergeFiles 按 baseName 归组；同组切片可来自多个 ZIP / 文件夹 / 散文件
- **进度可视化**：progress-meter（250ms 滑动窗口 + 指数平均 α=0.4）输出 mbps；estimateEtaSeconds 基于 mbps 推算剩余秒数；SplitPanel 在执行时显示 4 列仪表
- **跨标签进度**：cross-tab（BroadcastChannel `'slicer:split-progress'`）五种事件（start/progress/done/abort/resume），SplitPanel 订阅后显示「另一个标签页正在分割同一文件 · 已完成 N/M」
- **虚拟滚动**：virtualize（useVirtualWindow hook）只渲染可视区 + overscan 缓冲带，paddingTop/paddingBottom 占位维持总高度；SplitPanel 结果 >80 行启用，MergePanel 组内 >30 行启用
- **解密错误分类**：decrypt-error（classifyDecryptError）按密文头结构拆解为五类：wrong-password / not-sealgo / header-corrupt / cipher-corrupt / internal；MergePanel 出错时双 toast（类型标签 + 中文兜底建议）
- **响应式设计**：index.css 六段媒体查询：移动端 95% 字号 + 大标题字距 -0.04em；触屏目标最小 44px（Apple HIG）；横屏小屏 max-height: 480px 压缩 padding；pointer:coarse 强制最小高度

## 8. 测试基线

- 14 个测试文件，97 个用例（vitest + jsdom + @testing-library/react）
- 协议级（crypto/merge/split/stream-split/stream-merge/resume/archive/decrypt-error/progress-meter/i18n）常跑
- WASM e2e 默认跳过（jsdom 兼容性边界）
- 加密估算 `estimateEncryptedSize(plainSize, chunkSize)` 5 例覆盖边界
- archive 模块 11 例覆盖魔数识别 / ZIP 往返 / 切片过滤 / 命名建议
- decrypt-error 7 例覆盖魔数错/长度残缺/版本不支持/密码错误分类
- progress-meter 5 例覆盖累计/百分比/ETA 计算
- i18n 7 例覆盖默认中文/切换/持久化/未知 key/双语字典完整性

## 9. Tauri 多平台架构（v19）

- **壳位置**：`src-tauri/`（仓库根目录，与 `app/` 平级，单代码库三端）
- **构建命令**：
  - Windows: `cargo tauri build`（本机）→ `.msi` + `nsis .exe`
  - Linux: `cargo tauri build --config src-tauri/tauri.linux.conf.json`（CI ubuntu-latest）→ `.deb` + `.AppImage`
  - Android: `cargo tauri android build -- --apk`（CI ubuntu-latest）→ `.apk`
- **前端零改动**：除 `vite.config.ts` 加 `base: './'` 外，`app/src/` 业务代码零改；**不引** `@tauri-apps/api`（壳与前端单向依赖）。
- **Linux 特殊**：必须 `tauri-plugin-localhost` + `portpicker`，否则 `crypto.subtle` 不可用（详见后续坑 #31：Linux/secure-context 问题）。
- **Android 特殊**：包名 `com.slicer.app`；`src-tauri/gen/android/` 入 git；签名用 GitHub Secrets。
- **CSP 红线**：`script-src 'self' 'wasm-unsafe-eval'`（Go wasm 必须）；`connect-src 'self' ipc: http://ipc.localhost`。
- **设计文档**：`docs/superpowers/specs/2026-07-30-tauri-multiplatform-design.md`
- **实施计划**：`docs/superpowers/plans/2026-07-30-tauri-multiplatform-plan.md`
- **CI 流水线**（Task 10，commit `4630f0c`）：`.github/workflows/tauri-build.yml` 触发 `v*` tag push + `workflow_dispatch`，三个 job 并行互不阻塞：
  - **build-windows**（`windows-latest`）→ `tauri-action@v0` 出 `.msi + .exe`，自动创建 GitHub Release draft（`releaseDraft: true`、`prerelease: false`）
  - **build-linux**（`ubuntu-22.04`）→ 装 `libwebkit2gtk-4.1-dev/libssl-dev/libgtk-3-dev/libayatana-appindicator3-dev/librsvg2-dev`，`args: --config src-tauri/tauri.linux.conf.json` 强制覆盖 Linux 产物
  - **build-android**（`ubuntu-latest`）→ Rust target 四档（aarch64/armv7/i686/x86_64-linux-android）+ Temurin JDK17 + `android-actions/setup-android@v3`（platforms;android-34 / build-tools;34.0.0 / ndk;26.1.10909125）+ `cargo tauri android init` + sed 替换 `app_name=Slicer` 与包名 `com.slicer.app` + `cargo tauri android build -- --apk --debug` → `actions/upload-artifact@v4` 上传 APK（debug 签名，keystore 留待后续用 GitHub Secrets）
  - **未做**：CI secrets（Android release keystore 等后续任务）；Release notes 进阶模板；缓存 Cargo registry（首版保守，跑通再上 `Swatinem/rust-cache`）
