"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { Loader2, CheckCircle2, XCircle, Upload, ArrowLeft, Download } from "lucide-react"
import { getFastapiBase } from "@/lib/fastapi-base"

type Step = "form" | "storyboard" | "prompt" | "video"

interface FormData {
  productName: string
  productImage: string
  sellingPoints: string[]
  targetAudience: string
  style: string
  duration: number
  frameCount: 9 | 16 | 25
  ratio: string
}

const API_BASE = typeof window !== "undefined" ? getFastapiBase() : ""
const STYLES = ["科技感", "温情", "活力", "简约", "复古", "潮酷"]
const DURATIONS = [15, 30, 45, 60]
const FRAME_COUNTS = [9, 16, 25]
const RATIOS = [
  { value: "adaptive", label: "自适应" },
  { value: "16:9", label: "16:9 横屏" },
  { value: "9:16", label: "9:16 竖屏" },
  { value: "1:1", label: "1:1 方形" },
]

export default function PromoVideoWorkflow() {
  const [step, setStep] = useState<Step>("form")
  const [formData, setFormData] = useState<FormData>({
    productName: "",
    productImage: "",
    sellingPoints: [],
    targetAudience: "",
    style: "科技感",
    duration: 15,
    frameCount: 9,
    ratio: "adaptive",
  })
  const [imagePreview, setImagePreview] = useState("")
  const fileRef = useRef<HTMLInputElement>(null)

  const [storyTaskId, setStoryTaskId] = useState("")
  const [sbStatus, setSbStatus] = useState<"idle"|"queue"|"proc"|"ready"|"fail">("idle")
  const [sbProgress, setSbProgress] = useState(0)
  const [frames, setFrames] = useState<string[]>([])
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [sbErr, setSbErr] = useState("")

  const [videoTaskId, setVideoTaskId] = useState("")
  const [vidStatus, setVidStatus] = useState<"idle"|"queue"|"proc"|"done"|"fail">("idle")
  const [vidProgress, setVidProgress] = useState(0)
  const [vidUrl, setVidUrl] = useState("")
  const [vidErr, setVidErr] = useState("")
  const [vidPrompt, setVidPrompt] = useState("")
  const [autoPrompting, setAutoPrompting] = useState(false)

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current) }, [])

  const stopPoll = () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null } }

  const handleImage = useCallback((file: File) => {
    if (!file.type.startsWith("image/")) return alert("请上传图片文件")
    const reader = new FileReader()
    reader.onload = (e) => {
      const r = e.target!.result as string
      setImagePreview(r)
      setFormData(p => ({ ...p, productImage: r }))
    }
    reader.readAsDataURL(file)
  }, [])

  const [sellText, setSellText] = useState("")
  const onSellChange = (t: string) => {
    setSellText(t)
    setFormData(p => ({ ...p, sellingPoints: t.split("\n").map(s => s.trim()).filter(Boolean) }))
  }

  const submitStory = async () => {
    if (!formData.productName.trim()) return alert("填写产品名称")
    if (!formData.productImage) return alert("上传产品图片")
    if (formData.sellingPoints.length === 0) return alert("填写核心卖点")
    setStep("storyboard")
    setSbStatus("queue")
    setSbProgress(0)
    try {
      const r = await fetch(`${API_BASE}/api/promo-video/submit`, {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({
          product_name: formData.productName, product_image: formData.productImage,
          selling_points: formData.sellingPoints, target_audience: formData.targetAudience,
          style: formData.style, duration: formData.duration, frame_count: formData.frameCount, ratio: formData.ratio,
        }),
      })
      const d = await r.json()
      if (!r.ok) { setSbStatus("fail"); setSbErr(d.detail?.message || d.detail || "提交失败"); return }
      const tid = d.task_id
      setStoryTaskId(tid)
      setSbStatus("proc")
      pollRef.current = setInterval(async () => {
        try {
          const sr = await fetch(`${API_BASE}/api/promo-video/storyboard-status?taskId=${tid}`, { credentials: "include" })
          const sd = await sr.json()
          setSbProgress(sd.progress || 0)
          if (sd.status === "storyboard_ready") {
            setSbStatus("ready"); setFrames(sd.frame_urls || []); setVidPrompt(sd.creative_prompt || "")
            stopPoll()
          } else if (sd.status === "storyboard_failed") {
            setSbStatus("fail"); setSbErr(sd.error || "分镜失败"); stopPoll()
          }
        } catch {}
      }, 3000)
    } catch (e: any) { setSbStatus("fail"); setSbErr(e.message || "网络错误") }
  }

  const toggle = (i: number) => setSelected(p => { const n = new Set(p); n.has(i) ? n.delete(i) : n.add(i); return n })

  const autoPrompt = async () => {
    if (!storyTaskId) return
    setAutoPrompting(true)
    try {
      const r = await fetch(`${API_BASE}/api/promo-video/auto-prompt`, {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({ storyboard_task_id: storyTaskId, selected_count: selected.size || 1 }),
      })
      const d = await r.json()
      if (r.ok && d.prompt) setVidPrompt(d.prompt)
    } catch {} finally { setAutoPrompting(false) }
  }

  const submitVideo = async () => {
    if (selected.size === 0) return alert("至少选中一个分镜")
    if (!vidPrompt.trim()) return alert("输入视频提示词")
    setStep("video")
    setVidStatus("queue")
    setVidProgress(0)
    try {
      const r = await fetch(`${API_BASE}/api/promo-video/generate-video`, {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({
          storyboard_task_id: storyTaskId, selected_indices: Array.from(selected), video_prompt: vidPrompt,
        }),
      })
      const d = await r.json()
      if (!r.ok) { setVidStatus("fail"); setVidErr(d.detail?.message || d.detail || "提交失败"); return }
      setVideoTaskId(d.task_id)
      setVidStatus("proc")
      pollRef.current = setInterval(async () => {
        try {
          const vr = await fetch(`${API_BASE}/api/promo-video/video-status?taskId=${d.task_id}`, { credentials: "include" })
          const vd = await vr.json()
          setVidProgress(vd.progress || 0)
          if (vd.status === "video_completed") { setVidStatus("done"); setVidUrl(vd.video_url || ""); stopPoll() }
          else if (vd.status === "video_failed") { setVidStatus("fail"); setVidErr(vd.error || "生成失败"); stopPoll() }
        } catch {}
      }, 5000)
    } catch (e: any) { setVidStatus("fail"); setVidErr(e.message || "网络错误") }
  }

  const reset = () => { stopPoll(); setStep("form"); setSbStatus("idle"); setFrames([]); setSelected(new Set()); setVidStatus("idle"); setVidUrl(""); setVidProgress(0); setVidErr(""); setVidPrompt("") }

  const Steps = () => {
    const items: { k: Step; l: string }[] = [
      { k: "form", l: "产品信息" }, { k: "storyboard", l: "分镜" }, { k: "prompt", l: "提示词" }, { k: "video", l: "视频" },
    ]
    const idx = items.findIndex(s => s.k === step)
    return (
      <div className="flex items-center gap-1.5 mb-5 text-sm">
        {items.map((s, i) => (
          <div key={s.k} className="flex items-center gap-1.5">
            <span className={i <= idx ? "text-primary font-semibold" : "text-muted-foreground"}>
              {i < idx ? "✓" : i + 1}. {s.l}
            </span>
            {i < items.length - 1 && <span className="text-muted-foreground/20 mx-0.5">→</span>}
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <Steps />

      {/* Step 1: Form */}
      {step === "form" && (
        <div className="max-w-xl mx-auto space-y-4">
          <h2 className="text-base font-semibold">产品信息</h2>
          <input type="text" placeholder="产品名称" value={formData.productName}
            onChange={e => setFormData(p => ({ ...p, productName: e.target.value }))}
            className="w-full rounded-lg border px-3 py-2 text-sm bg-background" />
          <div className="border-2 border-dashed rounded-lg p-5 text-center cursor-pointer hover:border-primary/40 transition-colors"
            onClick={() => fileRef.current?.click()}>
            {imagePreview ? <img src={imagePreview} alt="" className="max-h-32 mx-auto rounded" />
              : <div className="text-muted-foreground text-sm"><Upload className="mx-auto mb-1 h-5 w-5" /><p>上传产品图片</p></div>}
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleImage(f) }} />
          </div>
          <textarea placeholder="核心卖点（每行一个）&#10;AI智能识别&#10;高清画质" value={sellText}
            onChange={e => onSellChange(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm bg-background min-h-[80px]" />
          <input type="text" placeholder="目标受众（如 25-35岁职场女性）" value={formData.targetAudience}
            onChange={e => setFormData(p => ({ ...p, targetAudience: e.target.value }))}
            className="w-full rounded-lg border px-3 py-2 text-sm bg-background" />
          <div className="grid grid-cols-2 gap-3">
            <select value={formData.style}
              onChange={e => setFormData(p => ({ ...p, style: e.target.value }))}
              className="rounded-lg border px-3 py-2 text-sm bg-background">
              {STYLES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <select value={formData.duration}
              onChange={e => setFormData(p => ({ ...p, duration: Number(e.target.value) }))}
              className="rounded-lg border px-3 py-2 text-sm bg-background">
              {DURATIONS.map(d => <option key={d} value={d}>{d}秒</option>)}
            </select>
            <select value={formData.frameCount}
              onChange={e => setFormData(p => ({ ...p, frameCount: Number(e.target.value) as 9|16|25 }))}
              className="rounded-lg border px-3 py-2 text-sm bg-background">
              {FRAME_COUNTS.map(n => <option key={n} value={n}>{n}张</option>)}
            </select>
            <select value={formData.ratio}
              onChange={e => setFormData(p => ({ ...p, ratio: e.target.value }))}
              className="rounded-lg border px-3 py-2 text-sm bg-background">
              {RATIOS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>
          <button onClick={submitStory}
            className="w-full rounded-lg bg-primary text-primary-foreground py-2.5 font-medium hover:opacity-90 transition-opacity">
            开始生成分镜图
          </button>
        </div>
      )}

      {/* Step 2: Storyboard */}
      {step === "storyboard" && (
        <div className="max-w-3xl mx-auto space-y-4">
          {(sbStatus === "queue" || sbStatus === "proc") && (
            <div className="text-center py-12 space-y-3">
              <Loader2 className="animate-spin h-8 w-8 mx-auto text-primary" />
              <p className="text-sm text-muted-foreground">正在生成分镜图…</p>
              <div className="w-full bg-muted rounded-full h-2 max-w-sm mx-auto">
                <div className="bg-primary h-2 rounded-full transition-all duration-500" style={{ width: `${Math.min(sbProgress, 99)}%` }} />
              </div>
            </div>
          )}
          {sbStatus === "ready" && (
            <>
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold">选择分镜</h2>
                <span className="text-xs text-muted-foreground">{selected.size}/{frames.length}</span>
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {frames.map((url, i) => {
                  const full = `${API_BASE}${url}`
                  const isSel = selected.has(i)
                  return (
                    <div key={i} onClick={() => toggle(i)}
                      className={`relative rounded-lg overflow-hidden border-2 cursor-pointer transition-all aspect-[3/4] ${isSel ? "border-primary ring-2 ring-primary/20" : "border-border hover:border-primary/50"}`}>
                      <img src={full} alt={`#${i+1}`} className="w-full h-full object-cover" />
                      {isSel && <div className="absolute top-1 right-1 w-5 h-5 bg-primary rounded-full flex items-center justify-center">
                        <CheckCircle2 className="h-3 w-3 text-primary-foreground" />
                      </div>}
                      <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/60 p-1">
                        <span className="text-white text-[10px]">#{i+1}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
              <div className="flex gap-2">
                <button onClick={() => { setSbStatus("idle"); setStep("form") }}
                  className="flex-1 rounded-lg border border-border py-2 text-sm hover:bg-muted transition-colors">重新填写</button>
                <button onClick={() => { autoPrompt(); setStep("prompt") }}
                  disabled={selected.size === 0}
                  className="flex-1 rounded-lg bg-primary text-primary-foreground py-2 text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50">
                  下一步：编辑提示词
                </button>
              </div>
            </>
          )}
          {sbStatus === "fail" && (
            <div className="text-center py-12 space-y-3">
              <XCircle className="h-8 w-8 mx-auto text-destructive" />
              <p className="text-sm text-destructive">{sbErr}</p>
              <button onClick={() => { setSbStatus("idle"); setStep("form") }}
                className="rounded-lg bg-primary text-primary-foreground px-5 py-2 text-sm">返回重试</button>
            </div>
          )}
        </div>
      )}

      {/* Step 3: Prompt */}
      {step === "prompt" && (
        <div className="max-w-xl mx-auto space-y-4">
          <h2 className="text-base font-semibold">视频提示词</h2>
          <p className="text-xs text-muted-foreground">已选 {selected.size} 张分镜，可编辑或AI自动生成</p>
          <textarea value={vidPrompt} onChange={e => setVidPrompt(e.target.value)}
            className="w-full rounded-lg border px-3 py-2 text-sm bg-background min-h-[180px] font-mono leading-relaxed" />
          <div className="flex gap-2">
            <button onClick={autoPrompt} disabled={autoPrompting}
              className="flex-1 rounded-lg border border-border py-2 text-sm hover:bg-muted transition-colors disabled:opacity-50">
              {autoPrompting ? "AI生成中…" : "AI 自动生成"}
            </button>
            <button onClick={() => setStep("storyboard")}
              className="flex-1 rounded-lg border border-border py-2 text-sm hover:bg-muted transition-colors flex items-center justify-center gap-1">
              <ArrowLeft className="h-3 w-3" /> 返回选帧
            </button>
          </div>
          <button onClick={submitVideo}
            className="w-full rounded-lg bg-primary text-primary-foreground py-2.5 font-medium hover:opacity-90 transition-opacity">
            生成宣传视频
          </button>
        </div>
      )}

      {/* Step 4: Video */}
      {step === "video" && (
        <div className="max-w-xl mx-auto space-y-4">
          {(vidStatus === "queue" || vidStatus === "proc") && (
            <div className="text-center py-12 space-y-3">
              <Loader2 className="animate-spin h-8 w-8 mx-auto text-primary" />
              <p className="text-sm text-muted-foreground">正在生成宣传视频（约5-20分钟）</p>
              <div className="w-full bg-muted rounded-full h-2 max-w-sm mx-auto">
                <div className="bg-primary h-2 rounded-full transition-all duration-500" style={{ width: `${Math.min(vidProgress, 99)}%` }} />
              </div>
              <p className="text-xs text-muted-foreground">{vidProgress}%</p>
            </div>
          )}
          {vidStatus === "done" && vidUrl && (
            <>
              <h2 className="text-base font-semibold">视频生成完成</h2>
              <video controls className="w-full rounded-lg bg-black max-h-[500px]">
                <source src={`${API_BASE}${vidUrl}`} />
              </video>
              <div className="flex gap-2">
                <button onClick={reset}
                  className="flex-1 rounded-lg border border-border py-2 text-sm hover:bg-muted transition-colors">创建新视频</button>
                <a href={`${API_BASE}${vidUrl}`} target="_blank" rel="noopener noreferrer"
                  className="flex-1 rounded-lg bg-primary text-primary-foreground py-2 text-sm font-medium text-center hover:opacity-90 transition-opacity flex items-center justify-center gap-1">
                  <Download className="h-3 w-3" /> 下载
                </a>
              </div>
            </>
          )}
          {vidStatus === "fail" && (
            <div className="text-center py-12 space-y-3">
              <XCircle className="h-8 w-8 mx-auto text-destructive" />
              <p className="text-sm text-destructive">{vidErr}</p>
              <button onClick={reset}
                className="rounded-lg bg-primary text-primary-foreground px-5 py-2 text-sm">重新开始</button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
