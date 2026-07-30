// SealGo 加密高层封装：密码派生、切片加密/解密、魔数与密钥派生常量。
// 文件格式完全遵循 SealGo v1（SC01），密码模式通过 flags 置位 FlagPassword。

import { initSealGo, type SealGoWasmApi } from './sealgo';

/** .sc 切片魔数：加密切片的第 100 字节起为 stanza，stanza 起始 4 字节是 type=1 */
const SC_MAGIC = 'SC01';
const SALT_SIZE = 32;

let api: SealGoWasmApi | null = null;

async function getApi(): Promise<SealGoWasmApi> {
  if (!api) api = await initSealGo();
  return api;
}

/** 判断数据是否为 SealGo 加密文件（前 4 字节魔数） */
export function isSealGoFile(data: Uint8Array): boolean {
  if (data.length < 8) return false;
  return (
    data[0] === SC_MAGIC.charCodeAt(0) &&
    data[1] === SC_MAGIC.charCodeAt(1) &&
    data[2] === SC_MAGIC.charCodeAt(2) &&
    data[3] === SC_MAGIC.charCodeAt(3)
  );
}

/** 从密码派生 32 字节 fileKey（Argon2id, 64MB/3轮/4线程，参数与 SealGo 官方一致）
 *  优先在 Worker 中执行（避免阻塞主线程），失败/不支持时降级到主线程。
 */
export async function deriveKeyFromPassword(password: string, salt: Uint8Array): Promise<Uint8Array> {
  // 尝试 Worker 路径
  try {
    const { createKdfDispatcher } = await import('./worker-kdf');
    const dispatcher = createKdfDispatcher(() => {
      const w = new Worker(new URL('./worker-kdf.ts', import.meta.url), { type: 'module' });
      return w as unknown as {
        onmessage: ((ev: { data: unknown }) => void) | null;
        postMessage(msg: unknown): void;
      };
    });
    return await dispatcher.derive(password, salt);
  } catch (err) {
    // Worker 失败：降级到主线程
    console.warn('Worker KDF 失败，降级到主线程:', err);
  }
  const a = await getApi();
  return a.derivePasswordKey(password, salt);
}

/** 生成密码加密所需的随机盐 */
export async function generateSalt(): Promise<Uint8Array> {
  const a = await getApi();
  return a.randBytes(SALT_SIZE);
}

/**
 * 用密码加密一个切片。
 * 每个文件应调用 generateSalt() 一次（盐写入 SealGo 头部 + 传给此函数）。
 * fileKey 由调用方缓存复用（同一批切片共享一次 Argon2 派生，避免 N 次慢哈希）。
 * 返回 SealGo v1 格式密文（含 100B 头 + salt + stanza + 加密块）。
 */
export async function encryptChunkWithKey(
  data: Uint8Array,
  fileKey: Uint8Array,
  salt: Uint8Array,
): Promise<Uint8Array> {
  if (salt.length !== SALT_SIZE) throw new Error('盐长度必须为 32 字节');
  const a = await getApi();
  return a.encryptWithKey(data, fileKey, salt);
}

/**
 * 用密码解密切片。
 * 自动从密文头部读取盐并重新派生 fileKey（每个文件盐不同，必须按文件派生）。
 * 密码错误或文件损坏时抛出异常。
 */
export async function decryptChunkWithPassword(
  cipher: Uint8Array,
  password: string,
): Promise<Uint8Array> {
  if (!isSealGoFile(cipher)) {
    throw new Error('不是有效的 SealGo 加密文件（缺少 SC01 魔数）');
  }
  const a = await getApi();
  // 头部布局：magic(4) + version(1) + flags(1) + rc(1) + reserved(1) + salt(32)
  const salt = cipher.slice(8, 8 + SALT_SIZE);
  const fileKey = a.derivePasswordKey(password, salt);
  try {
    return a.decryptWithKey(cipher, fileKey);
  } finally {
    fileKey.fill(0);
  }
}

/** 用已知 fileKey 解密（调用方已按盐派生过，适用于同批切片复用） */
export async function decryptChunkWithKey(
  cipher: Uint8Array,
  fileKey: Uint8Array,
): Promise<Uint8Array> {
  const a = await getApi();
  return a.decryptWithKey(cipher, fileKey);
}

/** 提取加密文件头部中的盐（用于按文件派生密钥） */
export function extractSalt(cipher: Uint8Array): Uint8Array {
  if (!isSealGoFile(cipher)) throw new Error('不是 SealGo 文件');
  return cipher.slice(8, 8 + SALT_SIZE);
}

/** 提取加密文件预留区记录的明文长度（encryptWithKey 写入，0 表示未知） */
export function extractPlainSize(cipher: Uint8Array): number {
  if (!isSealGoFile(cipher) || cipher.length < 100) return 0;
  const view = new DataView(cipher.buffer, cipher.byteOffset + 92, 8);
  return Number(view.getBigUint64(0, true));
}

/** 提取 Argon2 参数（encryptWithKey 写入预留区 68..79） */
export function extractArgonParams(cipher: Uint8Array): { time: number; memory: number; threads: number } | null {
  if (!isSealGoFile(cipher) || cipher.length < 80) return null;
  const view = new DataView(cipher.buffer, cipher.byteOffset + 68, 12);
  return {
    time: view.getUint32(0, true),
    memory: view.getUint32(4, true),
    threads: view.getUint32(8, true),
  };
}
