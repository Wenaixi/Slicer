export function Footer() {
  return (
    <footer className="mt-16 pt-8 border-t border-zinc-800/60 light:border-zinc-200 grid grid-cols-1 md:grid-cols-3 gap-6 text-[11px] text-zinc-500 light:text-zinc-500 font-mono">
      <div className="flex items-start gap-3">
        <span className="font-bold text-zinc-300 light:text-zinc-700">01.</span>
        <p>
          <strong className="text-zinc-200 light:text-zinc-800">流式分块</strong>
          ：File.slice + 零拷贝 Blob 拼接，1GB 文件内存占用稳定在数 MB。
        </p>
      </div>
      <div className="flex items-start gap-3">
        <span className="font-bold text-zinc-300 light:text-zinc-700">02.</span>
        <p>
          <strong className="text-zinc-200 light:text-zinc-800">SealGo WASM</strong>
          ：XChaCha20-Poly1305 认证加密 + Argon2id 密码派生，浏览器本地完成，数据零外发。
        </p>
      </div>
      <div className="flex items-start gap-3">
        <span className="font-bold text-zinc-300 light:text-zinc-700">03.</span>
        <p>
          <strong className="text-zinc-200 light:text-zinc-800">智能归组</strong>
          ：三种切片命名规范自动识别，支持跨目录多批次追加去重拼接。
        </p>
      </div>
    </footer>
  )
}
