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

/** 初始化 SealGo WASM（幂等）。返回可直接调用的 API 对象。 */
export function initSealGo(): Promise<SealGoWasmApi> {
  if (readyPromise) return readyPromise;
  readyPromise = (async () => {
    await loadScript('/wasm/wasm_exec.js');
    if (typeof window.Go === 'undefined') {
      throw new Error('Go 运行时加载失败（wasm_exec.js 不可用）');
    }
    const go = new window.Go();
    const result = await WebAssembly.instantiateStreaming(
      fetch('/wasm/SealGo.wasm'),
      go.importObject,
    ).catch(async () => {
      // 部分环境（如 file:// 或 MIME 不正确的静态服务器）不支持 instantiateStreaming，退化为 buffer 实例化
      const resp = await fetch('/wasm/SealGo.wasm');
      const bytes = await resp.arrayBuffer();
      return WebAssembly.instantiate(bytes, go.importObject);
    });
    // go.run 永不 resolve（WASM main 内部 <-done 阻塞），不 await
    go.run(result.instance);
    if (typeof window.SealGo === 'undefined') {
      throw new Error('SealGo WASM 初始化失败：全局 SealGo 对象未注册');
    }
    return window.SealGo;
  })();
  return readyPromise;
}
