"use client"

import { useState } from "react"
import { cn } from "@/lib/utils"
import { DashboardSidebar, type MainView } from "@/components/dashboard-sidebar"
import { TopHeader } from "@/components/top-header"
import { DashboardView } from "@/components/dashboard-view"
import { ChatWorkspace } from "@/components/chat-workspace"
import { CopywritingChatWorkspace } from "@/components/copywriting-chat-workspace"
import CopywritingExtractView from "@/components/copywriting-extract-view"
import { VideoWorkspace } from "@/components/video/video-workspace"
import { GeoWorkspace } from "@/components/geo/geo-workspace"
import {
  VIDEO_VIEWS,
  getVideoBreadcrumb,
  isVideoView,
} from "@/lib/video/workspace"
import { getGeoBreadcrumb, isGeoView } from "@/lib/geo/workspace"
import { AgentCenter } from "@/components/agent-center"
import { AccountPositioning } from "@/components/account-positioning"
import { SettingsView } from "@/components/settings-view"
import { HelpCenterView } from "@/components/help-center-view"
import { CreditRechargeView } from "@/components/credit-recharge-view"
import { AdminCreditView } from "@/components/admin-credit-view"
import { BackToTop } from "@/components/back-to-top"
import { TaskRuntimeProvider } from "@/components/task-runtime-provider"
import { LoginRequiredProvider } from "@/components/auth/login-required-provider"
import { TEAM_AGENTS, getTeamAgentByName } from "@/lib/team-agents"
import {
  Store,
  Share2,
  Mic,
  RefreshCw,
  FileText,
} from "lucide-react"
import type { ComponentType } from "react"

/* Map agent names to their icons */
const agentIconMap: Record<string, ComponentType<{ className?: string }>> = {
  "实体店获客脚本创作": Store,
  "私域裂变脚本": Share2,
  "高效口播脚本": Mic,
  "爆款脚本洗稿": RefreshCw,
}

type ActiveAgent = {
  name: string
  icon: ComponentType<{ className?: string }>
  themeColor?: string
  /** 工作台「我的智能体团队」头像，有则对话 UI 与图一一致用真人圆形头像 */
  avatarUrl?: string
  role?: string
}

const agentColorMap: Record<string, string> = {
  "实体店获客脚本创作": "var(--color-rose-500)",
  "私域裂变脚本": "var(--color-violet-500)",
  "高效口播脚本": "var(--color-amber-500)",
  "爆款脚本洗稿": "var(--color-emerald-500)",
}

/** Quick prompts for each copywriting agent (used in agent switcher) */
const agentQuickPromptsMap: Record<string, string[]> = {
  "实体店获客脚本创作": ["我是做餐饮的，帮我写一条引流短视频脚本", "写一条本地生活探店风格的获客脚本", "帮我生成3个不同行业的获客钩子"],
  "私域裂变脚本": ["设计一个社群裂变活动脚本", "帮我写一条朋友圈裂变文案", "生成企微好友邀请话术模板"],
  "高效口播脚本": ["写一段30秒产品口播稿，带开场钩子", "把这段卖点改成交互式口播稿", "给我一版数字人口播用的分段停顿稿"],
  "爆款脚本洗稿": ["把这个热门脚本改写成我的风格", "保留爆款结构，换成餐饮行业的内容", "把这条抖音爆款改成小红书口吻"],
}

/** Build allAgents list for CopywritingChatWorkspace agent switcher */
function buildCopywritingAgentList(): {
  name: string
  icon: React.ComponentType<{ className?: string }>
  color: string
  description: string
  quickPrompts: string[]
}[] {
  return Object.keys(agentIconMap).map((name) => ({
    name,
    icon: agentIconMap[name] || Mic,
    color: agentColorMap[name] || "var(--color-blue-500)",
    description: "",
    quickPrompts: agentQuickPromptsMap[name] || [],
  }))
}

const teamAgentOptions = TEAM_AGENTS.map((agent) => ({
  name: agent.name,
  role: agent.role,
  avatar: agent.avatar,
  themeColor: agent.themeColor,
  quickPrompts: agent.quickPrompts,
}))

/* ------------------------------------------------------------------ */
/*  Breadcrumb logic                                                   */
/* ------------------------------------------------------------------ */

function getBreadcrumb(view: MainView): { parent: string; current: string } {
  if (isVideoView(view)) {
    return getVideoBreadcrumb(view)
  }
  if (isGeoView(view)) {
    return getGeoBreadcrumb(view)
  }
  switch (view) {
    case "文案创作":
      return { parent: "工作台", current: "文案创作" }
    case "身份定位":
      return { parent: "工作台", current: "身份定位" }
    case "自动保存图片":
      return { parent: "更多", current: "自动保存图片" }
    case "帮助中心":
      return { parent: "更多", current: "帮助中心" }
    case "充值兑换":
      return { parent: "积分系统", current: "充值兑换" }
    default:
      return { parent: "工作台", current: "智能体总览" }
  }
}

/* ------------------------------------------------------------------ */
/*  Content Area                                                       */
/* ------------------------------------------------------------------ */

function ContentArea({
  activeView,
  onOpenAgent,
  onNavigate,
  inlineCopywritingAgent,
  setInlineCopywritingAgent,
  initialVideoScript,
  setInitialVideoScript,
  initialExtractedText,
  setInitialExtractedText,
}: {
  activeView: MainView
  onOpenAgent: (name: string, meta?: { avatarUrl?: string; role?: string }) => void
  onNavigate: (view: MainView) => void
  inlineCopywritingAgent: string
  setInlineCopywritingAgent: (name: string) => void
  initialVideoScript: string
  setInitialVideoScript: (script: string) => void
  initialExtractedText: string
  setInitialExtractedText: (text: string) => void
}) {
  // 视频创作工作区（与 GEO 隔离；工作区内切换时保持数字人口播挂载）
  if (isVideoView(activeView)) {
    return (
      <VideoWorkspace
        activeView={activeView}
        initialScript={initialVideoScript}
      />
    )
  }

  // GEO 优化工作区（与视频创作隔离）
  if (isGeoView(activeView)) {
    return <GeoWorkspace activeView={activeView} />
  }

  // 文案提取 — extract copy from video URL
  if (activeView === "文案提取") {
    return (
      <CopywritingExtractView
        onJumpToVideo={(script) => {
          setInitialVideoScript(script)
          onNavigate(VIDEO_VIEWS.DIGITAL_HUMAN)
        }}
        onAiRewrite={(text) => {
          setInlineCopywritingAgent("高效口播脚本")
          setInitialExtractedText(text)
          onNavigate("文案创作")
        }}
      />
    )
  }

  // Copywriting view
  // 文案创作 — directly opens chat with default agent
  if (activeView === "文案创作") {
    return (
      <CopywritingChatWorkspace
        agentName={inlineCopywritingAgent}
        agentIcon={agentIconMap[inlineCopywritingAgent] || Mic}
        themeColor={agentColorMap[inlineCopywritingAgent] || "var(--color-amber-500)"}
        allAgents={buildCopywritingAgentList()}
        onAgentSwitch={(name) => setInlineCopywritingAgent(name)}
        onJumpToVideo={(script) => {
          setInitialVideoScript(script)
          onNavigate(VIDEO_VIEWS.DIGITAL_HUMAN)
        }}
        initialUserMessage={initialExtractedText}
        welcomePrompts={[
          "我是做装修的，帮我生成10个抖音爆款选题",
          "帮我梳理个人IP定位，我擅长互联网运营",
          "写一条高转化的朋友圈营销文案",
          "帮我写一段40秒的口播脚本，卖护肤品",
          "给我的品牌生成5句slogan和传播主题",
          "分析我的行业适合做哪种类型的短视频",
        ]}
      />
    )
  }

  // 智能体中心 — agent center
  if (activeView === "智能体中心") {
    return <AgentCenter onOpenAgent={onOpenAgent} onNavigate={onNavigate} />
  }

  // 身份定位 — account positioning
  if (activeView === "身份定位") {
    return <AccountPositioning />
  }

  if (activeView === "自动保存图片") {
    return <SettingsView />
  }

  if (activeView === "帮助中心") {
    return <HelpCenterView />
  }

  if (activeView === "充值兑换") {
    return <CreditRechargeView />
  }

  if (activeView === "管理员后台") {
    return <AdminCreditView />
  }

  // Default: dashboard
  return (
    <DashboardView onOpenAgent={onOpenAgent} onNavigate={onNavigate} />
  )
}

/* ------------------------------------------------------------------ */
/*  Root Page                                                          */
/* ------------------------------------------------------------------ */

export default function Page() {
  const [activeView, setActiveView] = useState<MainView>("工作台")

  const [activeAgent, setActiveAgent] = useState<ActiveAgent | null>(null)
  /** Distinguish: copywriting agents (no avatar) vs team agents (with avatar) */
  const [isCopywritingMode, setIsCopywritingMode] = useState(false)
  /** Track the active copywriting agent when in inline mode */
  const [inlineCopywritingAgent, setInlineCopywritingAgent] = useState("高效口播脚本")
  /** Cross-navigate: script passed from copywriting → video creation */
  const [initialVideoScript, setInitialVideoScript] = useState("")
  /** Cross-navigate: extracted text passed from 文案提取 → AI 改写 */
  const [initialExtractedText, setInitialExtractedText] = useState("")
  /**
   * 返回上一頁時只關閉全屏層；每次從工作台卡片再進入時遞增，讓 ChatWorkspace 中欄固定為新對話歡迎態。
   */
  const [agentChatOpen, setAgentChatOpen] = useState(false)
  const [agentChatEntryNonce, setAgentChatEntryNonce] = useState(0)

  const breadcrumb = getBreadcrumb(activeView)

  const handleOpenAgent = (
    agentName: string,
    meta?: { avatarUrl?: string; role?: string },
  ) => {
    const teamAgent = meta?.avatarUrl ? getTeamAgentByName(agentName) : undefined
    setAgentChatEntryNonce((n) => n + 1)
    setActiveAgent({
      name: agentName,
      icon: agentIconMap[agentName] || Mic,
      themeColor: teamAgent?.themeColor ?? agentColorMap[agentName] ?? "var(--color-blue-500)",
      avatarUrl: meta?.avatarUrl ?? teamAgent?.avatar,
      role: meta?.role ?? teamAgent?.role,
    })
    // Copywriting mode: no avatarUrl (from copywriting card grid)
    setIsCopywritingMode(!meta?.avatarUrl)
    setAgentChatOpen(true)
  }

  const handleBackFromChat = () => {
    setAgentChatOpen(false)
  }

  return (
    <LoginRequiredProvider>
    <div className="relative flex min-h-screen bg-background">
      {activeAgent != null ? (
        <div
          className={
            agentChatOpen
              ? "fixed inset-0 z-50 flex min-h-screen flex-col bg-background"
              : "hidden"
          }
          aria-hidden={!agentChatOpen}
        >
          {isCopywritingMode ? (
            <CopywritingChatWorkspace
              key={activeAgent.name}
              agentName={activeAgent.name}
              agentIcon={activeAgent.icon}
              themeColor={activeAgent.themeColor}
              onBack={handleBackFromChat}
              allAgents={buildCopywritingAgentList()}
              onAgentSwitch={(name) => {
                setActiveAgent({
                  name,
                  icon: agentIconMap[name] || Mic,
                  themeColor: agentColorMap[name] || "var(--color-blue-500)",
                })
                setIsCopywritingMode(true)
              }}
              onJumpToVideo={(script) => {
                setInitialVideoScript(script)
                setAgentChatOpen(false)
                setActiveView(VIDEO_VIEWS.DIGITAL_HUMAN)
              }}
            />
          ) : (
            <ChatWorkspace
              key={activeAgent.name}
              agentName={activeAgent.name}
              agentIcon={activeAgent.icon}
              themeColor={activeAgent.themeColor}
              agentAvatarUrl={activeAgent.avatarUrl}
              agentRole={activeAgent.role}
              allAgents={teamAgentOptions}
              onAgentSwitch={(name) => {
                const target = getTeamAgentByName(name)
                if (!target) return
                setActiveAgent({
                  name: target.name,
                  icon: agentIconMap[target.name] || Mic,
                  themeColor: target.themeColor,
                  avatarUrl: target.avatar,
                  role: target.role,
                })
                setIsCopywritingMode(false)
              }}
              entryNonce={agentChatEntryNonce}
              onBack={handleBackFromChat}
            />
          )}
        </div>
      ) : null}

      <TaskRuntimeProvider activeView={activeView} onNavigate={setActiveView}>
        <div
          className={cn(
            "flex min-h-screen w-full min-w-0 flex-1 bg-background",
            agentChatOpen && "hidden",
          )}
        >
          <DashboardSidebar active={activeView} onSelect={setActiveView} />

          <div className="flex min-w-0 flex-1 flex-col">
            <TopHeader
              currentPage={`${breadcrumb.parent} / ${breadcrumb.current}`}
              onNavigate={setActiveView}
              onOpenAgent={handleOpenAgent}
            />

            <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden animate-in fade-in duration-200">
              <ContentArea
                activeView={activeView}
                onOpenAgent={handleOpenAgent}
                onNavigate={setActiveView}
                inlineCopywritingAgent={inlineCopywritingAgent}
                setInlineCopywritingAgent={setInlineCopywritingAgent}
                initialVideoScript={initialVideoScript}
                setInitialVideoScript={setInitialVideoScript}
                initialExtractedText={initialExtractedText}
                setInitialExtractedText={setInitialExtractedText}
              />
            </div>
          </div>

          <BackToTop />
        </div>
      </TaskRuntimeProvider>
    </div>
    </LoginRequiredProvider>
  )
}
