// 合并模式：文件名解析、分组、连续性校验

export interface ParsedChunkName {
  baseName: string;
  partIndex: number | null;
  encrypted: boolean;
}

/** 智能解析切片文件名，识别三种命名规范 + 加密扩展名 */
export function parseChunkFileName(filename: string): ParsedChunkName {
  let name = filename;
  let encrypted = false;
  // 识别并剥离加密扩展名（SealGo 官方 .sc）
  if (/\.sc$/i.test(name)) {
    encrypted = true;
    name = name.slice(0, -3);
  }

  // 规范 1：name.ext.part1 / name.ext.part01
  let m = name.match(/^(.*?)\.part(\d+)$/i);
  if (m) return { baseName: m[1], partIndex: parseInt(m[2], 10), encrypted };

  // 规范 2：name.ext.001 / name.ext.0001
  m = name.match(/^(.*?)\.(\d{3,4})$/i);
  if (m) return { baseName: m[1], partIndex: parseInt(m[2], 10), encrypted };

  // 规范 3：name_part1.ext
  m = name.match(/^(.*?)_part(\d+)(\.[^.]+)?$/i);
  if (m) {
    const ext = m[3] || '';
    return { baseName: m[1] + ext, partIndex: parseInt(m[2], 10), encrypted };
  }

  return { baseName: name.replace(/\.(part\d+|\d{3,})$/i, ''), partIndex: null, encrypted };
}

export interface MergeChunkItem {
  file: File;
  index: number | null;
  originalName: string;
}

export interface MergeGroup {
  baseName: string;
  encrypted: boolean;
  items: MergeChunkItem[];
  totalSize: number;
  /** 切片序号是否从 1 开始连续 */
  sequential: boolean;
  /** 缺失的序号列表（用于缺失警告展示） */
  missing: number[];
}

/** 将累积的文件列表按 baseName 智能分组并排序 */
export function groupMergeFiles(files: File[]): MergeGroup[] {
  const groups = new Map<string, MergeChunkItem[]>();
  const encFlag = new Map<string, boolean>();

  for (const file of files) {
    const parsed = parseChunkFileName(file.name);
    const key = parsed.baseName + (parsed.encrypted ? '::enc' : '');
    if (!groups.has(key)) {
      groups.set(key, []);
      encFlag.set(key, parsed.encrypted);
    }
    groups.get(key)!.push({ file, index: parsed.partIndex, originalName: file.name });
  }

  const result: MergeGroup[] = [];
  for (const [key, items] of groups) {
    const baseName = key.replace(/::enc$/, '');
    // 组内按序号排序；无序号时按文件名自然排序
    items.sort((a, b) => {
      if (a.index !== null && b.index !== null) return a.index - b.index;
      return a.originalName.localeCompare(b.originalName, undefined, {
        numeric: true,
        sensitivity: 'base',
      });
    });

    const totalSize = items.reduce((acc, cur) => acc + cur.file.size, 0);
    const missing: number[] = [];
    let sequential = true;

    const indices = items.map((it) => it.index).filter((v): v is number => v !== null);
    if (indices.length > 0) {
      const max = Math.max(...indices);
      const present = new Set(indices);
      for (let i = 1; i <= max; i++) {
        if (!present.has(i)) missing.push(i);
      }
      // 必须从 1 开始且无缺失
      sequential = indices[0] === 1 && missing.length === 0;
    }

    result.push({
      baseName,
      encrypted: encFlag.get(key) ?? false,
      items,
      totalSize,
      sequential,
      missing,
    });
  }

  // 组按名称排序，稳定展示
  result.sort((a, b) => a.baseName.localeCompare(b.baseName));
  return result;
}

/** 文件去重 key（名称 + 大小 + 修改时间） */
export function fileDedupKey(f: File): string {
  return `${f.name}::${f.size}::${f.lastModified}`;
}
