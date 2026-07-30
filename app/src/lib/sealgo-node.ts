// sealgo 的 Node 加载分支:仅在 jsdom / Node 测试环境使用(读取 public/wasm/SealGo.wasm 到 ArrayBuffer)。
// 拆出独立文件避免浏览器构建时把 node:fs / node:path 写进 bundle,产生 Vite externalize 警告。
// 测试通过 setup.ts 显式 import 此文件(在 beforeAll 钩子里);主代码路径不引用。

import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

/** 从磁盘加载 SealGo.wasm 字节(仅供 jsdom / Node 测试环境) */
export async function loadWasmBytesFromDisk(): Promise<ArrayBuffer> {
  const buf = await readFile(resolve(process.cwd(), 'public/wasm/SealGo.wasm'))
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
}
