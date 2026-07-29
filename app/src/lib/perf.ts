// 性能指标估算：基于历史吞吐（SealGo WASM Chrome V8 约 30MB/s）

/** SealGo WASM V8 浏览器环境吞吐估计（MB/s），用于 UI 显示预计耗时 */
export const SEALGO_THROUGHPUT_MBPS = 30

/** 根据文件总大小估算纯加密耗时（秒） */
export function estimateEncryptSeconds(totalBytes: number, withArgon2 = true): number {
  const totalMB = totalBytes / 1024 / 1024
  // Argon2id 一次派生固定约 0.5-1.5s
  const argonSec = withArgon2 ? 1.0 : 0
  return argonSec + totalMB / SEALGO_THROUGHPUT_MBPS
}

/** 格式化预估耗时为人性化表达 */
export function formatEstimateSeconds(sec: number): string {
  if (sec < 1) return '< 1 秒'
  if (sec < 60) return `~ ${Math.round(sec)} 秒`
  const min = Math.floor(sec / 60)
  const rest = Math.round(sec % 60)
  return `~ ${min} 分 ${rest} 秒`
}
