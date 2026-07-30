import { describe, it, expect } from 'vitest'
import {
  formatBytes,
  fileExtBadge,
  passwordStrength,
  strengthLabels,
} from '../lib/utils'
import {
  computeChunkPlan,
  buildChunkName,
  encryptedChunkName,
  UNIT_MULTIPLIER,
} from '../lib/split'

describe('formatBytes', () => {
  it('零与负数返回 0 B', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(-1)).toBe('0 B')
    expect(formatBytes(Number.NaN)).toBe('0 B')
    expect(formatBytes(Number.POSITIVE_INFINITY)).toBe('0 B')
  })

  it('字节级格式化', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(1023)).toBe('1023 B')
  })

  it('KB/MB/GB 分级', () => {
    expect(formatBytes(1024)).toBe('1 KB')
    expect(formatBytes(1536)).toBe('1.5 KB')
    expect(formatBytes(1024 * 1024)).toBe('1 MB')
    expect(formatBytes(1024 * 1024 * 1024)).toBe('1 GB')
    expect(formatBytes(1024 * 1024 * 1024 * 1024)).toBe('1 TB')
  })

  it('小数位控制', () => {
    expect(formatBytes(1234567, 0)).toBe('1 MB')
    expect(formatBytes(1234567, 1)).toBe('1.2 MB')
    expect(formatBytes(1234567, 3)).toBe('1.177 MB')
  })
})

describe('fileExtBadge', () => {
  it('提取扩展名并大写', () => {
    expect(fileExtBadge('video.mp4')).toBe('MP4')
    expect(fileExtBadge('archive.tar.gz')).toBe('GZ')
    expect(fileExtBadge('README')).toBe('FILE')
    expect(fileExtBadge('.gitignore')).toBe('FILE') // 无中间点视为无扩展名
  })

  it('超长扩展名降级 FILE', () => {
    expect(fileExtBadge('a.abcdefgh')).toBe('FILE')
    expect(fileExtBadge('a.abcde')).toBe('ABCDE')
  })
})

describe('passwordStrength', () => {
  it('空密码 0 分', () => {
    expect(passwordStrength('')).toBe(0)
  })

  it('短密码低分', () => {
    expect(passwordStrength('abc')).toBeLessThanOrEqual(1)
    expect(passwordStrength('abcdefgh')).toBe(1) // 仅长度
  })

  it('混合字符加分', () => {
    expect(passwordStrength('Abcdefg1')).toBeGreaterThanOrEqual(2)
    expect(passwordStrength('Abcdefg1!xyz')).toBe(4)
    expect(passwordStrength('Abcdefg1!xyzlong')).toBe(4)
  })

  it('标签映射完整', () => {
    const zhLabels = strengthLabels('zh')
    expect(zhLabels).toHaveLength(5)
    expect(zhLabels[0]).toBe('非常弱')
    expect(zhLabels[4]).toBe('非常强')
    const enLabels = strengthLabels('en')
    expect(enLabels[0]).toBe('Very weak')
    expect(enLabels[4]).toBe('Very strong')
  })
})

describe('UNIT_MULTIPLIER', () => {
  it('单位换算正确', () => {
    expect(UNIT_MULTIPLIER.KB).toBe(1024)
    expect(UNIT_MULTIPLIER.MB).toBe(1024 * 1024)
    expect(UNIT_MULTIPLIER.GB).toBe(1024 * 1024 * 1024)
  })
})

describe('computeChunkPlan', () => {
  it('按大小分割：整除', () => {
    const plan = computeChunkPlan(100 * 1024 * 1024, {
      mode: 'size',
      sizeValue: 10,
      sizeUnit: 'MB',
      countValue: 5,
    })
    expect(plan.chunkSize).toBe(10 * 1024 * 1024)
    expect(plan.totalParts).toBe(10)
  })

  it('按大小分割：向上取整', () => {
    const plan = computeChunkPlan(100 * 1024 * 1024 + 1, {
      mode: 'size',
      sizeValue: 10,
      sizeUnit: 'MB',
      countValue: 5,
    })
    expect(plan.totalParts).toBe(11)
  })

  it('按份数分割：均分向上取整', () => {
    const plan = computeChunkPlan(100, {
      mode: 'count',
      sizeValue: 10,
      sizeUnit: 'MB',
      countValue: 3,
    })
    expect(plan.totalParts).toBe(3)
    expect(plan.chunkSize).toBe(34)
  })

  it('非法输入兜底', () => {
    const p1 = computeChunkPlan(1000, {
      mode: 'size',
      sizeValue: 0,
      sizeUnit: 'MB',
      countValue: 5,
    })
    expect(p1.chunkSize).toBeGreaterThan(0)

    const p2 = computeChunkPlan(1000, {
      mode: 'count',
      sizeValue: 10,
      sizeUnit: 'MB',
      countValue: 1,
    })
    expect(p2.totalParts).toBe(2) // countValue < 2 提升为 2
  })

  it('KB/GB 单位换算', () => {
    expect(
      computeChunkPlan(512 * 1024, {
        mode: 'size',
        sizeValue: 256,
        sizeUnit: 'KB',
        countValue: 5,
      }).chunkSize,
    ).toBe(256 * 1024)

    expect(
      computeChunkPlan(2 * 1024 * 1024 * 1024, {
        mode: 'size',
        sizeValue: 1,
        sizeUnit: 'GB',
        countValue: 5,
      }).chunkSize,
    ).toBe(1024 * 1024 * 1024)
  })
})

describe('buildChunkName', () => {
  it('part 规范', () => {
    expect(buildChunkName('a.zip', 1, 10, 'part')).toBe('a.zip.part1')
    expect(buildChunkName('a.zip', 12, 10, 'part')).toBe('a.zip.part12')
  })

  it('number 规范：零填充', () => {
    expect(buildChunkName('a.zip', 1, 10, 'number')).toBe('a.zip.001')
    expect(buildChunkName('a.zip', 12, 100, 'number')).toBe('a.zip.012')
    expect(buildChunkName('a.zip', 1234, 2000, 'number')).toBe('a.zip.1234')
  })

  it('infix 规范：保留扩展名', () => {
    expect(buildChunkName('archive.tar.gz', 1, 10, 'infix')).toBe('archive.tar_part1.gz')
    expect(buildChunkName('noext', 1, 10, 'infix')).toBe('noext_part1')
  })

  it('infix 边界：点开头文件', () => {
    // '.hidden' lastIndexOf('.') === 0，视为无扩展名
    expect(buildChunkName('.hidden', 1, 10, 'infix')).toBe('.hidden_part1')
  })
})

describe('encryptedChunkName', () => {
  it('追加 .sc 后缀', () => {
    expect(encryptedChunkName('a.zip.part1')).toBe('a.zip.part1.sc')
    expect(encryptedChunkName('a.zip.001')).toBe('a.zip.001.sc')
  })
})
