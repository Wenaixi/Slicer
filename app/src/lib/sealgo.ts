// SealGo WASM 桥加载器
// 加载 Go 运行时（wasm_exec.js）并实例化 SealGo.wasm。
// 单例模式：整个应用共享一个 WASM 实例，重复调用直接返回缓存。

export interface SealGoWasmApi {
  generateKeypair(): { public: string; private: string };
  /** 官方 hex API */
  encrypt(dataHex: string, recipientPubHex: string): string;
  decrypt(dataHex: string, identityPrivHex: string): string;
  /** Slicer 定制 API（字节桥） */
  randBytes(n: number): Uint8Array;
  derivePasswordKey(password: string, salt: Uint8Array): Uint8Array;
  encryptWithKey(data: Uint8Array, fileKey: Uint8Array, salt: Uint8Array): Uint8Array;
  decryptWithKey(data: Uint8Array, fileKey: Uint8Array): Uint8Array;
}

declare global {
  interface Window {
    Go: new () => {
      run(instance: WebAssembly.Instance): Promise<void>;
      importObject: WebAssembly.Imports;
    };
    SealGo: SealGoWasmApi;
  }
}
let readyPromise: Promise<SealGoWasmApi> | null = null;

/** 仅供测试使用:获取内部 readyPromise 状态(null 表示未初始化或已重置)。 */
export function __getReadyPromiseForTest(): Promise<SealGoWasmApi> | null {
  return readyPromise;
}

/** 仅供测试使用:清空缓存的 readyPromise,验证失败重试语义。 */
export function __resetSealGoForTest(): void {
  readyPromise = null;
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
    if (existing) {
      resolve();
      return;
    }
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`加载脚本失败: ${src}`));
    document.head.appendChild(s);
  });
}

/** 获取 WASM 资源：浏览器 fetch，Node（jsdom 测试）从 fs 读 */
async function loadWasmBytes(): Promise<ArrayBuffer> {
  const isNode = typeof process !== 'undefined' && !!(process as { versions?: { node?: string } }).versions?.node;
  if (isNode) {
    const { readFile } = await import('node:fs/promises');
    const { resolve } = await import('node:path');
    const buf = await readFile(resolve(process.cwd(), 'public/wasm/SealGo.wasm'));
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
  }
  const resp = await fetch('/wasm/SealGo.wasm');
  if (!resp.ok) throw new Error(`SealGo.wasm 加载失败: ${resp.status}`);
  return resp.arrayBuffer();
}

/** 初始化 SealGo WASM(幂等)。返回可直接调用的 API 对象。
 *  失败时把 readyPromise 重置为 null,允许下次调用重新尝试。 */
export function initSealGo(): Promise<SealGoWasmApi> {
  if (readyPromise) return readyPromise;
  const attempt = (async () => {
    // wasm_exec.js 将 Go 暴露在 globalThis 上（IIFE 绑定 globalThis.Go）
    const GoCtor = (globalThis as { Go?: typeof window.Go }).Go ?? (typeof window !== 'undefined' ? window.Go : undefined);
    if (typeof GoCtor === 'undefined') {
      await loadScript('/wasm/wasm_exec.js');
    }
    const GoFinal = (globalThis as { Go?: typeof window.Go }).Go ?? (typeof window !== 'undefined' ? window.Go : undefined);
    if (typeof GoFinal === 'undefined') {
      throw new Error('Go 运行时加载失败（wasm_exec.js 不可用）');
    }
    const go = new GoFinal();
    const bytes = await loadWasmBytes();
    const result = await WebAssembly.instantiate(bytes, go.importObject);
    // go.run 永不 resolve（WASM main 内部 <-done 阻塞），不 await
    go.run(result.instance);
    // SealGo.wasm 内部 init 注册 window.SealGo；需要让浏览器下一帧再读
    const target = (globalThis as { SealGo?: SealGoWasmApi }).SealGo ?? (typeof window !== 'undefined' ? window.SealGo : undefined);
    if (!target) {
      await new Promise((r) => setTimeout(r, 50));
    }
    const finalApi = (globalThis as { SealGo?: SealGoWasmApi }).SealGo ?? (typeof window !== 'undefined' ? window.SealGo : undefined);
    if (!finalApi) {
      throw new Error('SealGo WASM 初始化失败：SealGo 对象未注册');
    }
    return finalApi;
  })();
  // 失败时清空缓存,让下一次 initSealGo() 重新走加载流程(不永久卡死)
  attempt.catch(() => {
    if (readyPromise === attempt) readyPromise = null;
  });
  readyPromise = attempt;
  return attempt;
}
