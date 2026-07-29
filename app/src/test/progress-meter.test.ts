import { describe, it, expect } from 'vitest'
import { createMeter, recordChunk, estimateEtaSeconds, percent } from '../lib/progress-meter'

describe('progress-meter', () => {
  it('createMeter 初始化字段', () => {
    const m = createMeter(1000)
    expect(m.bytesTotal).toBe(1000)
    expect(m.bytesDone).toBe(0)
    expect(m.mbps).toBe(0)
    expect(m.handledParts).toBe(0)
    expect(m.skippedParts).toBe(0)
  })

  it('recordChunk 累计字节与切片', () => {
    let m = createMeter(1000)
    m = recordChunk(m, 100)
    expect(m.bytesDone).toBe(100)
    expect(m.handledParts).toBe(1)
    m = recordChunk(m, 50, { skipped: true })
    expect(m.bytesDone).toBe(150)
    expect(m.handledParts).toBe(1)
    expect(m.skippedParts).toBe(1)
  })

  it('percent 计算', () => {
    const m = createMeter(200)
    expect(percent({ ...m, bytesDone: 50 })).toBe(25)
    expect(percent({ ...m, bytesDone: 200 })).toBe(100)
    expect(percent({ ...m, bytesDone: 300 })).toBe(100) // 截断到 100
  })

  it('estimateEtaSeconds：mbps=0 返回 null', () => {
    const m = createMeter(1000)
    expect(estimateEtaSeconds({ ...m, bytesDone: 500 })).toBeNull()
  })

  it('estimateEtaSeconds：mbps>0 返回剩余秒数', () => {
    const m = createMeter(10 * 1024 * 1024)
    const withMbps = { ...m, bytesDone: 5 * 1024 * 1024, mbps: 1 }
    const eta = estimateEtaSeconds(withMbps)
    expect(eta).not.toBeNull()
    expect(eta!).toBeCloseTo(5, 1)
  })
})