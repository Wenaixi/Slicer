// 解密错误分类：把 WASM 抛出的笼统错误（"wrong password or corrupted file"）
// 拆解为「密码错误」vs「文件损坏」两类，便于 UI 展示针对性兜底提示。

export type DecryptErrorKind =
  | 'wrong-password'   // 魔数、盐、头合法但认证失败
  | 'not-sealgo'       // 根本不是 SealGo 文件（魔数错）
  | 'header-corrupt'   // 头结构残缺（长度不够 / 版本不支持）
  | 'cipher-corrupt'   // stanza 或密文块流不完整
  | 'internal'         // 其他意外错误

export interface ClassifiedError {
  kind: DecryptErrorKind
  message: string
  hint: string
}

/** 基于密文 + 异常信息分类错误 */
export function classifyDecryptError(
  cipher: Uint8Array,
  err: unknown,
): ClassifiedError {
  const msg = err instanceof Error ? err.message : String(err)

  // 长度不足 100B 头
  if (cipher.length < 100) {
    return {
      kind: 'not-sealgo',
      message: '文件太小，不是合法的 SealGo 加密文件',
      hint: '请确认选择的是 .sc 加密切片',
    }
  }

  // 魔数错误
  if (
    cipher[0] !== 0x53 || // S
    cipher[1] !== 0x43 || // C
    cipher[2] !== 0x30 || // 0
    cipher[3] !== 0x31    // 1
  ) {
    return {
      kind: 'not-sealgo',
      message: '文件不是 SealGo 加密格式（缺少 SC01 魔数）',
      hint: '只有以 .sc 结尾的加密切片才能解密',
    }
  }

  // 版本不支持
  const version = cipher[4]
  if (version !== 1) {
    return {
      kind: 'header-corrupt',
      message: `SealGo 版本 ${version} 不受支持（仅支持 v1）`,
      hint: '文件可能由更新版本的 SealGo 加密，或头部被截断',
    }
  }

  // 长度残缺（stanza 区域至少 100+68）
  if (cipher.length < 100 + 68 + 20) {
    return {
      kind: 'cipher-corrupt',
      message: '密文块流不完整（stanza 或密文块被截断）',
      hint: '下载/传输过程中文件被截断，请重新获取该切片',
    }
  }

  // 头结构完整 → 大概率是密码错误（XChaCha20-Poly1305 认证失败）
  if (/wrong password|corrupted file/i.test(msg)) {
    return {
      kind: 'wrong-password',
      message: '密码错误或文件被篡改',
      hint: '请确认密码（区分大小写）无误；若确认正确，文件可能已被篡改',
    }
  }

  return {
    kind: 'internal',
    message: msg || '解密失败',
    hint: '请重新加载该切片或反馈给开发者',
  }
}

/** 把 kind 翻译成中文标签（UI 用） */
export function kindLabel(kind: DecryptErrorKind): string {
  switch (kind) {
    case 'wrong-password':
      return '密码错误'
    case 'not-sealgo':
      return '非加密文件'
    case 'header-corrupt':
      return '头部损坏'
    case 'cipher-corrupt':
      return '密文残缺'
    case 'internal':
      return '未知错误'
  }
}