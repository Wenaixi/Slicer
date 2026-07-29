import { useState, type DragEvent, type ReactNode } from 'react'

interface DropZoneProps {
  title: string
  hint: string
  onFiles: (files: File[]) => void
  multiple?: boolean
  disabled?: boolean
  children?: ReactNode
}

export function DropZone({ title, hint, onFiles, multiple = false, disabled = false, children }: DropZoneProps) {
  const [dragging, setDragging] = useState(false)

  const handleDragEnter = (e: DragEvent) => {
    e.preventDefault()
    if (disabled) return
    setDragging(true)
  }

  const handleDragLeave = (e: DragEvent) => {
    e.preventDefault()
    if (disabled) return
    setDragging(false)
  }

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault()
  }

  const handleDrop = (e: DragEvent) => {
    e.preventDefault()
    if (disabled) return
    setDragging(false)
    const files = Array.from(e.dataTransfer.files)
    if (files.length > 0) {
      onFiles(multiple ? files : [files[0]])
    }
  }

  const handleSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onFiles(multiple ? Array.from(e.target.files) : [e.target.files[0]])
      e.target.value = ''
    }
  }

  return (
    <div
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      className={`relative border-2 border-dashed transition-fast ${
        dragging
          ? 'border-zinc-300 bg-zinc-900/80 light:border-zinc-700 light:bg-zinc-100'
          : 'border-zinc-800 light:border-zinc-300 bg-zinc-900/40 light:bg-zinc-50 hover:border-zinc-700 light:hover:border-zinc-400'
      } ${disabled ? 'opacity-50 pointer-events-none' : ''}`}
    >
      <input
        type="file"
        id="dropzone-input"
        multiple={multiple}
        onChange={handleSelect}
        className="hidden"
        disabled={disabled}
      />
      <label
        htmlFor="dropzone-input"
        className="flex flex-col items-center justify-center gap-4 p-10 md:p-14 cursor-pointer text-center"
      >
        <div className="w-14 h-14 grid place-items-center border border-zinc-700 light:border-zinc-300 text-zinc-400 light:text-zinc-600 transition-fast">
          <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
            <path d="M12 3v12M12 3l-4 4M12 3l4 4" />
            <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
          </svg>
        </div>
        <div className="space-y-1">
          <p className="text-sm font-semibold">{title}</p>
          <p className="text-xs text-zinc-500">{hint}</p>
        </div>
        <span className="text-[11px] font-mono text-zinc-500 underline underline-offset-4">
          点击浏览选择
        </span>
      </label>
      {dragging && (
        <div className="absolute inset-0 grid place-items-center bg-zinc-950/80 light:bg-white/80 backdrop-blur-sm drag-overlay-enter pointer-events-none">
          <p className="font-mono text-sm">释放文件即可添加</p>
        </div>
      )}
      {children}
    </div>
  )
}
