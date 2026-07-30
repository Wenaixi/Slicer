// 切片完整性校验 manifest：分割完成后输出 {name}.manifest.json
// 含每个切片的 SHA-256 + 大小，合并端可验证完整性。

export interface ChunkResultLike {
  name: string;
  blob: Blob;
  size: number;
  index: number;
}

export interface ChunkManifestEntry {
  /** 切片文件名（含 .sc 后缀若加密） */
  name: string;
  /** 切片在原始文件中的序号（1 起） */
  index: number;
  /** 切片字节数 */
  size: number;
  /** SHA-256 hex（64 字符） */
  sha256: string;
}

export interface SplitManifest {
  /** 版本号，便于未来兼容 */
  version: 1;
  /** 原文件名 */
  originalName: string;
  /** 原文件总大小（明文，加密时是密文前的明文大小） */
  originalSize: number;
  /** 是否加密（SealGo v1 密码模式） */
  encrypted: boolean;
  /** 命名规范 */
  naming: 'part' | 'number' | 'infix';
  /** 切片总数 */
  totalParts: number;
  /** 单切片明文大小（最后一片可能更小） */
  chunkSize: number;
  /** 创建时间 ISO */
  createdAt: string;
  /** 所有切片的完整性条目 */
  chunks: ChunkManifestEntry[];
  /** 整个原文件的 SHA-256（可选；为 0 表示未计算） */
  originalSha256?: string;
}

/** 计算 Uint8Array 的 SHA-256（hex） */
export async function sha256Hex(data: Uint8Array | ArrayBuffer): Promise<string> {
  // ponytail: 必须切出视图对应区间，否则 subarray 子视图的 .buffer 仍指向整块 backing buffer，
  // 导致"取了中间一段却 hash 了整文件"的越界 hash。
  // 注意 data.byteOffset / data.byteLength 仅 Uint8Array 有，ArrayBuffer 直接传原 buffer。
  const view: ArrayBuffer =
    data instanceof Uint8Array
      ? (data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer)
      : data;
  const hash = await crypto.subtle.digest('SHA-256', view);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** 从分割结果生成 manifest（逐块计算 SHA-256） */
export async function buildManifest(
  originalFile: { name: string; size: number },
  chunks: ChunkResultLike[],
  options: {
    encrypted: boolean;
    naming: 'part' | 'number' | 'infix';
    chunkSize: number;
    originalSha256?: string;
  },
): Promise<SplitManifest> {
  const entries: ChunkManifestEntry[] = [];
  for (const c of chunks) {
    const bytes = new Uint8Array(await c.blob.arrayBuffer());
    const sha = await sha256Hex(bytes);
    entries.push({
      name: c.name,
      index: c.index,
      size: c.size,
      sha256: sha,
    });
  }
  return {
    version: 1,
    originalName: originalFile.name,
    originalSize: originalFile.size,
    encrypted: options.encrypted,
    naming: options.naming,
    totalParts: chunks.length,
    chunkSize: options.chunkSize,
    createdAt: new Date().toISOString(),
    chunks: entries,
    originalSha256: options.originalSha256,
  };
}

/** 导出 manifest 为可下载 JSON 字符串 */
export function serializeManifest(m: SplitManifest): string {
  return JSON.stringify(m, null, 2);
}

/** 从 JSON 字符串解析 manifest（带类型守卫） */
export function parseManifest(text: string): SplitManifest | null {
  try {
    const obj = JSON.parse(text) as Partial<SplitManifest>;
    if (obj.version !== 1) return null;
    if (typeof obj.originalName !== 'string') return null;
    if (typeof obj.originalSize !== 'number') return null;
    if (!Array.isArray(obj.chunks)) return null;
    return obj as SplitManifest;
  } catch {
    return null;
  }
}

/** 合并端验证：计算每片的 SHA-256 并与 manifest 比对 */
export interface VerifyResult {
  ok: boolean;
  /** 不匹配或缺失的切片序号 */
  mismatched: number[];
  /** manifest 里声明但磁盘缺失的切片名 */
  missing: string[];
}

export async function verifyChunksAgainstManifest(
  manifest: SplitManifest,
  chunkFiles: { name: string; data: Uint8Array }[],
): Promise<VerifyResult> {
  const byName = new Map(chunkFiles.map((f) => [f.name, f.data]));
  const mismatched: number[] = [];
  const missing: string[] = [];

  for (const entry of manifest.chunks) {
    const data = byName.get(entry.name);
    if (!data) {
      missing.push(entry.name);
      continue;
    }
    if (data.byteLength !== entry.size) {
      mismatched.push(entry.index);
      continue;
    }
    const sha = await sha256Hex(data);
    if (sha !== entry.sha256) mismatched.push(entry.index);
  }

  return {
    ok: mismatched.length === 0 && missing.length === 0,
    mismatched,
    missing,
  };
}