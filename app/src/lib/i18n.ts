// 轻量 i18n：中英文切换（默认中文，localStorage 记忆）。
// 纯逻辑层：仅持有 locale + 订阅 + 切换 API + 字典 + t()，不依赖 React。
// React 订阅见 components/hooks/useLocale.ts。

export type Locale = 'zh' | 'en';

type Listener = () => void;

const STORAGE_KEY = 'slicer:locale';

let locale: Locale = (() => {
  if (typeof window === 'undefined') return 'zh';
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'zh' || saved === 'en') return saved;
  } catch {}
  return 'zh';
})();

const listeners = new Set<Listener>();

function emit() {
  listeners.forEach((l) => l());
}

export function subscribeLocale(l: Listener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function getLocaleSnapshot(): Locale {
  return locale;
}

export function setLocale(l: Locale): void {
  if (locale === l) return;
  locale = l;
  try {
    localStorage.setItem(STORAGE_KEY, l);
  } catch {}
  emit();
}

export function toggleLocale(): void {
  setLocale(locale === 'zh' ? 'en' : 'zh');
}

/** 字典（key 用英文便于阅读，组件里 t('header.split') 即可） */
const dict: Record<string, { zh: string; en: string }> = {
  'header.split': { zh: '文件分割', en: 'Split' },
  'header.merge': { zh: '切片合并', en: 'Merge' },
  'header.current': { zh: '当前', en: 'Current' },
  'header.shortcut': { zh: '快捷键', en: 'Shortcuts' },
  'header.theme.dark': { zh: '深色', en: 'Dark' },
  'header.theme.light': { zh: '浅色', en: 'Light' },
  'header.locale': { zh: 'EN', en: '中文' },
  'header.aria.switchMode': { zh: '切换模式', en: 'Switch mode' },
  'header.aria.toggleLanguage': { zh: '切换语言 / Switch language', en: '切换语言 / Switch language' },
  'header.aria.toggleTheme.dark': { zh: '切换到浅色模式', en: 'Switch to light mode' },
  'header.aria.toggleTheme.light': { zh: '切换到深色模式', en: 'Switch to dark mode' },

  // Footer
  'footer.01.title': { zh: '流式分块', en: 'Streaming chunks' },
  'footer.01.body': {
    zh: 'File.slice + 零拷贝 Blob 拼接，1GB 文件内存占用稳定在数 MB。',
    en: 'File.slice + zero-copy Blob concat; 1GB files stay within a few MB of RAM.',
  },
  'footer.02.title': { zh: 'SealGo WASM', en: 'SealGo WASM' },
  'footer.02.body': {
    zh: 'XChaCha20-Poly1305 认证加密 + Argon2id 密码派生，浏览器本地完成，数据零外发。',
    en: 'XChaCha20-Poly1305 AEAD + Argon2id KDF, fully in-browser. Zero data leaves your device.',
  },
  'footer.03.title': { zh: '智能归组', en: 'Smart grouping' },
  'footer.03.body': {
    zh: '三种切片命名规范自动识别，支持跨目录多批次追加去重拼接。',
    en: 'Auto-detects 3 chunk-naming conventions; dedupes and stitches batches across folders.',
  },

  // Split panel
  'split.drop.title': { zh: '拖拽单文件到此处', en: 'Drag a single file here' },
  'split.drop.hint': {
    zh: '支持任意格式：视频、镜像、文档包。纯本地处理，零上传。',
    en: 'Any format: videos, images, doc bundles. 100% local, zero upload.',
  },
  'split.params': { zh: '// 分割参数', en: '// Split parameters' },
  'split.mode.size': { zh: '按单文件大小', en: 'By chunk size' },
  'split.mode.size.desc': { zh: '指定每个切片的最大容量', en: 'Cap each chunk at a given size' },
  'split.mode.count': { zh: '按目标份数', en: 'By part count' },
  'split.mode.count.desc': { zh: '自动均分为固定数量', en: 'Split evenly into N parts' },
  'split.size.label': { zh: '单个切片大小', en: 'Chunk size' },
  'split.count.label': { zh: '切片份数', en: 'Part count' },
  'split.naming.label': { zh: '命名规范', en: 'Naming convention' },
  'split.naming.part': { zh: '原文件名.ext.part1（通用标准）', en: 'name.ext.part1 (standard)' },
  'split.naming.number': { zh: '原文件名.ext.001（分卷档案）', en: 'name.ext.001 (archive)' },
  'split.naming.infix': { zh: '原文件名_part1.ext（保留后缀）', en: 'name_part1.ext (keep ext)' },
  'split.preview.parts': { zh: '预计', en: 'Approx' },
  'split.preview.per': { zh: '单个约', en: 'each' },
  'split.preview.chunks': { zh: '个切片', en: 'chunks' },
  'split.preview.eta': { zh: '预计耗时', en: 'ETA' },
  'split.preview.argon': { zh: '（含 Argon2 派生 ~1s）', en: '(incl. Argon2 ~1s)' },
  'split.preview.encryptedTotal': { zh: '加密后总大小 ≈', en: 'Encrypted total ≈' },
  'split.preview.header': { zh: '（含头部 + 标签）', en: '(incl. header + tags)' },
  'split.directToDisk': { zh: '直写磁盘（流式下载，低内存占用）', en: 'Direct to disk (streaming, low RAM)' },
  'split.directToDisk.hint': {
    zh: '通过 File System Access API 选择一个文件夹，切片将立即落盘不驻留浏览器内存，适合超大文件。中断后下次打开同一文件可选择「续传」跳过已完成切片。',
    en: 'Pick a folder via File System Access API. Chunks land on disk immediately with constant RAM. Resume works after interruption.',
  },
  'split.encrypt': { zh: '启用 SealGo 加密（需要密码）', en: 'Enable SealGo encryption (requires password)' },
  'split.execute.split': { zh: '立即分割', en: 'Split now' },
  'split.execute.splitEncrypt': { zh: '加密并分割', en: 'Encrypt & split' },
  'split.execute.processing': { zh: '处理中…', en: 'Processing…' },
  'split.execute.cancel': { zh: '取消任务', en: 'Cancel' },
  'split.result.title': { zh: '分割完成', en: 'Split complete' },
  'split.result.total': { zh: '共', en: 'total' },
  'split.result.zip': { zh: '打包 ZIP', en: 'Pack as ZIP' },
  'split.result.bundle': { zh: '打包下载', en: 'Download bundle' },
  'split.result.all': { zh: '逐个下载全部', en: 'Download all' },
  'split.result.download': { zh: '下载', en: 'Download' },
  'split.result.zipTitle': { zh: '把所有切片打包成单个 ZIP 文件（合并端可直接拖入 ZIP 自动解压）', en: 'Pack chunks into a single ZIP (drop into Merge to auto-extract)' },
  'split.result.bundleTitle': { zh: '按顺序拼接为单文件下载', en: 'Concatenate into a single file download' },
  'split.result.encrypted': { zh: '加密', en: 'Encrypted' },
  'split.result.fail': { zh: '分割失败', en: 'Split failed' },
  'split.manifest.generating': { zh: '正在计算 SHA-256…', en: 'Computing SHA-256…' },
  'split.manifest.generated': { zh: 'manifest 已生成（{count} 个切片的 SHA-256）', en: 'Manifest generated (SHA-256 for {count} chunks)' },
  'split.meter.throughput': { zh: '吞吐', en: 'Throughput' },
  'split.meter.eta': { zh: 'ETA', en: 'ETA' },
  'split.meter.handled': { zh: '已处理', en: 'Processed' },
  'split.meter.skipped': { zh: '已跳过', en: 'Skipped' },
  'split.meter.calculating': { zh: '计算中…', en: 'Calculating…' },
  'split.resume.banner': { zh: '检测到上次未完成的「{name}」分割进度', en: 'Unfinished split of "{name}" detected' },
  'split.resume.completed': { zh: '已完成', en: 'completed' },
  'split.resume.chunks': { zh: '个切片', en: 'chunks' },
  'split.resume.btn': { zh: '续传', en: 'Resume' },
  'split.resume.fresh': { zh: '重新开始', en: 'Start fresh' },
  'split.crossTab.msg': { zh: '另一个标签页正在分割同一文件', en: 'Another tab is splitting the same file' },
  'split.crossTab.done': { zh: '对方已完成', en: 'completed there' },
  'split.crossTab.abort': { zh: '对方已取消', en: 'aborted there' },
  'split.virtual': { zh: '虚拟滚动（仅渲染', en: 'Virtualized (rendering' },
  'split.virtual.lines': { zh: '行）', en: 'rows)' },
  'split.warnLarge.title': { zh: '大文件提示', en: 'Large file notice' },
  'split.warnLarge.body': {
    zh: '当前文件 {size}。切片将全部驻留内存，建议确保可用内存 ≥ {minMem}。',
    en: 'File size {size}. All chunks stay in memory; ensure at least {minMem} free RAM.',
  },
  'split.phase.derive': { zh: 'Argon2id 派生密钥…', en: 'Deriving Argon2id key…' },
  'split.phase.encrypt': { zh: '加密切片', en: 'Encrypting' },
  'split.phase.skip': { zh: '跳过已完成', en: 'Skipping done' },
  'split.phase.slice': { zh: '切片', en: 'Slicing' },
  'split.toast.loaded': { zh: '已加载', en: 'Loaded' },
  'split.toast.confirmPassword': { zh: '请确认密码：至少 8 位且两次输入一致', en: 'Confirm password: ≥8 chars, both inputs match' },
  'split.toast.noDir': { zh: '当前浏览器不支持目录选择，已降级为内存模式', en: 'Directory picker unsupported, falling back to memory mode' },
  'split.toast.resumeFound': { zh: '探测到', en: 'Detected' },
  'split.toast.resumeSkip': { zh: '个已完成切片，跳过续传', en: 'chunks done, skipping' },
  'split.toast.resumeNone': { zh: '未发现可续传切片，从头开始', en: 'No resumable chunks found, starting fresh' },
  'split.toast.abortSave': { zh: '已取消（已保存', en: 'Cancelled (saved' },
  'split.toast.abortNext': { zh: '个切片进度，下次可续传）', en: 'chunk(s) for resume)' },
  'split.toast.wroteDir': { zh: '已逐切片写入磁盘（', en: 'Wrote chunks to disk (' },
  'split.toast.wroteDirSkip': { zh: '，跳过', en: ', skipped' },
  'split.toast.splitDone': { zh: '已分割为', en: 'Split into' },
  'split.toast.splitEncrypted': { zh: '（已加密）', en: '(encrypted)' },
  'split.toast.zipPacking': { zh: '正在打包 ZIP…', en: 'Packing ZIP…' },
  'split.toast.zipDone': { zh: '已打包为 ZIP', en: 'Packed into ZIP' },
  'split.toast.bundleDone': { zh: '已打包下载', en: 'Bundle downloaded' },
  'split.toast.bundleHint': { zh: '（按顺序拼接，解压前请记录命名规范）', en: '(concatenated in order; keep naming convention)' },
  'split.toast.downloadAll': { zh: '开始下载', en: 'Downloading' },
  'split.toast.diskFail': { zh: '写磁盘失败，请检查目录权限或剩余空间', en: 'Write to disk failed; check directory permissions or free space' },

  // Merge panel
  'merge.drop.title': { zh: '拖拽切片文件到此处', en: 'Drag chunk files here' },
  'merge.drop.hint': {
    zh: '支持分批多次追加；支持直接拖入 ZIP 压缩包（自动解压并识别切片）；支持多个 ZIP；7z 暂不支持请改用 ZIP',
    en: 'Append in batches; drop ZIP files (auto-extract); multiple ZIPs OK; 7z unsupported, use ZIP instead.',
  },
  'merge.extracting': { zh: '正在解压 ZIP / 识别切片…', en: 'Extracting ZIP / identifying chunks…' },
  'merge.loaded': { zh: '已载入', en: 'Loaded' },
  'merge.chunks': { zh: '个切片', en: 'chunks' },
  'merge.append': { zh: '可继续拖入更多', en: 'append more' },
  'merge.clear': { zh: '清空', en: 'Clear' },
  'merge.group.badge.seq': { zh: '序号完整', en: 'Sequential' },
  'merge.group.badge.nonseq': { zh: '非连续', en: 'Non-sequential' },
  'merge.group.badge.enc': { zh: '加密', en: 'Encrypted' },
  'merge.group.missing': { zh: '缺失', en: 'Missing' },
  'merge.group.remove': { zh: '移除该组', en: 'Remove group' },
  'merge.group.saveFolder': { zh: '保存到文件夹…', en: 'Save to folder…' },
  'merge.group.saveFolderHint': {
    zh: '流式写入用户选择的文件夹，内存峰值 ≈ 单切片大小（最适合加密大文件）',
    en: 'Stream to a chosen folder; peak RAM ≈ one chunk (best for large encrypted files).',
  },
  'merge.group.saveFile': { zh: '保存到文件…', en: 'Save to file…' },
  'merge.group.saveFileHint': { zh: '直接写入文件系统（需浏览器授权）', en: 'Write directly to disk (browser permission required)' },
  'merge.group.exec': { zh: '合并并下载', en: 'Merge & download' },
  'merge.group.execEnc': { zh: '解密并合并下载', en: 'Decrypt, merge & download' },
  'merge.phase.merging': { zh: '合并', en: 'Merging' },
  'merge.phase.decrypting': { zh: '解密', en: 'Decrypting' },
  'merge.toast.pw': { zh: '请先输入密码', en: 'Enter password first' },
  'merge.toast.pwLength': { zh: '密码至少 8 位', en: 'Password must be ≥ 8 chars' },
  'merge.toast.cancelled': { zh: '已取消', en: 'Cancelled' },
  'merge.toast.fail': { zh: '合并失败', en: 'Merge failed' },
  'merge.toast.noDir': { zh: '当前浏览器不支持文件夹直写，已降级为保存文件', en: 'Folder write unsupported, falling back to save-file' },
  'merge.toast.noSave': { zh: '当前浏览器不支持保存到文件，已改为直接下载', en: 'File save unsupported, falling back to download' },
  'merge.toast.wroteFolder': { zh: '已逐块写入', en: 'Wrote chunks to' },
  'merge.toast.wroteFile': { zh: '已逐块写入', en: 'Wrote chunks to' },
  'merge.toast.merged': { zh: '合并完成', en: 'Merge complete' },
  'merge.toast.mergedDec': { zh: '解密并合并完成', en: 'Decrypted & merged' },
  'merge.toast.zip7z': { zh: '是 7z 格式，暂不支持，请改用 ZIP 重新打包', en: 'is 7z; unsupported, repack as ZIP' },
  'merge.toast.zipNoChunks': { zh: '里没有识别到切片文件', en: 'contains no recognizable chunks' },
  'merge.toast.zipDone': { zh: '已从「{name}」解压 {n} 个切片', en: 'Extracted {n} chunks from "{name}"' },
  'merge.toast.zipFail': { zh: '处理失败', en: 'failed to process' },
  'merge.toast.appended': { zh: '已识别并追加', en: 'Identified and appended' },
  'merge.toast.dup': { zh: '文件已在队列中（按名称+大小+时间去重）', en: 'Already queued (deduped by name+size+time)' },
  'merge.toast.folderFail': { zh: '写文件夹失败，请检查目录权限或剩余空间', en: 'Write to folder failed; check permissions or free space' },
  'merge.toast.fileFail': { zh: '写文件失败，请检查浏览器授权或磁盘空间', en: 'Write to file failed; check browser permission or disk space' },
  'merge.remove': { zh: '移除', en: 'Remove' },

  // Password panel
  'password.title.decrypt': { zh: '// 解密密码', en: '// Decryption password' },
  'password.title.encrypt': { zh: '// 加密密码设置', en: '// Encryption password' },
  'password.generate': { zh: '生成强密码', en: 'Generate strong password' },
  'password.generateDone': { zh: '已生成强随机密码（仅保存在内存，请自行记录）', en: 'Strong random password generated (in-memory only; please save it yourself)' },
  'password.generateAria': { zh: '生成强随机密码', en: 'Generate strong random password' },
  'password.show': { zh: '显示', en: 'Show' },
  'password.hide': { zh: '隐藏', en: 'Hide' },
  'password.toggleAria.show': { zh: '显示密码', en: 'Show password' },
  'password.toggleAria.hide': { zh: '隐藏密码', en: 'Hide password' },
  'password.input': { zh: '密码', en: 'Password' },
  'password.input.placeholder.decrypt': { zh: '输入加密时设置的密码', en: 'Enter the password used during encryption' },
  'password.input.placeholder.encrypt': { zh: '至少 8 位，建议混合大小写与符号', en: 'At least 8 chars; mix case and symbols recommended' },
  'password.confirm': { zh: '确认密码', en: 'Confirm password' },
  'password.confirm.placeholder': { zh: '再次输入以确认', en: 'Re-enter to confirm' },
  'password.strength': { zh: '强度', en: 'Strength' },
  'password.strength.aria': { zh: '密码强度：{level}', en: 'Password strength: {level}' },
  'password.strength.veryWeak': { zh: '非常弱', en: 'Very weak' },
  'password.strength.weak': { zh: '弱', en: 'Weak' },
  'password.strength.medium': { zh: '一般', en: 'Medium' },
  'password.strength.strong': { zh: '强', en: 'Strong' },
  'password.strength.veryStrong': { zh: '非常强', en: 'Very strong' },
  'password.mismatch': { zh: '两次输入不一致', en: 'Passwords do not match' },
  'password.matched': { zh: '密码已匹配', en: 'Passwords match' },
  'password.body.decrypt': {
    zh: '输入密码后将对每个 .sc 切片用 Argon2id 重新派生密钥并解密。密码错误会立即报错。',
    en: 'Each .sc chunk is re-derived with Argon2id and decrypted. Wrong password fails immediately.',
  },
  'password.body.encrypt': {
    zh: '加密采用 SealGo XChaCha20-Poly1305 + Argon2id（64MB 内存, 3 轮）。密码丢失无法恢复文件，请妥善保管。',
    en: 'SealGo XChaCha20-Poly1305 + Argon2id (64MB RAM, 3 rounds). Lost password = unrecoverable file. Keep it safe.',
  },
  'password.aboutBtn': { zh: '了解格式', en: 'About format' },
  'password.aboutToast': { zh: 'SealGo 格式：SC01 魔数 + 100B 头 + stanza + 64KB 分块加密', en: 'SealGo format: SC01 magic + 100B header + stanza + 64KB chunked encryption' },

  // Global drop overlay
  'overlay.release.split': { zh: '释放文件即可分割', en: 'Drop to split' },
  'overlay.release.merge': { zh: '释放文件即可追加合并', en: 'Drop to append & merge' },
  'overlay.mode.split': { zh: '当前模式：文件分割', en: 'Current mode: Split' },
  'overlay.mode.merge': { zh: '当前模式：切片合并', en: 'Current mode: Merge' },

  // Progress bar fallback
  'progress.fallback': { zh: '处理中', en: 'Processing' },

  // Error boundary
  'errorBoundary.title': { zh: '应用出现异常', en: 'Application error' },
  'errorBoundary.unknown': { zh: '未知错误', en: 'Unknown error' },
  'errorBoundary.reload': { zh: '刷新页面', en: 'Reload page' },

  // Drop zone
  'dropzone.clickToBrowse': { zh: '点击浏览选择', en: 'Click to browse' },
  'dropzone.dropToAdd': { zh: '释放文件即可添加', en: 'Drop to add' },

  // File card
  'fileCard.remove': { zh: '移除', en: 'Remove' },

  // Error stack
  'error.kind.decrypt': { zh: '解密失败', en: 'Decrypt failed' },
  'error.kind.merge': { zh: '合并失败', en: 'Merge failed' },
  'error.kind.wasm': { zh: 'WASM 加载失败', en: 'WASM load failed' },
  'error.kind.split': { zh: '分割失败', en: 'Split failed' },
  'error.kind.io': { zh: 'IO 失败', en: 'IO failed' },
  'error.dismiss': { zh: '关闭', en: 'Dismiss' },
  'error.copyDiagnostics': { zh: '复制诊断', en: 'Copy diagnostics' },
  'error.copied': { zh: '已复制', en: 'Copied' },

  // Manifest
  'manifest.download': { zh: '下载 manifest', en: 'Download manifest' },
  'manifest.upload': { zh: '校验完整性', en: 'Verify integrity' },
  'manifest.verified': { zh: '完整性校验通过', en: 'Integrity verified' },
  'manifest.mismatch': { zh: '有切片哈希不匹配', en: 'Some chunks mismatched' },
  'manifest.missing': { zh: '有切片缺失', en: 'Some chunks missing' },
  'manifest.invalid': { zh: 'manifest 格式无效', en: 'Invalid manifest format' },
  'manifest.readFail': { zh: 'manifest 读取失败', en: 'Failed to read manifest' },
  'manifest.needUpload': { zh: '请先上传 manifest', en: 'Upload a manifest first' },
  'manifest.loaded': { zh: '已载入 manifest', en: 'Manifest loaded' },
  'manifest.chunkCount': { zh: '个切片', en: 'chunks' },
};

export function t(key: keyof typeof dict | string, vars?: Record<string, string | number>): string {
  const entry = dict[key];
  if (!entry) return key;
  let s = locale === 'zh' ? entry.zh : entry.en;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      s = s.replaceAll(`{${k}}`, String(v));
    }
  }
  return s;
}

/** 在非组件上下文中显式指定 locale 取译文（用于 utils 等纯函数模块）。 */
export function tWithLocale(target: Locale, key: string, vars?: Record<string, string | number>): string {
  const entry = dict[key];
  if (!entry) return key;
  let s = target === 'zh' ? entry.zh : entry.en;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      s = s.replaceAll(`{${k}}`, String(v));
    }
  }
  return s;
}
