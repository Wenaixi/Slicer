// 分割模式状态

export type SplitMode = 'size' | 'count';
export type SizeUnit = 'KB' | 'MB' | 'GB';
export type NamingPattern = 'part' | 'number' | 'infix';

export interface SplitOptions {
  mode: SplitMode;
  sizeValue: number;
  sizeUnit: SizeUnit;
  countValue: number;
  naming: NamingPattern;
  encrypt: boolean;
  password: string;
}

export const DEFAULT_SPLIT_OPTIONS: SplitOptions = {
  mode: 'size',
  sizeValue: 20,
  sizeUnit: 'MB',
  countValue: 5,
  naming: 'part',
  encrypt: false,
  password: '',
};

export const UNIT_MULTIPLIER: Record<SizeUnit, number> = {
  KB: 1024,
  MB: 1024 * 1024,
  GB: 1024 * 1024 * 1024,
};

/** 根据分割参数计算单切片字节数与总切片数 */
export function computeChunkPlan(
  fileSize: number,
  options: Pick<SplitOptions, 'mode' | 'sizeValue' | 'sizeUnit' | 'countValue'>,
): { chunkSize: number; totalParts: number } {
  if (options.mode === 'size') {
    const val = options.sizeValue > 0 ? options.sizeValue : 1;
    let chunkSize = Math.floor(val * UNIT_MULTIPLIER[options.sizeUnit]);
    if (chunkSize <= 0) chunkSize = 1024;
    return { chunkSize, totalParts: Math.max(1, Math.ceil(fileSize / chunkSize)) };
  }
  const count = Math.max(2, Math.floor(options.countValue) || 2);
  return { chunkSize: Math.ceil(fileSize / count), totalParts: count };
}

/** 按命名规范生成切片文件名 */
export function buildChunkName(
  originalName: string,
  index: number,
  totalParts: number,
  pattern: NamingPattern,
): string {
  const padLen = Math.max(3, String(totalParts).length);
  const padded = String(index).padStart(padLen, '0');
  if (pattern === 'part') return `${originalName}.part${index}`;
  if (pattern === 'number') return `${originalName}.${padded}`;
  // infix：保留扩展名，将 part 序号插入扩展名前
  const dot = originalName.lastIndexOf('.');
  if (dot > 0) {
    return `${originalName.slice(0, dot)}_part${index}${originalName.slice(dot)}`;
  }
  return `${originalName}_part${index}`;
}

/** 给切片名追加加密扩展名（.sc 是 SealGo 官方加密扩展名） */
export function encryptedChunkName(name: string): string {
  return `${name}.sc`;
}
