// ZIP 打包 / 解压工具：基于 fflate（22KB gzip，零依赖，纯 JS）
// 仅支持 ZIP（最常见）；7z 检测后降级为「请先用 ZIP」提示。

import { zipSync, unzipSync, strFromU8 } from 'fflate'

export type ArchiveKind = 'zip' | '7z' | 'unknown'

/** 通过魔数快速识别压缩包类型 */
export function detectArchiveKind(bytes: Uint8Array): ArchiveKind {
  if (bytes.length < 6) return 'unknown'
  // ZIP 魔数：PK\x03\x04 或 PK\x05\x06（空 zip）或 PK\x07\x08
  if (
    bytes[0] === 0x50 && bytes[1] === 0x4b &&
    (bytes[2] === 0x03 || bytes[2] === 0x05 || bytes[2] === 0x07) &&
    (bytes[3] === 0x04 || bytes[3] === 0x06 || bytes[3] === 0x08)
  ) {
    return 'zip'
  }
  // 7z 魔数：'7z\xBC\xAF\x27\x1C'
  if (
    bytes[0] === 0x37 && bytes[1] === 0x7a &&
    bytes[2] === 0xbc && bytes[3] === 0xaf &&
    bytes[4] === 0x27 && bytes[5] === 0x1c
  ) {
    return '7z'
  }
  return 'unknown'
}

export interface ZipEntry {
  name: string
  /** 解压后的字节 */
  data: Uint8Array
  /** 压缩前原始大小（fflate 提供） */
  size: number
}

/** 解压 ZIP 并返回所有条目。路径扁平化（去掉顶层目录）。 */
export async function unzipAll(blob: Blob): Promise<ZipEntry[]> {
  // 让出主线程再开始解压,避免大包同步阻塞 UI(ponytail: 解压仍是同步,只是入口先让出一次)
  await new Promise((r) => setTimeout(r, 0))
  const buf = new Uint8Array(await blob.arrayBuffer())
  const kind = detectArchiveKind(buf)
  if (kind === '7z') {
    throw new Error('暂不支持 7z 压缩包，请先用 ZIP 重新打包（常见压缩软件均可输出 ZIP）')
  }
  if (kind !== 'zip') {
    throw new Error('文件不是合法的 ZIP 压缩包')
  }
  const files = unzipSync(buf)
  const entries: ZipEntry[] = []
  for (const [name, data] of Object.entries(files)) {
    // 跳过目录条目（以 / 结尾）和 macOS __MACOSX/ 元数据
    if (name.endsWith('/')) continue
    if (name.startsWith('__MACOSX/')) continue
    entries.push({ name, data, size: data.byteLength })
  }
  return entries
}

/** 把若干切片条目打包成 ZIP（level=1 速度优先，可调） */
export function packAsZip(entries: ZipEntry[]): Blob {
  const files: Record<string, Uint8Array> = {}
  for (const e of entries) files[e.name] = e.data
  const zipped = zipSync(files, { level: 1 })
  return new Blob([zipped.buffer as ArrayBuffer], { type: 'application/zip' })
}

export function suggestedZipName(originalName: string): string {
  const base = originalName.replace(/\.[^.]+$/, '')
  return `${base}.slices.zip`
}

/** 从 ZIP 条目中过滤出"看起来像切片"的文件（按 part/number/infix 三种命名规范） */
export function filterChunkEntries(entries: ZipEntry[]): ZipEntry[] {
  return entries.filter((e) =>
    /\.part\d+(\.sc)?$/i.test(e.name) ||
    /\.\d{3,4}(\.sc)?$/i.test(e.name) ||
    /_part\d+(\.[^.]+)?(\.sc)?$/i.test(e.name),
  )
}

export { strFromU8 }