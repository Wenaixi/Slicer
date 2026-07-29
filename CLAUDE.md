# Slicer 项目规范与记忆库

> 项目根：`D:\newC\stick2\Slicer\app`（Vite + React 19 + TypeScript + Tailwind CSS v4）
> 定位：纯前端高性能文件分割/合并工具，可选 SealGo 密码加密，黑白极简 + Apple 流体动效。
> 最后更新：2026-07-30（v1 完成，进入第 2 轮深度迭代）

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
│   │   └── utils.ts        # formatBytes/downloadBlob/passwordStrength 等
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
| v1 | ✅ 完成 | 基础分割/合并/密码加密，构建通过 |
| v2 | 🔄 进行中 | 全局拖拽、键盘快捷键、Worker 加解密、主题过渡、错误边界、可访问性 |
| v3 | ⏳ 待做 | 大文件流式、zip 打包下载、性能压测、edge case 加固、视觉细节抛光 |

## 6. 已修复的坑（防止回归）

1. **盐不一致**：encryptWithKey 必须接收与派生 fileKey 相同的盐，否则解密失败。已在 WASM 签名中强制传 salt。
2. **SharedArrayBuffer 类型**：`new Blob([uint8])` 会报 TS2322，必须 `uint8.slice().buffer as ArrayBuffer`。
3. **wasm_exec.js 占位**：GitHub release 中的 wasm_exec.js 是 14B 占位文本，必须用本地 Go 安装目录的真实文件替换。
4. **拖拽闪烁**：window 级 dragenter/leave 需用计数器（原始 HTML 版用 dragCounter），组件内 DropZone 简化版用单 ref 标记；多层级嵌套时注意冒泡。
