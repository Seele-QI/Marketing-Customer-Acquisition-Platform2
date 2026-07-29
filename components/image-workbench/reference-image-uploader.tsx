"use client"

import { useRef, useState } from "react"
import { ArrowLeft, ArrowRight, ImagePlus, Trash2 } from "lucide-react"

import { fileToWorkbenchReference } from "@/lib/image-workbench/reference-images"
import type {
  ReferenceRole,
  WorkbenchReferenceImage,
} from "@/lib/image-workbench/types"

type ReferenceImageUploaderProps = {
  label: string
  help: string
  role: ReferenceRole
  images: WorkbenchReferenceImage[]
  maxFiles: number
  disabled?: boolean
  onAdd: (images: WorkbenchReferenceImage[]) => void
  onRemove: (id: string) => void
  onMove?: (index: number, direction: -1 | 1) => void
}

export function ReferenceImageUploader({
  label,
  help,
  role,
  images,
  maxFiles,
  disabled = false,
  onAdd,
  onRemove,
  onMove,
}: ReferenceImageUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState("")

  const addFiles = async (files: FileList | File[]) => {
    if (disabled) return
    setError("")
    const available = Math.max(0, maxFiles - images.length)
    const selected = Array.from(files).slice(0, available)
    try {
      const converted = await Promise.all(
        selected.map((file) => fileToWorkbenchReference(file, role)),
      )
      onAdd(converted)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "参考图读取失败")
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-slate-600">{label}</span>
        <span className="text-[11px] text-slate-400">
          {images.length}/{maxFiles}
        </span>
      </div>
      <p className="mt-1 text-[11px] leading-4 text-slate-400">{help}</p>

      <button
        type="button"
        disabled={disabled || images.length >= maxFiles}
        onClick={() => inputRef.current?.click()}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault()
          void addFiles(event.dataTransfer.files)
        }}
        className="mt-2 flex min-h-16 w-full items-center justify-center gap-2 rounded-lg border border-dashed border-[#bdc2cc] bg-[#f4f5f6] px-3 py-2 text-xs text-[#666b75] transition hover:border-[#8295df] hover:bg-[#eef1fb] disabled:cursor-not-allowed disabled:opacity-50"
      >
        <ImagePlus className="h-4 w-4 text-[#3157df]" />
        添加参考图
        <span className="text-[10px] text-[#9499a3]">JPG / PNG / WebP · 10MB</span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple={maxFiles > 1}
        className="hidden"
        onChange={(event) => {
          if (event.target.files) void addFiles(event.target.files)
          event.target.value = ""
        }}
      />

      {images.length > 0 && (
        <div className="mt-2 grid grid-cols-2 gap-2">
          {images.map((image, index) => (
            <div
              key={image.id}
              className="group relative overflow-hidden rounded-lg border border-[#d7dae0] bg-white"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={image.previewUrl}
                alt={image.name}
                className="aspect-square w-full object-cover"
              />
              <div className="flex items-center justify-between gap-1 px-2 py-1.5">
                <span className="min-w-0 truncate text-[10px] text-slate-500">
                  {image.name}
                </span>
                <div className="flex shrink-0 items-center">
                  {onMove && (
                    <>
                      <button
                        type="button"
                        aria-label="向前移动"
                        disabled={disabled || index === 0}
                        onClick={() => onMove(index, -1)}
                        className="p-1 text-slate-400 hover:text-[#3157df] disabled:opacity-20"
                      >
                        <ArrowLeft className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        aria-label="向后移动"
                        disabled={disabled || index === images.length - 1}
                        onClick={() => onMove(index, 1)}
                        className="p-1 text-slate-400 hover:text-[#3157df] disabled:opacity-20"
                      >
                        <ArrowRight className="h-3 w-3" />
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    aria-label="删除参考图"
                    disabled={disabled}
                    onClick={() => onRemove(image.id)}
                    className="p-1 text-slate-400 hover:text-[#c9473d]"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      {error && <p className="mt-2 text-xs text-[#b84037]">{error}</p>}
    </div>
  )
}
