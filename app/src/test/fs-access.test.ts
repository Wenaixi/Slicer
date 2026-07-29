import { describe, it, expect } from 'vitest'
import { supportsFsAccess } from '../lib/fs-access'

describe('File System Access API 检测', () => {
  it('无 window 时返回 false', () => {
    expect(supportsFsAccess()).toBe(false)
  })
})
