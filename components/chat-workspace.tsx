"use client"

import * as React from "react"
import Image from "next/image"
import {
  Plus,
  MessageSquare,
  Paperclip,
  Send,
  Zap,
  Check,
  ChevronDown,
  Settings,
  ChevronLeft,
  MoreHorizontal,
  Sparkles,
  Search,
  Copy,
  PenLine,
  FileText,
  Video,
  ShoppingBag,
  Briefcase,
  Megaphone,
  Mic,
  FolderOpen,
  ChartColumn,
  Rocket,
  Gem,
  Shield,
  MessageCircle,
  Swords,
  ListTodo,
  FlaskConical,
  GitBranch,
  SpellCheck2,
  ListChecks,
  TrendingUp,
  Palette,
  Users,
  Globe,
  Scale,
  Radio,
  Loader2,
  X,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type ChatWorkspaceProps = {
  agentName?: string
  agentIcon?: React.ComponentType<{ className?: string }>
  themeColor?: string
  /** 工作台智能体头像（如 /agent-3.jpg）；有则主区顶栏与欢迎区使用圆形照片，布局对齐「历史会话」参考稿 */
  agentAvatarUrl?: string
  /** 副标题，如「视频制作导演�?*/
  agentRole?: string
  allAgents?: TeamAgentOption[]
  onAgentSwitch?: (agentName: string) => void
  onBack?: () => void
  /**
   * 從工作台卡片每次進入時遞增�?0 時從本地恢復側邊欄歷史，但中欄固定為歡迎態（新對話），不自動打開上一條會話�?   */
  entryNonce?: number
}

export type TeamAgentOption = {
  name: string
  role: string
  avatar: string
  themeColor: string
  quickPrompts: { text: string; iconKey: string }[]
}

type HistoryItem = {
  id: string
  title: string
  /** 创建时间戳，用于分组「今�?/ 昨天」等 */
  createdAt: number
}

type PromptItem = {
  text: string
  icon: React.ComponentType<{ className?: string }>
}

type ChatMessage = {
  id?: string
  role: "user" | "assistant"
  content: string
  /** 该条用户消息附带的图片张数（仅展示，不发给模型） */
  attachedImageCount?: number
  /** 發送時寫入�?data:image/...;base64,...，供歷史氣泡點擊查看原圖 */
  attachedImagePreviews?: string[]
}

type PendingImage = {
  id: string
  file: File
  previewUrl: string
}

const MAX_PENDING_IMAGES = 6
const MAX_IMAGE_FILE_BYTES = 20 * 1024 * 1024

/** 将图片通过 Canvas 压缩到合理大小（最�?1280px 边长，JPEG 质量 0.7），避免 base64 过大导致请求失败 */
const COMPRESS_MAX_SIDE = 1280
const COMPRESS_QUALITY = 0.7

function compressImageFile(file: File): Promise<File> {
  return new Promise((resolve) => {
    // 小于 200KB 的图片不压缩
    if (file.size < 200 * 1024) {
      resolve(file)
      return
    }
    const img = new window.Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      let { width, height } = img
      if (width <= COMPRESS_MAX_SIDE && height <= COMPRESS_MAX_SIDE && file.size < 500 * 1024) {
        resolve(file)
        return
      }
      // 等比缩放
      if (width > COMPRESS_MAX_SIDE || height > COMPRESS_MAX_SIDE) {
        const ratio = Math.min(COMPRESS_MAX_SIDE / width, COMPRESS_MAX_SIDE / height)
        width = Math.round(width * ratio)
        height = Math.round(height * ratio)
      }
      const canvas = document.createElement("canvas")
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext("2d")
      if (!ctx) {
        resolve(file)
        return
      }
      ctx.drawImage(img, 0, 0, width, height)
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            resolve(file)
            return
          }
          resolve(new File([blob], file.name.replace(/\.\w+$/, ".jpg"), { type: "image/jpeg" }))
        },
        "image/jpeg",
        COMPRESS_QUALITY,
      )
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      resolve(file)
    }
    img.src = url
  })
}

function fileToBase64Data(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const r = reader.result
      if (typeof r !== "string") {
        reject(new Error("读文件失败"))
        return
      }
      const comma = r.indexOf(",")
      resolve(comma >= 0 ? r.slice(comma + 1) : r)
    }
    reader.onerror = () => reject(reader.error ?? new Error("读文件失败"))
    reader.readAsDataURL(file)
  })
}

function stripLeadingWhitespacePerLine(text: string): string {
  return text
    .split("\n")
    .map((line) => line.replace(/^[\s\u3000]+/u, ""))
    .join("\n")
}

/** 发往 /api/ai/chat-stream 的纯文本轮次（不含当前这条；空助手占位会跳过�?*/
const MAX_API_HISTORY_MESSAGES = 40
const MAX_API_HISTORY_CHARS_PER_MESSAGE = 24_000

function buildConversationHistoryForApi(msgs: ChatMessage[]): { role: "user" | "assistant"; content: string }[] {
  const out: { role: "user" | "assistant"; content: string }[] = []
  for (const m of msgs) {
    if (m.role !== "user" && m.role !== "assistant") continue
    const c = typeof m.content === "string" ? m.content : ""
    if (m.role === "assistant" && !c.trim()) continue
    const clipped =
      c.length > MAX_API_HISTORY_CHARS_PER_MESSAGE
        ? `${c.slice(0, MAX_API_HISTORY_CHARS_PER_MESSAGE)}\n…（上文已截断）`
        : c
    out.push({ role: m.role, content: clipped })
  }
  let tail = out.length > MAX_API_HISTORY_MESSAGES ? out.slice(-MAX_API_HISTORY_MESSAGES) : out
  while (tail.length > 0 && tail[0].role === "assistant") {
    tail = tail.slice(1)
  }
  return tail
}

function formatHistoryDateLabel(createdAt: number): string {
  const now = new Date()
  const d = new Date(createdAt)
  const startOfDay = (x: Date) =>
    new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const diffDays = Math.round((startOfDay(now) - startOfDay(d)) / 86400000)
  if (diffDays <= 0) return "今天"
  if (diffDays === 1) return "昨天"
  if (diffDays === 2) return "前天"
  if (diffDays < 7) return `${diffDays}天前`
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}周前`
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

function truncateChatTitle(text: string): string {
  const t = text.replace(/\s+/g, " ").trim()
  if (t.length <= 26) return t || "新对话"
  return `${t.slice(0, 26)}…`
}

/** 同一浏览器内区分「访客」持久命名空间；日后若有登录可替换为真实 userId */
const DEVICE_USER_KEY = "creative-studio-device-user-id"
const CHAT_STORE_VERSION = 1 as const

type PersistedAgentChatState = {
  v: typeof CHAT_STORE_VERSION
  historyItems: HistoryItem[]
  chatSessions: Record<string, ChatMessage[]>
  selectedChatId: string | null
}

function getOrCreateDeviceUserId(): string {
  if (typeof window === "undefined") return ""
  try {
    let id = localStorage.getItem(DEVICE_USER_KEY)
    if (!id || id.length < 8) {
      id = crypto.randomUUID()
      localStorage.setItem(DEVICE_USER_KEY, id)
    }
    return id
  } catch {
    return "local-anonymous"
  }
}

function buildAgentChatStorageKey(agentName: string): string {
  const uid = getOrCreateDeviceUserId()
  return `copywriting-chat:v${CHAT_STORE_VERSION}:${uid}:${encodeURIComponent(agentName)}`
}

function parseStoredAgentState(raw: string | null): PersistedAgentChatState | null {
  if (!raw) return null
  try {
    const data = JSON.parse(raw) as PersistedAgentChatState
    if (data.v !== CHAT_STORE_VERSION || !Array.isArray(data.historyItems)) return null
    const sessions =
      data.chatSessions && typeof data.chatSessions === "object"
        ? (data.chatSessions as Record<string, ChatMessage[]>)
        : {}
    const ids = new Set(data.historyItems.map((h) => h.id))
    const pruned: Record<string, ChatMessage[]> = {}
    for (const id of ids) {
      const msgs = sessions[id]
      if (Array.isArray(msgs)) pruned[id] = ensureChatMessageIds(msgs)
    }
    let selected: string | null =
      data.selectedChatId === null ? null : String(data.selectedChatId)
    if (selected && !ids.has(selected)) selected = null
    return {
      v: CHAT_STORE_VERSION,
      historyItems: data.historyItems as HistoryItem[],
      chatSessions: pruned,
      selectedChatId: selected,
    }
  } catch {
    return null
  }
}

function ensureChatMessageIds(messages: ChatMessage[]): ChatMessage[] {
  let changed = false
  const next = messages.map((m) => {
    if (m && typeof m.id === "string" && m.id.trim()) return m
    changed = true
    return { ...m, id: crypto.randomUUID() }
  })
  return changed ? next : messages
}

async function consumeDeepSeekStream(
  response: Response,
  onDelta: (chunk: string) => void,
): Promise<void> {
  const reader = response.body?.getReader()
  if (!reader) throw new Error("响应无可读流")
  const decoder = new TextDecoder()
  let carry = ""
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    carry += decoder.decode(value, { stream: true })
    const lines = carry.split("\n")
    carry = lines.pop() ?? ""
    for (const rawLine of lines) {
      const line = rawLine.trim()
      if (!line.startsWith("data:")) continue
      const payload = line.slice(5).trim()
      if (payload === "[DONE]") return
      try {
        const json = JSON.parse(payload) as Record<string, unknown>
        const cc = json as { choices?: { delta?: { content?: string } }[] }
        const ccPiece = cc.choices?.[0]?.delta?.content
        if (typeof ccPiece === "string" && ccPiece.length > 0) {
          onDelta(ccPiece)
          continue
        }
        const typ = json.type
        if (
          typ === "response.output_text.delta" &&
          typeof json.delta === "string" &&
          json.delta.length > 0
        ) {
          onDelta(json.delta)
        }
      } catch {
      }
    }
  }
}

const quickPrompts: PromptItem[] = [
  { text: "帮我写一篇小红书种草笔记", icon: PenLine },
  { text: "生成3个爆款标题方案", icon: Sparkles },
  { text: "润色优化我的文案内容", icon: FileText },
  { text: "写一段短视频带货口播稿", icon: Video },
  { text: "设计一组朋友圈营销文案", icon: Megaphone },
  { text: "生成电商产品卖点描述", icon: ShoppingBag },
  { text: "帮我写一封商务合作邮件", icon: Briefcase },
  { text: "把这段话改成小红书风格", icon: Zap },
  { text: "给我一版用户痛点开场文案", icon: MessageSquare },
  { text: "输出3种不同语气的版本", icon: Sparkles },
  { text: "帮我补一句行动号召结尾", icon: PenLine },
]

const quickPromptsByAgent: Partial<Record<string, PromptItem[]>> = {
  "小红书爆款制造机": [
    { text: "写一篇小红书护肤种草笔记", icon: PenLine },
    { text: "给我3个高点击封面标题", icon: Sparkles },
    { text: "这段文案改成小红书口吻", icon: FileText },
    { text: "帮我做一版评论区互动引导", icon: MessageSquare },
    { text: "生成一版种草笔记开头钩子", icon: Zap },
    { text: "补一段不生硬的转化结尾", icon: Megaphone },
  ],
  "专业公文润色专家": [
    { text: "把这份通知改成正式公文格式", icon: FileText },
    { text: "帮我润色一份请示报告", icon: PenLine },
    { text: "生成一版会议纪要模板", icon: Briefcase },
    { text: "优化这段公文语气和措辞", icon: Zap },
    { text: "把这份通报改成机关单位常用文风", icon: FileText },
    { text: "给我一版简洁版与一版正式版", icon: Sparkles },
    { text: "生成一份可直接套用的请示模板", icon: Briefcase },
    { text: "把口语化内容改成规范书面表达", icon: PenLine },
    { text: "补充结尾落款与时间格式", icon: MessageSquare },
    { text: "输出一版可用于上会汇报的摘要", icon: Megaphone },
    { text: "检查并统一全文标点和术语", icon: Zap },
    { text: "生成一版会议通知+附件说明", icon: FileText },
  ],
  "短视频脚本": [
    { text: "写一段30秒口播脚本", icon: Video },
    { text: "生成开头5秒钩子文案", icon: Sparkles },
    { text: "把这段内容改成分镜脚本", icon: FileText },
    { text: "给我一个结尾转化CTA", icon: Megaphone },
  ],
  "电商带货话术": [
    { text: "生成直播间开场暖场话术", icon: ShoppingBag },
    { text: "写一版限时促单话术", icon: Sparkles },
    { text: "整理产品卖点讲解顺序", icon: FileText },
    { text: "帮我设计异议处理回复", icon: MessageSquare },
  ],
  "品牌宣传标语助手": [
    { text: "为品牌生成10条slogan", icon: Megaphone },
    { text: "写一组品牌主张短语", icon: PenLine },
    { text: "优化品牌介绍文案语调", icon: FileText },
    { text: "生成节日传播主题词", icon: Sparkles },
  ],
  "职场邮件优化": [
    { text: "润色这封英文商务邮件", icon: Briefcase },
    { text: "写一封项目延期说明邮件", icon: FileText },
    { text: "生成催办但不失礼貌的邮件", icon: PenLine },
    { text: "帮我优化邮件主题行", icon: Zap },
    { text: "生成一版会议邀请邮件模板", icon: MessageSquare },
    { text: "把内容改成更高情商表达", icon: Sparkles },
    { text: "输出中英双语邮件版本", icon: FileText },
    { text: "写一版跟进客户的二次触达邮件", icon: Briefcase },
  ],
  "朋友圈撰写文案": [
    { text: "帮我写一条周一早安朋友圈文案", icon: Sparkles },
    { text: "生成3版不同语气的产品推广朋友圈", icon: MessageSquare },
    { text: "把这段活动信息改成有温度的朋友圈", icon: FileText },
    { text: "写一条不硬广的朋友圈种草文案", icon: PenLine },
    { text: "设计一条节日营销朋友圈模板", icon: Megaphone },
    { text: "给我一条适合配图发布的短文案", icon: ShoppingBag },
    { text: "把这段话改成更口语化朋友圈风格", icon: Zap },
    { text: "生成一条带强CTA 的转化型朋友圈", icon: Briefcase },
  ],
  口播文案创作: [
    { text: "写一段30秒产品口播稿，带开场钩子", icon: Mic },
    { text: "把这段卖点改成30秒抖音口播", icon: Video },
    { text: "生成直播间憋单催单的口播节奏", icon: Zap },
    { text: "给我一版数字人口播用的分段停顿稿", icon: FileText },
    { text: "把文案改成更好念的口语，去掉书面语", icon: PenLine },
    { text: "写一条短视频开头3秒抓人口播", icon: Sparkles },
  ],
  整理资料: [
    { text: "把这段会议记录整理成要点清单", icon: FolderOpen },
    { text: "帮我把素材按主题归档并写一句话摘要", icon: FileText },
    { text: "把这篇长文提炼成可复用的资料卡片", icon: PenLine },
    { text: "生成一页读书笔记结构（概念/例子/行动）", icon: Sparkles },
    { text: "给这批链接和笔记做目录/标签方案", icon: MessageSquare },
  ],
  分析信息: [
    { text: "分析这组数据的结论与风险点", icon: ChartColumn },
    { text: "对比两份方案的利弊并给建议", icon: Zap },
    { text: "从这份报告中提取关键指标与趋势", icon: FileText },
    { text: "帮我做利害关系人与诉求梳理", icon: MessageSquare },
    { text: "列出决策前还需要补充的信息清单", icon: PenLine },
  ],
  拆解逻辑: [
    { text: "拆解这段论证的前提与结论是否成立", icon: GitBranch },
    { text: "用金字塔结构重写这个表达", icon: FileText },
    { text: "找出这段话里的逻辑跳跃与隐含假设", icon: Zap },
    { text: "把复杂问题拆成子问题清单", icon: Sparkles },
    { text: "检查这段表述有没有概念偷换或循环论证", icon: PenLine },
  ],
  优化表达: [
    { text: "把这段话改得更简洁有力", icon: SpellCheck2 },
    { text: "同一意思给出正式版与口语版", icon: FileText },
    { text: "润色这段中文，去掉重复和套话", icon: PenLine },
    { text: "把技术说明改成非专业人士能懂的版本", icon: MessageSquare },
    { text: "统一全文术语并保持语气一致", icon: Zap },
  ],
  AI面试题: [
    { text: "生成10道前端中级技术面+考察点", icon: ListChecks },
    { text: "按我的简历出一轮行为面试STAR题", icon: PenLine },
    { text: "出一道系统设计题：短链服务，附追问", icon: Sparkles },
    { text: "校招产品岗笔试：选择题+简答题", icon: FileText },
    { text: "模拟面试官追问：针对这段项目经历", icon: MessageSquare },
    { text: "数据分析师SQL与统计题+答案要点", icon: Zap },
  ],
  /** 工作台「我的智能体团队」——快捷指令与卡片角色、标签一一对应 */
  灵犀: [
    { text: "帮我写一份30秒短视频完整分镜表（含画面与台词）", icon: Video },
    { text: "把这段剧情改成分镜顺序+镜头描述+口播要点", icon: FileText },
    { text: "生成数字人口播一镜到底的节奏与停顿提示", icon: Mic },
    { text: "给我一份剪辑转场与 BGM 情绪对照清单", icon: Sparkles },
    { text: "从选题到标题写一份爆款短视频策划大纲", icon: Zap },
    { text: "3个开头5秒钩子方案并各配一句画面提示", icon: PenLine },
  ],
  行远: [
    { text: "根据我贴的周报数据写一页经营简报摘要", icon: ChartColumn },
    { text: "帮我拆解本月增长的驱动因素与主要风险", icon: TrendingUp },
    { text: "把表格里的数字整理成可汇报的结论与下一步建议", icon: FileText },
    { text: "生成一份「曝光-转化-复购」漏斗解读话术", icon: Megaphone },
    { text: "对比上上周与本周核心指标变化并说明可能原因", icon: Sparkles },
    { text: "列出下周最值得跟进3个数据动作与观测口径", icon: ListChecks },
  ],
  灵汐: [
    { text: "基于这个话题生成5张灵感闪卡（角度+一句话钩子）", icon: Sparkles },
    { text: "帮我列本周适合二创的热点选题清单（带平台感）", icon: TrendingUp },
    { text: "把这条热点新闻改成3个短视频二创切入方向", icon: Video },
    { text: "给我一版跨界联想的选题脑暴（不少于8条）", icon: Zap },
    { text: "结合我的赛道推荐今天可蹭的热点与切入话术", icon: MessageSquare },
    { text: "设计「热点+人设」的创作者开头5秒话术", icon: PenLine },
  ],
  知行: [
    { text: "用自然语言描述需求，帮我写查询思路与示例SQL 骨架", icon: ListChecks },
    { text: "解释这份留存曲线可能的原因并提出归因假设", icon: ChartColumn },
    { text: "帮我设计一个简单的增长看板：指标树+更新频率", icon: FileText },
    { text: "把业务问题翻译成可分析的维度、口径与对照", icon: GitBranch },
    { text: "写一份活动效果的归因分析框架（渠道/人群/时间）", icon: Sparkles },
    { text: "检查这段统计口径表述有没有歧义或常见陷阱", icon: Zap },
  ],
  暖暖: [
    { text: "帮我写企微新客首日欢迎与破冰 SOP 话术", icon: Users },
    { text: "按客户标签设计一套活动触达SOP 大纲（含节奏）", icon: Briefcase },
    { text: "生成私域社群早报模板+3个互动话题", icon: MessageSquare },
    { text: "写一版促复购的会员关怀话术（克制不打扰）", icon: Megaphone },
    { text: "给我沉睡用户召回的三段式话术（触达-利益-行动）", icon: Sparkles },
    { text: "整理企微常见咨询的标准回复库（30条以内）", icon: FileText },
  ],
  织梦: [
    { text: "根据品牌调性给主色、辅色、中性色与禁用色说明", icon: Palette },
    { text: "帮我写短视频封面的标题字风格与画面氛围brief", icon: Video },
    { text: "给新品海报写3种视觉风格方向（配色+构图文字说明）", icon: Sparkles },
    { text: "从slogan 延伸成主视觉创意 brief（情绪+元素）", icon: Megaphone },
    { text: "输出公众号头图的配色、构图与字体层级建议", icon: FileText },
    { text: "写一组电商主图背景统一风格与留白规范要求", icon: PenLine },
  ],
  清岚: [
    { text: "按我的目标岗位生成10道高频技术面+考察点", icon: ListChecks },
    { text: "根据这段项目经历写一个STAR 行为面试回答", icon: PenLine },
    { text: "模拟压力面：针对我的简历连续追问", icon: MessageSquare },
    { text: "帮我把简历项目描述改得更量化、好看", icon: FileText },
    { text: "校招产品岗：出笔试选择题+简答题", icon: Sparkles },
    { text: "给这份JD 写一份匹配度自检清单", icon: Zap },
  ],
  文砚: [
    { text: "把下面这段讨论整理成会议纪要（决定+待办）", icon: FileText },
    { text: "从杂乱记录里提取待办、责任人与截止时间", icon: ListChecks },
    { text: "生成周例会纪要模板（含风险与跟进项）", icon: FolderOpen },
    { text: "把录音转写要点改成可发给老板的半页摘要", icon: Megaphone },
    { text: "检查这份纪要有没有遗漏决策口径", icon: Zap },
    { text: "输出一版项目评审会的结论追踪表", icon: Briefcase },
  ],
  商策: [
    { text: "帮我做三家竞品的对比矩阵（维度自定）", icon: ChartColumn },
    { text: "围绕新品写一份SWOT 与机会假设", icon: TrendingUp },
    { text: "把零散信息整理成一页市场简报结构", icon: FileText },
    { text: "分析竞品定价与渠道策略的差异点", icon: Sparkles },
    { text: "给立项材料写「市场背景」段落提纲", icon: PenLine },
    { text: "列出进入新城市前需要验证的5个假设", icon: GitBranch },
  ],
  语禾: [
    { text: "把这段中文卖点改成地道英文亚马逊listing", icon: Globe },
    { text: "把这封邮件改成日语商务礼貌体", icon: FileText },
    { text: "统一中英术语表：产品名与功能词各10组", icon: ListChecks },
    { text: "把社媒短文案改成适合东南亚语气的版本", icon: MessageSquare },
    { text: "检查这段翻译有没有文化踩雷", icon: Zap },
    { text: "生成出海官网首屏 Hero 区中英对照文案", icon: Megaphone },
  ],
  景烁: [
    { text: "6小时场写一份排品憋单节奏", icon: Radio },
    { text: "写一段限时秒杀的逼单话术（不低俗）", icon: Megaphone },
    { text: "设计福袋口令与互动问题各3个", icon: Sparkles },
    { text: "根据本场目标写开播暖场留人话术", icon: Video },
    { text: "给这场直播写复盘提纲（流量-转化-话术）", icon: ChartColumn },
    { text: "把这款爆品讲清楚：卖点顺序+对比话术", icon: ShoppingBag },
  ],
  律衡: [
    { text: "把这段服务协议改成要点清单（白话版）", icon: Scale },
    { text: "标出这份合同里常见的风险条款并解释含义", icon: FileText },
    { text: "把保密条款改写成给业务同事看的摘要", icon: PenLine },
    { text: "对比甲乙两份模板的核心义务差异", icon: GitBranch },
    { text: "列出签前需要向对方确认的5个问题", icon: ListChecks },
    { text: "把这段法律术语改成非专业人士能懂的版本", icon: MessageSquare },
  ],
  IP文案助手: [
    { text: "根据我的人设生成3条小红书笔记", icon: PenLine },
    { text: "写一段抖音口播脚本，突出我的专业感", icon: Video },
    { text: "生成公众号长文大纲，体现深度思考", icon: FileText },
    { text: "帮我写朋友圈人设打造的5条内容", icon: MessageSquare },
    { text: "给我一版自我介绍，用于各个平台", icon: Sparkles },
    { text: "输出3种不同语气的人设文案版本", icon: Zap },
  ],
  视频导演: [
    { text: "写一段30秒产品口播稿，带开场钩子", icon: Video },
    { text: "把这段卖点改成15秒短视频脚本", icon: PenLine },
    { text: "生成一套口播类视频模板的选题规划", icon: Sparkles },
    { text: "给我一版数字人口播用的分段停顿稿", icon: Mic },
    { text: "把文案改成好念的口语，去掉书面语", icon: MessageSquare },
    { text: "写一条短视频开头5秒钩子文案", icon: Zap },
  ],
}

const teamQuickPromptIconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  sparkles: Sparkles,
  briefcase: Briefcase,
  users: Users,
  "list-checks": ListChecks,
  rocket: Rocket,
  "trending-up": TrendingUp,
  "git-branch": GitBranch,
  scale: Scale,
  gem: Gem,
  shield: Shield,
  megaphone: Megaphone,
  "message-circle": MessageCircle,
  swords: Swords,
  "list-todo": ListTodo,
  "flask-conical": FlaskConical,
  search: Search,
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function ChatWorkspace({
  agentName = "小红书爆款制造机",
  agentIcon: AgentIcon = Sparkles,
  themeColor,
  agentAvatarUrl,
  agentRole,
  allAgents,
  onAgentSwitch,
  onBack,
  entryNonce = 0,
}: ChatWorkspaceProps) {
  const useTeamLayout = Boolean(agentAvatarUrl)
  const [selectedChat, setSelectedChat] = React.useState<string | null>(null)
  const [inputValue, setInputValue] = React.useState("")
  const [messages, setMessages] = React.useState<ChatMessage[]>([])
  const [historyItems, setHistoryItems] = React.useState<HistoryItem[]>([])
  const [historySearch, setHistorySearch] = React.useState("")
  const [chatSessions, setChatSessions] = React.useState<Record<string, ChatMessage[]>>({})
  const [isSending, setIsSending] = React.useState(false)
  const isSendingRef = React.useRef(false)
  const abortRef = React.useRef<AbortController | null>(null)
  const agentNameRef = React.useRef(agentName)
  agentNameRef.current = agentName
  const [agentPickerOpen, setAgentPickerOpen] = React.useState(false)
  const [quickMenuOpen, setQuickMenuOpen] = React.useState(false)
  /** 點擊歷史訊息附圖時全屏預覽的 data URL */
  const [lightboxSrc, setLightboxSrc] = React.useState<string | null>(null)
  const textareaRef = React.useRef<HTMLTextAreaElement>(null)
  const fileInputRef = React.useRef<HTMLInputElement>(null)
  const scrollAnchorRef = React.useRef<HTMLDivElement>(null)
  const selectedAgent = React.useMemo(
    () => allAgents?.find((item) => item.name === agentName),
    [allAgents, agentName],
  )
  /** 避免 handleSend �?useCallback 闭包读到过期�?inputValue（否则点击发送时 text 恒为空） */
  const inputValueRef = React.useRef(inputValue)
  inputValueRef.current = inputValue
  const [pendingImages, setPendingImages] = React.useState<PendingImage[]>([])
  const pendingImagesRef = React.useRef(pendingImages)
  pendingImagesRef.current = pendingImages
  const resolvedQuickPrompts = React.useMemo(() => {
    if (selectedAgent?.quickPrompts?.length) {
      return selectedAgent.quickPrompts.map((item) => ({
        text: item.text,
        icon: teamQuickPromptIconMap[item.iconKey] ?? Sparkles,
      }))
    }
    return quickPromptsByAgent[agentName] ?? quickPrompts
  }, [selectedAgent, agentName])
  const shuffledQuickPrompts = React.useMemo(() => {
    const prompts = [...resolvedQuickPrompts]
    for (let i = prompts.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[prompts[i], prompts[j]] = [prompts[j], prompts[i]]
    }
    return prompts
  }, [resolvedQuickPrompts, agentName, entryNonce])
  const displayedQuickPrompts = React.useMemo(
    () => shuffledQuickPrompts.slice(0, 6),
    [shuffledQuickPrompts]
  )
  const inputPlaceholder = useTeamLayout
    ? "在这里输入消息，按 Enter 发送"
    : `${agentName}：输入你的创作需求…`
  const promptSizeClasses = ["px-4", "px-5", "px-4", "px-5", "px-4", "px-5"]

  const welcomeIntro = React.useMemo(() => {
    const who = agentRole
      ? `我是您的${agentRole}「${agentName}」。`
      : `我是「${agentName}」。`
    return `您好${who}，请简要描述您想了解或完成的任务，我会尽力为您解答。`
  }, [agentName, agentRole])

  const [welcomeAt] = React.useState(() => Date.now())
  const welcomeTimeLabel = React.useMemo(
    () =>
      new Date(welcomeAt).toLocaleString("zh-CN", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }),
    [welcomeAt],
  )

  const filteredHistoryItems = React.useMemo(() => {
    const q = historySearch.trim().toLowerCase()
    if (!q) return historyItems
    return historyItems.filter((h) => h.title.toLowerCase().includes(q))
  }, [historyItems, historySearch])

  /** 切换智能体或初次挂载时先禁止写入本地，避免把上一个智能体的会话误写入当前 key */
  const [allowPersist, setAllowPersist] = React.useState(false)
  const handledEntryNonceRef = React.useRef<number | null>(null)

  React.useLayoutEffect(() => {
    setAllowPersist(false)
  }, [agentName, entryNonce])

  React.useEffect(() => {
    abortRef.current?.abort()
    abortRef.current = null
    const key = buildAgentChatStorageKey(agentName)
    const loaded = typeof window !== "undefined" ? localStorage.getItem(key) : null
    const parsed = parseStoredAgentState(loaded)

    if (parsed) {
      const sessions = parsed.chatSessions
      setHistoryItems(parsed.historyItems)
      setChatSessions(sessions)

      const shouldForceWelcome = entryNonce > 0 && handledEntryNonceRef.current !== entryNonce
      handledEntryNonceRef.current = entryNonce

      if (shouldForceWelcome) {
        /** 從工作台卡片進入：保留側邊欄歷史，中欄始終為歡迎 / 新對�?*/
        setSelectedChat(null)
        setMessages([])
      } else {
        let sel = parsed.selectedChatId
        if (sel && !sessions[sel]) sel = null
        if (!sel && parsed.historyItems.length > 0) {
          sel = parsed.historyItems[0].id
        }
        if (sel && sessions[sel]?.length) {
          setSelectedChat(sel)
          setMessages(sessions[sel])
        } else {
          const fallback = parsed.historyItems.find((h) => (sessions[h.id]?.length ?? 0) > 0)
          if (fallback) {
            setSelectedChat(fallback.id)
            setMessages(sessions[fallback.id] ?? [])
          } else {
            setSelectedChat(null)
            setMessages([])
          }
        }
      }
    } else {
      setHistoryItems([])
      setChatSessions({})
      setSelectedChat(null)
      setMessages([])
    }

    setInputValue("")
    setQuickMenuOpen(false)
    setPendingImages((prev) => {
      prev.forEach((p) => URL.revokeObjectURL(p.previewUrl))
      return []
    })
    setAllowPersist(true)
  }, [agentName, entryNonce])

  React.useEffect(() => {
    return () => {
      abortRef.current?.abort()
      abortRef.current = null
    }
  }, [])

  React.useEffect(() => {
    if (selectedChat == null) return
    setChatSessions((prev) => ({ ...prev, [selectedChat]: messages }))
  }, [messages, selectedChat])

  /** 供持久化 effect 读取最新快照（防抖回调里不能用陈旧闭包�?*/
  const persistRef = React.useRef({
    agentName,
    historyItems,
    chatSessions,
    selectedChat,
    messages,
  })
  persistRef.current = { agentName, historyItems, chatSessions, selectedChat, messages }

  /**
   * 用单一字符串指纹触发持久化，避免把 messages 等数组直接放进依赖导致依赖数组长度异�?   * （部分环境下可能被误判为可变长度 deps）�?   */
  const persistFingerprint = React.useMemo(
    () =>
      JSON.stringify({
        historyItems,
        chatSessions,
        messages,
      }),
    [historyItems, chatSessions, messages],
  )

  /**
   * 会话列表与每条对话持久化�?localStorage�?   * 必须把当�?messages 合并进快照：新建会话同一轮渲染里「写 history」先�?chatSessions 的同�?effect�?   * 若只�?chatSessions 会漏掉新 id，表现为侧边栏永远不增加新对话或刷新后丢失�?   */
  React.useEffect(() => {
    if (!allowPersist || typeof window === "undefined") return

    const tid = window.setTimeout(() => {
      const { agentName: an, historyItems: hi, chatSessions: cs, selectedChat: sel, messages: msgs } =
        persistRef.current
      const key = buildAgentChatStorageKey(an)
      const ids = new Set(hi.map((h) => h.id))
      const prunedSessions: Record<string, ChatMessage[]> = {}
      for (const id of ids) {
        if (cs[id]) prunedSessions[id] = cs[id]
      }
      if (sel != null && ids.has(sel)) {
        prunedSessions[sel] = msgs
      }
      let selected = sel
      if (selected && !ids.has(selected)) selected = null

      const payload: PersistedAgentChatState = {
        v: CHAT_STORE_VERSION,
        historyItems: hi,
        chatSessions: prunedSessions,
        selectedChatId: selected,
      }
      try {
        localStorage.setItem(key, JSON.stringify(payload))
      } catch (e) {
        console.warn("[ChatWorkspace] 本地存储写入失败（配额或隐私模式）", e)
      }
    }, 280)

    return () => window.clearTimeout(tid)
  }, [allowPersist, agentName, selectedChat, persistFingerprint])

  const lastAssistant = React.useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      if (messages[i].role === "assistant") return messages[i].content
    }
    return null
  }, [messages])

  React.useEffect(() => {
    scrollAnchorRef.current?.scrollIntoView({ behavior: "smooth", block: "end" })
  }, [messages, isSending])

  React.useEffect(() => {
    if (lightboxSrc == null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightboxSrc(null)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [lightboxSrc])

  /**
   * 文案智能体：无图�?DeepSeek；有图且配置了方舟则�?`chat-stream` 里火�?Vision（Chat Completions）�?   * System 由服务端�?agentName 注入；密钥见 `.env` 说明�?   */
  const handleSendMessage = React.useCallback(async () => {
    const text = inputValueRef.current.trim()
    const imgs = pendingImagesRef.current
    if ((!text && imgs.length === 0) || isSendingRef.current) return
    
    isSendingRef.current = true
    setIsSending(true)

    abortRef.current?.abort()
    abortRef.current = null

    const requestAgentName = agentNameRef.current
    let timeoutId: number | undefined
    let abortedByTimeout = false
    let requestController: AbortController | null = null

    try {
      let imagePayload: { mimeType: string; dataBase64: string }[] | undefined
      let imageDataUrlsForHistory: string[] | undefined
      if (imgs.length > 0) {
        const bundled = await Promise.all(
          imgs.map(async (p) => {
            const compressed = await compressImageFile(p.file)
            const mimeType = compressed.type || "image/jpeg"
            const dataBase64 = (await fileToBase64Data(compressed)).replace(/\s/g, "")
            return {
              mimeType,
              dataBase64,
              dataUrl: `data:${mimeType};base64,${dataBase64}`,
            }
          }),
        )
        imagePayload = bundled.map(({ mimeType, dataBase64 }) => ({ mimeType, dataBase64 }))
        imageDataUrlsForHistory = bundled.map((b) => b.dataUrl)
      }

      let sessionId = selectedChat
      if (sessionId === null) {
        sessionId = crypto.randomUUID()
        const title = truncateChatTitle(text)
        const createdAt = Date.now()
        setHistoryItems((prev) => [{ id: sessionId!, title, createdAt }, ...prev])
        setSelectedChat(sessionId)
      }

      const conversationHistory = buildConversationHistoryForApi(messages)

      setInputValue("")
      setPendingImages((prev) => {
        prev.forEach((p) => URL.revokeObjectURL(p.previewUrl))
        return []
      })

      const userBubbleContent =
        text ||
        (imagePayload && imagePayload.length > 0 ? `已上传${imagePayload.length} 张图片` : "")

      setMessages((prev) => {
        const userMsg: ChatMessage = {
          id: crypto.randomUUID(),
          role: "user",
          content: userBubbleContent,
          attachedImageCount: imagePayload?.length,
          ...(imageDataUrlsForHistory?.length ? { attachedImagePreviews: imageDataUrlsForHistory } : {}),
        }
        const assistantMsg: ChatMessage = { id: crypto.randomUUID(), role: "assistant", content: "" }
        return [...prev, userMsg, assistantMsg]
      })
      const controller = new AbortController()
      requestController = controller
      abortRef.current = controller
      timeoutId = window.setTimeout(() => {
        abortedByTimeout = true
        controller.abort()
      }, 120_000)

      const response = await fetch("/api/ai/chat-stream", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
        body: JSON.stringify({
          userMessage: text,
          agentName: requestAgentName,
          ...(conversationHistory.length > 0 ? { conversationHistory } : {}),
          ...(imagePayload && imagePayload.length > 0 ? { images: imagePayload } : {}),
        }),
        signal: controller.signal,
      })
      
      if (timeoutId != null) window.clearTimeout(timeoutId)

      if (!response.ok) {
        let detail = `HTTP ${response.status}`
        try {
          const j = (await response.json()) as { detail?: string }
          if (typeof j.detail === "string") detail = j.detail
        } catch {
          /* ignore */
        }
        setMessages((prev) => {
          const next = [...prev]
          const last = next[next.length - 1]
          if (last?.role === "assistant") {
            next[next.length - 1] = { ...last, content: `⚠️ ${detail}` }
          } else {
            next.push({ id: crypto.randomUUID(), role: "assistant", content: `⚠️ ${detail}` })
          }
          return next
        })
        return
      }

      await consumeDeepSeekStream(response, (delta) => {
        if (abortRef.current !== controller) return
        if (agentNameRef.current !== requestAgentName) return
        setMessages((prev) => {
          const next = [...prev]
          const i = next.length - 1
          if (i < 0 || next[i].role !== "assistant") return prev
          next[i] = {
            ...next[i],
            content: next[i].content + delta,
          }
          return next
        })
      })

      setMessages((prev) => {
        if (abortRef.current !== controller) return prev
        if (agentNameRef.current !== requestAgentName) return prev
        const next = [...prev]
        const i = next.length - 1
        if (i >= 0 && next[i].role === "assistant") {
          next[i] = {
            ...next[i],
            content: stripLeadingWhitespacePerLine(next[i].content),
          }
        }
        return next
      })
    } catch (err) {
      const isAbort =
        (err instanceof DOMException && err.name === "AbortError") ||
        (err instanceof Error && err.name === "AbortError")
      if (isAbort && !abortedByTimeout && requestController && abortRef.current !== requestController) {
        return
      }
      const msg = err instanceof Error ? err.message : "请稍后重试"
      const finalMsg = isAbort && abortedByTimeout ? "请求超时，请稍后重试" : msg
      setMessages((prev) => {
        const next = [...prev]
        const i = next.length - 1
        if (i >= 0 && next[i].role === "assistant") {
          next[i] = {
            ...next[i],
            content:
              next[i].content.trim() === ""
                ? `⚠️ 网络异常：${finalMsg}。请确认 AI 服务密钥：本地写入 .env.local 并重启dev；线上在托管平台后台 Environment variables 配置并重新部署。`
                : `${next[i].content}\n\n⚠️ 流式中断：${finalMsg}`,
          }
        } else {
          next.push({
            id: crypto.randomUUID(),
            role: "assistant",
            content: `⚠️ 网络异常：${finalMsg}。请确认 AI 服务密钥：本地写入 .env.local 并重启dev；线上在托管平台后台 Environment variables 配置并重新部署。`,
          })
        }
        return next
      })
    } finally {
      if (timeoutId != null) window.clearTimeout(timeoutId)
      if (requestController && abortRef.current === requestController) abortRef.current = null
      isSendingRef.current = false
      setIsSending(false)
    }
  }, [agentName, selectedChat, messages])

  const removePendingImage = React.useCallback((id: string) => {
    setPendingImages((prev) => {
      const p = prev.find((x) => x.id === id)
      if (p) URL.revokeObjectURL(p.previewUrl)
      return prev.filter((x) => x.id !== id)
    })
  }, [])

  const handleAttachmentClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files?.length) return
    for (const file of Array.from(files)) {
      if (file.type.startsWith("image/")) {
        if (file.size > MAX_IMAGE_FILE_BYTES) {
          setInputValue((prev) => {
            const warn = `⚠️ 图片「${file.name}」超过20MB，已跳过`
            return prev.trim() ? `${prev.trim()}\n${warn}` : warn
          })
          continue
        }
        setPendingImages((prev) => {
          if (prev.length >= MAX_PENDING_IMAGES) return prev
          const id = crypto.randomUUID()
          return [...prev, { id, file, previewUrl: URL.createObjectURL(file) }]
        })
      } else {
        setInputValue((prev) => {
          const line = `【附件】${file.name}`
          if (!prev.trim()) return line
          return `${prev.trim()}\n\n${line}`
        })
      }
    }
    textareaRef.current?.focus()
    e.target.value = ""
  }

  /* Auto-resize textarea */
  React.useEffect(() => {
    const ta = textareaRef.current
    if (ta) {
      ta.style.height = "auto"
      ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`
    }
  }, [inputValue])

  /** 按「今�?昨天」等分组，组内保持列表顺序（新会话插在最前） */
  const groupedHistorySections = React.useMemo(() => {
    const buckets = new Map<string, HistoryItem[]>()
    for (const item of filteredHistoryItems) {
      const label = formatHistoryDateLabel(item.createdAt)
      if (!buckets.has(label)) buckets.set(label, [])
      buckets.get(label)!.push(item)
    }
    return Array.from(buckets.entries()).sort((a, b) => {
      const maxIn = (items: HistoryItem[]) => Math.max(...items.map((x) => x.createdAt))
      return maxIn(b[1]) - maxIn(a[1])
    })
  }, [filteredHistoryItems])

  const openHistorySession = React.useCallback((item: HistoryItem) => {
    setSelectedChat(item.id)
    setMessages(ensureChatMessageIds(chatSessions[item.id] ?? []))
    setInputValue("")
    setQuickMenuOpen(false)
    setPendingImages((prev) => {
      prev.forEach((p) => URL.revokeObjectURL(p.previewUrl))
      return []
    })
  }, [chatSessions])

  const deleteHistorySession = React.useCallback(
    (item: HistoryItem) => {
      setHistoryItems((prev) => prev.filter((i) => i.id !== item.id))
      setChatSessions((prev) => {
        const next = { ...prev }
        delete next[item.id]
        return next
      })
      if (selectedChat === item.id) {
        setSelectedChat(null)
        setMessages([])
      }
    },
    [selectedChat]
  )

  return (
    <div 
      className="flex h-screen w-full bg-[#f8f9fb] dark:bg-black"
      style={themeColor ? { "--primary": themeColor } as React.CSSProperties : undefined}
    >
      {/* =============== LEFT SIDEBAR =============== */}
      <aside className="flex h-full w-[260px] shrink-0 flex-col border-r border-border/50 bg-white dark:bg-[#1C1C1E] dark:border-gray-800">
        <div className="border-b border-border/40 px-3 pb-3 pt-3 dark:border-gray-800">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-sm font-semibold text-foreground dark:text-gray-100">历史会话</span>
            <Search className="h-4 w-4 shrink-0 text-muted-foreground/45" aria-hidden />
          </div>
          <div className="relative mb-3">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/40" />
            <input
              type="search"
              value={historySearch}
              onChange={(e) => setHistorySearch(e.target.value)}
              placeholder="搜索会话"
              className="h-8 w-full rounded-lg border border-border/50 bg-muted/40 pl-8 pr-2 text-xs text-foreground outline-none placeholder:text-muted-foreground/65 focus:border-primary/35 focus:ring-1 focus:ring-primary/15 dark:border-gray-700 dark:bg-gray-800/60 dark:text-gray-200"
              aria-label="搜索会话"
            />
          </div>
          <Tooltip delayDuration={400}>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => {
                  setSelectedChat(null)
                  setMessages([])
                  setInputValue("")
                  setQuickMenuOpen(false)
                  setPendingImages((prev) => {
                    prev.forEach((p) => URL.revokeObjectURL(p.previewUrl))
                    return []
                  })
                }}
                className="flex h-10 w-full items-center justify-center rounded-xl border border-primary/30 bg-primary/5 text-primary transition-all duration-200 hover:bg-primary/10 hover:border-primary/50 hover:shadow-sm active:scale-[0.98] dark:border-primary/40 dark:bg-primary/10 dark:hover:bg-primary/20"
                aria-label="新建对话：清空当前输入并开始新会话，左侧仍可查看历史"
              >
                <Plus className="h-5 w-5" strokeWidth={2} aria-hidden />
              </button>
            </TooltipTrigger>
            <TooltipContent
              side="right"
              sideOffset={8}
              className="max-w-[14rem] text-left leading-relaxed"
            >
              清空当前输入与对话区，开始新会话；已生成的会话仍在左侧历史中，可随时点开查看。            </TooltipContent>
          </Tooltip>
        </div>

        <div className="px-3 pb-1 pt-0.5">
          <span className="text-xs font-medium text-muted-foreground">最近</span>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 pb-2 pt-0">
          {filteredHistoryItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-4 py-14 text-center">
              <div
                className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-primary/60 text-white shadow-lg shadow-primary/25 dark:shadow-primary/20"
                aria-hidden
              >
                <AgentIcon className="h-8 w-8" />
              </div>
              <p className="text-sm text-muted-foreground">
                {historyItems.length === 0 ? "暂无数据" : "无匹配会话"}
              </p>
            </div>
          ) : (
            groupedHistorySections.map(([date, items]) => (
            <div key={date} className="mb-3">
              <p className="mb-1.5 px-2 text-[11px] font-medium text-muted-foreground/80 tracking-wide dark:text-gray-500">
                {date}
              </p>
              <ul className="flex flex-col gap-0.5">
                {items.map((item) => (
                  <li key={item.id} className="group/item flex items-center gap-0.5 rounded-xl">
                    <button
                      type="button"
                      onClick={() => openHistorySession(item)}
                      className={cn(
                        "group flex min-w-0 flex-1 items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-[13px] transition-all duration-200",
                        selectedChat === item.id
                          ? "bg-primary/8 font-medium text-foreground dark:bg-gray-800 dark:text-gray-200"
                          : "text-muted-foreground hover:bg-accent/60 hover:text-foreground dark:text-gray-400 dark:hover:bg-gray-800/50 dark:hover:text-gray-200"
                      )}
                    >
                      <MessageSquare
                        className={cn(
                          "h-3.5 w-3.5 shrink-0 transition-colors",
                          selectedChat === item.id
                            ? "text-primary"
                            : "text-muted-foreground/50 group-hover:text-muted-foreground"
                        )}
                      />
                      <span className="min-w-0 flex-1 truncate">{item.title}</span>
                    </button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          className={cn(
                            "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground/60 outline-none transition-colors hover:bg-accent hover:text-muted-foreground focus-visible:ring-2 focus-visible:ring-primary/30 dark:text-gray-500 dark:hover:bg-gray-800 dark:hover:text-gray-300",
                            selectedChat === item.id ? "opacity-100" : "opacity-0 group-hover/item:opacity-100"
                          )}
                          aria-label="会话操作"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <MoreHorizontal className="h-3.5 w-3.5" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44">
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => deleteHistorySession(item)}
                        >
                          删除此会话                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </li>
                ))}
              </ul>
            </div>
          ))
          )}
        </nav>

        {/* Bottom user area */}
        <div className="border-t border-border/40 p-3 dark:border-gray-800">
          <div className="flex items-center gap-3 rounded-xl p-2.5 transition-colors hover:bg-accent/50 cursor-pointer dark:hover:bg-gray-800/50">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
              Yt
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground dark:text-gray-200">各位朋友</p>
              <p className="truncate text-[11px] text-muted-foreground dark:text-gray-400">Pro 会员</p>
            </div>
            <Settings className="h-4 w-4 text-muted-foreground/50 hover:text-muted-foreground transition-colors dark:text-gray-500 dark:hover:text-gray-300" />
          </div>
        </div>
      </aside>

      {/* =============== MAIN + 右侧 AI 面板 =============== */}
      <main className="relative flex min-w-0 flex-1 overflow-hidden">
        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col bg-white dark:bg-[#0a0a0b]">
          <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border/50 px-4 dark:border-gray-800">
            {onBack ? (
              <button
                type="button"
                onClick={onBack}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground dark:hover:bg-gray-800 dark:hover:text-gray-200"
                aria-label="返回"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
            ) : null}
            <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full border border-border/50 bg-muted/60 dark:border-gray-600 dark:bg-gray-800">
              {agentAvatarUrl ? (
                <Image
                  src={agentAvatarUrl}
                  alt=""
                  fill
                  className="object-cover"
                  sizes="36px"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-primary to-primary/70 text-white">
                  <AgentIcon className="h-4 w-4" />
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-[15px] font-semibold leading-tight text-foreground dark:text-gray-100">
                {agentName}
              </h2>
              {agentRole ? (
                <p className="mt-0.5 truncate text-xs font-medium text-primary">{agentRole}</p>
              ) : null}
            </div>
            {allAgents && allAgents.length > 1 && onAgentSwitch ? (
              <Popover open={agentPickerOpen} onOpenChange={setAgentPickerOpen}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-border/60 bg-background px-3 py-1.5 text-sm text-foreground transition-colors hover:bg-accent dark:border-gray-700 dark:bg-gray-900 dark:hover:bg-gray-800"
                    aria-label="切换团队智能体"
                  >
                    <span className="hidden text-xs text-muted-foreground sm:inline">智能体</span>
                    <span className="max-w-28 truncate font-medium">{agentName}</span>
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  </button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-80 p-1">
                  <div className="flex flex-col">
                    {allAgents.map((agent) => (
                      <button
                        key={agent.name}
                        type="button"
                        onClick={() => {
                          onAgentSwitch(agent.name)
                          setAgentPickerOpen(false)
                        }}
                        className={cn(
                          "flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-accent dark:hover:bg-gray-800",
                          agent.name === agentName && "bg-accent",
                        )}
                      >
                        <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full border border-border/60">
                          <Image src={agent.avatar} alt="" fill className="object-cover" sizes="36px" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="truncate font-medium">{agent.name}</span>
                            {agent.name === agentName ? (
                              <Check className="h-4 w-4 shrink-0 text-primary" />
                            ) : null}
                          </div>
                          <p className="truncate text-xs text-muted-foreground">{agent.role}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
            ) : null}
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-60 pt-5">
            {messages.length === 0 ? (
              useTeamLayout ? (
                <div className="mx-auto max-w-2xl pb-6">
                  <div className="rounded-2xl border border-border/60 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800/90">
                    <div className="flex gap-3">
                      <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full border border-border/50 dark:border-gray-600">
                        {agentAvatarUrl ? (
                          <Image
                            src={agentAvatarUrl}
                            alt=""
                            fill
                            className="object-cover"
                            sizes="40px"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-primary to-primary/70 text-white">
                            <AgentIcon className="h-4 w-4" />
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-foreground dark:text-gray-100">{agentName}</p>
                        <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground dark:text-gray-300">
                          {welcomeIntro}
                        </p>
                        <p className="mt-3 text-[11px] leading-snug text-muted-foreground/65 dark:text-gray-500">
                          内容由AI生成，请谨慎使用 {welcomeTimeLabel}
                        </p>
                        <button
                          type="button"
                          className="mt-2 inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground dark:hover:bg-gray-700/80 dark:hover:text-gray-200"
                          onClick={() => {
                            void navigator.clipboard?.writeText(welcomeIntro)
                          }}
                        >
                          <Copy className="h-3.5 w-3.5" aria-hidden />
                          复制
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="mt-6 grid w-full grid-cols-2 gap-2 sm:gap-3">
                    {displayedQuickPrompts.map((prompt, index) => {
                      const PromptIcon = prompt.icon
                      return (
                        <button
                          key={prompt.text}
                          type="button"
                          onClick={() => {
                            setInputValue(prompt.text)
                            inputValueRef.current = prompt.text
                            void handleSendMessage()
                          }}
                          className={cn(
                            "group flex w-full items-center gap-2 rounded-full border border-border/60 bg-white py-2 text-[12px] text-muted-foreground shadow-sm transition-all duration-200 hover:border-primary/40 hover:bg-primary/5 hover:text-foreground dark:bg-gray-800/60 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800",
                            promptSizeClasses[index % promptSizeClasses.length]
                          )}
                        >
                          <PromptIcon className="h-3.5 w-3.5 shrink-0 text-primary/60 group-hover:text-primary" />
                          <span className="min-w-0 truncate">{prompt.text}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              ) : (
                <div className="flex min-h-[50vh] flex-col items-center justify-center pb-8">
                  <div className="mb-5 animate-slide-up">
                    <div className="relative">
                      <div
                        aria-hidden="true"
                        className="absolute inset-0 -m-2 rounded-full bg-primary/15 blur-xl animate-pulse-glow"
                      />
                      <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-primary/60 text-white shadow-lg shadow-primary/25">
                        <AgentIcon className="h-8 w-8" />
                      </div>
                    </div>
                  </div>
                  <h1 className="animate-slide-up delay-100 text-center text-[28px] font-bold leading-tight tracking-tight text-foreground sm:text-[32px] dark:text-white">
                    你好，我是{" "}
                    <span className="bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
                      {agentName}
                    </span>
                  </h1>
                  <p className="mt-3 animate-slide-up delay-200 max-w-lg text-center text-sm leading-relaxed text-muted-foreground dark:text-gray-400">
                    有什么我可以帮你的？选择下方的快捷指令，或直接在输入框中告诉我你的需求                  </p>
                  <div className="mt-8 grid w-full max-w-2xl grid-cols-2 gap-3 animate-slide-up delay-300">
                    {displayedQuickPrompts.map((prompt, index) => {
                      const PromptIcon = prompt.icon
                      return (
                        <button
                          key={prompt.text}
                          type="button"
                          onClick={() => {
                            setInputValue(prompt.text)
                            inputValueRef.current = prompt.text
                            void handleSendMessage()
                          }}
                          className={cn(
                            "group flex w-full items-center gap-2 rounded-full border border-border/60 bg-white py-2.5 text-[13px] text-muted-foreground shadow-sm transition-all duration-200 hover:border-primary/40 hover:bg-primary/5 hover:text-foreground hover:shadow-md active:scale-[0.97] dark:bg-gray-800/50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-gray-100 dark:hover:border-gray-600",
                            promptSizeClasses[index % promptSizeClasses.length]
                          )}
                        >
                          <PromptIcon className="h-3.5 w-3.5 text-primary/60 transition-colors group-hover:text-primary" />
                          {prompt.text}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            ) : (
              <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
                {messages.map((m, i) => (
                  <div
                    key={m.id ?? `${i}-${m.role}`}
                    className={cn(
                      "flex w-full",
                      m.role === "user" ? "justify-end" : "justify-start"
                    )}
                  >
                    <div
                      className={cn(
                        "max-w-[min(100%,520px)] rounded-2xl px-4 py-2.5 text-[13px] leading-relaxed shadow-sm",
                        m.role === "user"
                          ? "bg-primary text-primary-foreground"
                          : "border border-border/60 bg-white text-foreground dark:border-gray-700 dark:bg-gray-800/80 dark:text-gray-100"
                      )}
                    >
                      {m.role === "user" &&
                      m.attachedImagePreviews &&
                      m.attachedImagePreviews.length > 0 ? (
                        <div className="mb-2 flex flex-wrap gap-1.5">
                          {m.attachedImagePreviews.map((src, idx) => (
                            <button
                              key={`${m.id ?? i}-img-${idx}`}
                              type="button"
                              onClick={() => setLightboxSrc(src)}
                              className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg ring-1 ring-white/30 transition-opacity hover:opacity-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
                              aria-label={`查看原图 ${idx + 1}`}
                            >
                              <img src={src} alt="" className="h-full w-full object-cover" />
                            </button>
                          ))}
                        </div>
                      ) : m.role === "user" &&
                        m.attachedImageCount &&
                        !/^(?:已上架|已上传)\s*\d+\s*张图片$/.test(m.content.trim()) ? (
                        <p className="mb-1.5 text-[11px] opacity-90">
                          附图 × {m.attachedImageCount}
                        </p>
                      ) : null}
                      {m.role === "assistant" && isSending && i === messages.length - 1 && !m.content ? (
                        <div className="flex items-center gap-2 text-muted-foreground/70 py-0.5">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          <span className="animate-pulse text-xs">思考中...</span>
                        </div>
                      ) : m.role === "assistant" ? (
                        <div className="text-[13px] leading-relaxed break-words">
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            components={{
                              p: ({ node, ...props }) => <p className="mb-3 last:mb-0" {...props} />,
                              ul: ({ node, ...props }) => <ul className="mb-3 list-disc pl-5" {...props} />,
                              ol: ({ node, ...props }) => <ol className="mb-3 list-decimal pl-5" {...props} />,
                              li: ({ node, ...props }) => <li className="mb-1" {...props} />,
                              strong: ({ node, ...props }) => <strong className="font-bold" {...props} />,
                              a: ({ node, ...props }) => <a className="text-primary underline underline-offset-2" target="_blank" rel="noopener noreferrer" {...props} />,
                              h1: ({ node, ...props }) => <h1 className="mb-3 mt-5 text-lg font-bold" {...props} />,
                              h2: ({ node, ...props }) => <h2 className="mb-3 mt-4 text-base font-bold" {...props} />,
                              h3: ({ node, ...props }) => <h3 className="mb-3 mt-4 text-sm font-bold" {...props} />,
                              code: ({ node, inline, className, children, ...props }: any) => {
                                const match = /language-(\w+)/.exec(className || "");
                                return !inline ? (
                                  <div className="mb-3 overflow-hidden rounded-md bg-zinc-900 border border-zinc-800">
                                    {match && match[1] && <div className="flex h-8 items-center px-4 text-xs font-mono text-zinc-400 bg-zinc-950 border-b border-zinc-800">{match[1]}</div>}
                                    <pre className="overflow-x-auto p-4 text-[13px] text-zinc-50 font-mono">
                                      <code className={className} {...props}>{children}</code>
                                    </pre>
                                  </div>
                                ) : (
                                  <code className="rounded bg-black/5 dark:bg-white/10 px-1 py-0.5 text-[0.9em] text-primary font-mono" {...props}>{children}</code>
                                )
                              }
                            }}
                          >
                            {m.content}
                          </ReactMarkdown>
                        </div>
                      ) : (
                        <p className="whitespace-pre-wrap">{m.content}</p>
                      )}
                    </div>
                  </div>
                ))}
                <div ref={scrollAnchorRef} className="h-px w-full shrink-0" aria-hidden />
              </div>
            )}
          </div>

          {/* ===== Floating input bar（仅中间栏） ===== */}
          <div className="absolute bottom-0 left-0 right-0 px-6 pb-6 pt-8 bg-gradient-to-t from-white via-white/95 to-transparent pointer-events-none dark:from-[#0a0a0b] dark:via-[#0a0a0b]/95">
          <div className="pointer-events-auto mx-auto max-w-3xl">
            <div className="relative rounded-2xl bg-white shadow-md shadow-black/[0.06] ring-1 ring-border/50 transition-shadow duration-200 focus-within:shadow-lg focus-within:shadow-primary/[0.08] focus-within:ring-primary/30 dark:bg-gray-800 dark:ring-gray-700/50">
              {pendingImages.length > 0 ? (
                <div className="flex flex-wrap gap-2 border-b border-border/40 px-5 pt-3 pb-2 dark:border-gray-700/80">
                  {pendingImages.map((p) => (
                    <div
                      key={p.id}
                      className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-muted ring-1 ring-border/50 dark:bg-gray-700"
                    >
                      {/* 本地 blob 预览，不使用 next/image */}
                      <img src={p.previewUrl} alt="" className="h-full w-full object-cover" />
                      <button
                        type="button"
                        className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-background shadow ring-1 ring-border text-muted-foreground hover:text-foreground dark:bg-gray-900"
                        onClick={() => removePendingImage(p.id)}
                        aria-label="移除图片"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
              {/* Textarea */}
              <textarea
                ref={textareaRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onPaste={(e) => {
                  const items = e.clipboardData?.items;
                  if (!items) return;
                  for (let i = 0; i < items.length; i++) {
                    const item = items[i];
                    if (item.type.indexOf('image/') !== -1) {
                      const file = item.getAsFile();
                      if (file) {
                        if (file.size > MAX_IMAGE_FILE_BYTES) {
                          setInputValue((prev) => {
                            const warn = `⚠️ 粘贴的图片超过20MB，已跳过`;
                            return prev.trim() ? `${prev.trim()}\n${warn}` : warn;
                          });
                          continue;
                        }
                        setPendingImages((prev) => {
                          if (prev.length >= MAX_PENDING_IMAGES) return prev;
                          const id = crypto.randomUUID();
                          return [...prev, { id, file, previewUrl: URL.createObjectURL(file) }];
                        });
                      }
                    }
                  }
                }}
                placeholder={inputPlaceholder}
                rows={1}
                className="w-full resize-none bg-transparent px-5 pt-4 pb-14 text-sm leading-relaxed text-foreground outline-none placeholder:text-muted-foreground/60 dark:text-gray-200 dark:placeholder:text-gray-500"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault()
                    void handleSendMessage()
                  }
                }}
              />

              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="sr-only"
                tabIndex={-1}
                aria-hidden
                accept="image/*,.pdf,.doc,.docx,.txt,.md,.xlsx,.pptx"
                onChange={handleFileChange}
              />

              {/* Bottom toolbar inside input */}
              <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between px-3 pb-3">
                {/* Left icons */}
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={handleAttachmentClick}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground/60 transition-colors hover:bg-accent hover:text-muted-foreground dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200"
                    aria-label="上传附件"
                  >
                    <Paperclip className="h-4 w-4" />
                  </button>
                  <Popover open={quickMenuOpen} onOpenChange={setQuickMenuOpen}>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground/60 transition-colors hover:bg-accent hover:text-muted-foreground data-[state=open]:bg-primary/10 data-[state=open]:text-primary dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200 dark:data-[state=open]:bg-primary/20"
                        aria-label="快捷指令"
                        aria-expanded={quickMenuOpen}
                      >
                        <Zap className="h-4 w-4" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent
                      side="top"
                      align="start"
                      sideOffset={8}
                      className="w-[min(100vw-2rem,22rem)] max-h-72 overflow-y-auto p-2 dark:border-gray-700 dark:bg-gray-900"
                    >
                      <p className="px-2 pb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                        快捷指令
                      </p>
                      <ul className="flex flex-col gap-0.5">
                        {resolvedQuickPrompts.map((p) => {
                          const Ic = p.icon
                          return (
                            <li key={p.text}>
                              <button
                                type="button"
                                className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-[13px] text-foreground transition-colors hover:bg-accent dark:hover:bg-gray-800"
                                onClick={() => {
                                  setInputValue(p.text)
                                  setQuickMenuOpen(false)
                                  requestAnimationFrame(() => textareaRef.current?.focus())
                                }}
                              >
                                <Ic className="h-3.5 w-3.5 shrink-0 text-primary" />
                                <span className="min-w-0 flex-1 leading-snug">{p.text}</span>
                              </button>
                            </li>
                          )
                        })}
                      </ul>
                    </PopoverContent>
                  </Popover>
                </div>

                {/* Right send button */}
                <button
                  type="button"
                  disabled={(!inputValue.trim() && pendingImages.length === 0) || isSending}
                  onClick={() => void handleSendMessage()}
                  className={cn(
                    "flex h-9 w-9 items-center justify-center rounded-xl transition-all duration-200",
                    isSending
                      ? "cursor-wait bg-primary text-primary-foreground opacity-90 shadow-sm"
                      : inputValue.trim() || pendingImages.length > 0
                        ? "bg-primary text-primary-foreground shadow-sm shadow-primary/25 hover:bg-primary/90 active:scale-95"
                        : "cursor-not-allowed bg-muted text-muted-foreground/40"
                  )}
                  aria-label="发送"
                >
                  {isSending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            {/* Disclaimer text */}
            <p className="mt-2 text-center text-[11px] text-muted-foreground/55 dark:text-gray-500">
              内容由AI生成，仅供参考，不代表我们的态度及观点            </p>
          </div>
        </div>
        </div>

        {!useTeamLayout ? (
        <aside
          className="hidden min-h-0 w-[min(100%,380px)] shrink-0 flex-col border-l border-border/50 bg-white/95 backdrop-blur-sm dark:border-gray-800 dark:bg-[#141416]/95 md:flex md:min-h-0"
          aria-label="AI 回复预览"
        >
          <div className="shrink-0 border-b border-border/50 px-4 py-3 dark:border-gray-800">
            <h3 className="text-sm font-semibold text-foreground dark:text-gray-100">AI 回复</h3>
            <p className="mt-0.5 text-[11px] text-muted-foreground">最新一轮生成内容</p>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {lastAssistant ? (
              <div className="text-[13px] leading-relaxed text-foreground break-words dark:text-gray-100">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    p: ({ node, ...props }) => <p className="mb-3 last:mb-0" {...props} />,
                    ul: ({ node, ...props }) => <ul className="mb-3 list-disc pl-5" {...props} />,
                    ol: ({ node, ...props }) => <ol className="mb-3 list-decimal pl-5" {...props} />,
                    li: ({ node, ...props }) => <li className="mb-1" {...props} />,
                    strong: ({ node, ...props }) => <strong className="font-bold" {...props} />,
                    a: ({ node, ...props }) => <a className="text-primary underline underline-offset-2" target="_blank" rel="noopener noreferrer" {...props} />,
                    h1: ({ node, ...props }) => <h1 className="mb-3 mt-5 text-lg font-bold" {...props} />,
                    h2: ({ node, ...props }) => <h2 className="mb-3 mt-4 text-base font-bold" {...props} />,
                    h3: ({ node, ...props }) => <h3 className="mb-3 mt-4 text-sm font-bold" {...props} />,
                  }}
                >
                  {lastAssistant}
                </ReactMarkdown>
                {isSending && lastAssistant && (
                  <span className="ml-0.5 inline-block h-3 w-0.5 animate-pulse bg-primary align-middle" aria-hidden />
                )}
              </div>
            ) : isSending ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
                <span>正在生成...</span>
              </div>
            ) : (
              <p className="text-[13px] leading-relaxed text-muted-foreground">
                在左侧输入需求并发送后，本 AI 正文会完整展示在这里，便于阅读与复制。              </p>
            )}
          </div>
        </aside>
        ) : null}
      </main>

      {lightboxSrc ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="图片预览"
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/85 p-4"
          onClick={() => setLightboxSrc(null)}
        >
          <button
            type="button"
            className="absolute right-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-white transition-colors hover:bg-white/25"
            onClick={(e) => {
              e.stopPropagation()
              setLightboxSrc(null)
            }}
            aria-label="关闭预览"
          >
            <X className="h-5 w-5" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element -- data URL 預覽 */}
          <img
            src={lightboxSrc}
            alt=""
            className="max-h-[min(92vh,100%)] max-w-full rounded-lg object-contain shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      ) : null}
    </div>
  )
}

