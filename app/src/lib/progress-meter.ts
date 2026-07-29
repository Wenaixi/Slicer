// 实时吞吐/进度仪表：在分割/合并主循环里以 ~4Hz 采样，平滑出 MB/s 与 ETA。

export interface ProgressMeter {
  /** 已处理的字节数（累计） */
  bytesDone: number
  /** 预计总字节 */
  bytesTotal: number
  /** 任务启动时间戳（performance.now()） */
  startTs: number
  /** 最近采样窗口内的字节增量 */
  windowBytes: number
  /** 窗口起止时间 */
  windowStartTs: number
  /** 平滑后的 MB/s（指数滑动平均） */
  mbps: number
  /** 已处理切片数（含跳过） */
  handledParts: number
  /** 被跳过的切片数 */
  skippedParts: number
}

export function createMeter(bytesTotal: number): ProgressMeter {
  const startTs = performance.now()
  return {
    bytesDone: 0,
    bytesTotal,
    startTs,
    windowBytes: 0,
    windowStartTs: startTs,
    mbps: 0,
    handledParts: 0,
    skippedParts: 0,
  }
}

/** 每个切片调用：累计字节 + 切片计数；每 ~250ms 计算一次平滑 MB/s */
export function recordChunk(
  m: ProgressMeter,
  bytes: number,
  opts: { skipped?: boolean } = {},
): ProgressMeter {
  const next: ProgressMeter = {
    ...m,
    bytesDone: m.bytesDone + bytes,
    windowBytes: m.windowBytes + bytes,
    handledParts: m.handledParts + (opts.skipped ? 0 : 1),
    skippedParts: m.skippedParts + (opts.skipped ? 1 : 0),
  }
  const now = performance.now()
  const dt = now - m.windowStartTs
  if (dt >= 250) {
    const inst = (next.windowBytes / 1024 / 1024) / (dt / 1000)
    // 指数滑动平均，首帧直接采用
    next.mbps = m.mbps === 0 ? inst : m.mbps * 0.6 + inst * 0.4
    next.windowBytes = 0
    next.windowStartTs = now
  }
  return next
}

/** 估算剩余秒数（按当前平滑 MB/s） */
export function estimateEtaSeconds(m: ProgressMeter): number | null {
  if (m.mbps <= 0 || m.bytesTotal <= 0) return null
  const remaining = m.bytesTotal - m.bytesDone
  if (remaining <= 0) return 0
  return remaining / (m.mbps * 1024 * 1024)
}

/** 百分比 [0,100] */
export function percent(m: ProgressMeter): number {
  if (m.bytesTotal <= 0) return 0
  return Math.min(100, (m.bytesDone / m.bytesTotal) * 100)
}