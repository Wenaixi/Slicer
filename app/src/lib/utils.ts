// 通用工具

/** 人类可读字节数格式化 */
export function formatBytes(bytes: number, decimals = 2): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B';
  if (bytes === 0) return '0 B';
  const k = 1024;
  const dm = Math.max(0, decimals);
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(sizes.length - 1, Math.floor(Math.log(bytes) / Math.log(k)));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

/** 从文件名提取扩展名（大写，超长时返回 FILE） */
export function fileExtBadge(name: string): string {
  const dot = name.lastIndexOf('.');
  if (dot < 0) return 'FILE';
  const ext = name.slice(dot + 1).toUpperCase();
  return ext.length > 0 && ext.length < 6 ? ext : 'FILE';
}

/** 触发浏览器下载 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // 延迟回收，确保下载已开始
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** 密码强度评估：返回 0-4 分 */
export function passwordStrength(pw: string): number {
  if (!pw) return 0;
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^a-zA-Z0-9]/.test(pw)) score++;
  return Math.min(4, score);
}

export const STRENGTH_LABEL = ['非常弱', '弱', '一般', '强', '非常强'] as const;

/** 等待一帧，让浏览器有机会渲染进度（长任务让出主线程） */
export function nextFrame(): Promise<void> {
  return new Promise((r) => requestAnimationFrame(() => r()));
}
