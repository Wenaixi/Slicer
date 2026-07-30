// 面板级错误兜底 store：捕捉严重错误（解密/合并/WASM/分割/IO 失败）。
// 在 UI 中以可关闭、可复制的卡片展示，比一次性 toast 更可靠。
// 纯逻辑层：仅持有状态 + 订阅 + 推送/清除 API，不依赖 React。

export interface PanelError {
  id: number;
  kind: 'decrypt' | 'merge' | 'wasm' | 'split' | 'io';
  title: string;
  message: string;
  hint?: string;
  /** 诊断信息（可复制，含堆栈/分类/文件元数据） */
  diagnostics?: string;
  /** 关联的文件名 */
  fileName?: string;
  /** 时间戳 */
  timestamp: number;
}

type Listener = () => void;

let errors: PanelError[] = [];
const listeners = new Set<Listener>();
let nextId = 1;

function emit() {
  listeners.forEach((l) => l());
}

export function subscribePanelErrors(l: Listener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function getPanelErrorsSnapshot(): PanelError[] {
  return errors;
}

export function pushError(e: Omit<PanelError, 'id' | 'timestamp'>): number {
  const id = nextId++;
  errors = [...errors, { ...e, id, timestamp: Date.now() }];
  emit();
  return id;
}

export function dismissError(id: number): void {
  errors = errors.filter((e) => e.id !== id);
  emit();
}

export function clearErrors(): void {
  errors = [];
  emit();
}
