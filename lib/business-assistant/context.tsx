"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"

import { createBusinessAssistantClient } from "@/lib/business-assistant/client"
import {
  getGuideCompleted,
  getGuideCursor,
  loadGuideProgress,
  saveGuideProgress,
  setGuideCompleted,
  setGuideCursor,
  type GuideProgressState,
} from "@/lib/business-assistant/guide-progress"
import { resolveOperationGuide } from "@/lib/business-assistant/operation-guides"
import { useRuntimeTasks, VIEW_TO_TASK_KIND } from "@/lib/task-runtime"
import type {
  AssistantPageContext,
  BusinessProject,
  BusinessProjectDetail,
  BusinessProjectKind,
  EnabledBusinessAssistantId,
  OperationGuide,
  OperationGuideStep,
} from "@/lib/business-assistant/types"

type BusinessAssistantContextValue = {
  activeView: string
  activeGuide?: OperationGuide
  currentGuideStep?: OperationGuideStep
  guideStepIndex: number
  guideCompleted: boolean
  projects: BusinessProject[]
  activeProject: BusinessProjectDetail | null
  isOpen: boolean
  pageContext: AssistantPageContext
  loading: boolean
  projectsLoaded: boolean
  projectError: string
  highlightTarget: string | null
  targetMissing: boolean
  setOpen: (open: boolean) => void
  setPageContext: (context: AssistantPageContext) => void
  setGuideStepIndex: (index: number) => void
  nextGuideStep: () => void
  previousGuideStep: () => void
  completeGuide: () => void
  requestHighlight: () => void
  clearHighlight: () => void
  reportTargetMissing: (missing: boolean) => void
  clearProjectError: () => void
  refreshProjects: () => Promise<void>
  openProject: (projectId: string) => Promise<BusinessProjectDetail | null>
  createProject: (kind: BusinessProjectKind) => Promise<BusinessProject | null>
  updateActiveProject: (detail: BusinessProjectDetail) => void
  navigate: (view: string) => void
}

const BusinessAssistantContext =
  createContext<BusinessAssistantContextValue | null>(null)

function friendlyProjectError(caught: unknown): string {
  if (caught instanceof Error && caught.message.trim()) {
    if (/not found/i.test(caught.message)) {
      return "项目服务暂时未连接，操作指南仍可正常使用。"
    }
    return caught.message
  }
  return "项目服务暂时不可用，操作指南仍可正常使用。"
}

export function BusinessAssistantProvider({
  activeView,
  onNavigate,
  children,
}: {
  activeView: string
  onNavigate: (view: string) => void
  children: ReactNode
}) {
  const client = useMemo(() => createBusinessAssistantClient(), [])
  const runtimeTasks = useRuntimeTasks()
  const activeGuide = useMemo(
    () => resolveOperationGuide(activeView),
    [activeView],
  )
  const [projects, setProjects] = useState<BusinessProject[]>([])
  const [activeProject, setActiveProject] =
    useState<BusinessProjectDetail | null>(null)
  const [isOpen, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [projectsLoaded, setProjectsLoaded] = useState(false)
  const [projectError, setProjectError] = useState("")
  const [guideProgress, setGuideProgress] = useState<GuideProgressState>({
    version: 1,
    cursors: {},
    completed: {},
  })
  const [highlightTarget, setHighlightTarget] = useState<string | null>(null)
  const [targetMissing, setTargetMissing] = useState(false)
  const [pageContext, setPageContext] = useState<AssistantPageContext>({
    activeView,
  })

  useEffect(() => {
    setGuideProgress(loadGuideProgress())
  }, [])

  useEffect(() => {
    const kind = VIEW_TO_TASK_KIND[activeView]
    const task = kind ? runtimeTasks[kind] : undefined
    setPageContext((current) => ({
      ...current,
      activeView,
      ...(task
        ? {
            runtimeTaskId: task.taskId,
            runtimeStatus: task.status,
            summary: `${task.stageLabel}（${task.progress}%）`,
          }
        : {
            runtimeTaskId: undefined,
            runtimeStatus: undefined,
            summary: undefined,
          }),
    }))
    setHighlightTarget(null)
    setTargetMissing(false)
  }, [activeView, runtimeTasks])

  const guideStepIndex = activeGuide
    ? getGuideCursor(guideProgress, activeView, activeGuide.steps.length)
    : 0
  const currentGuideStep = activeGuide?.steps[guideStepIndex]
  const guideCompleted = getGuideCompleted(guideProgress, activeView)

  const setGuideStepIndex = useCallback(
    (index: number) => {
      if (!activeGuide) return
      setGuideProgress((current) => {
        const next = setGuideCursor(
          current,
          activeView,
          index,
          activeGuide.steps.length,
        )
        saveGuideProgress(next)
        return next
      })
      setHighlightTarget(null)
      setTargetMissing(false)
    },
    [activeGuide, activeView],
  )

  const refreshProjects = useCallback(async () => {
    setLoading(true)
    setProjectError("")
    try {
      const rows = await client.listProjects()
      setProjects(rows)
    } catch (caught) {
      setProjects([])
      setProjectError(friendlyProjectError(caught))
    } finally {
      setProjectsLoaded(true)
      setLoading(false)
    }
  }, [client])

  const openProject = useCallback(
    async (projectId: string) => {
      setLoading(true)
      setProjectError("")
      try {
        const detail = await client.getProject(projectId)
        setActiveProject(detail)
        setOpen(true)
        return detail
      } catch (caught) {
        setProjectError(friendlyProjectError(caught))
        return null
      } finally {
        setLoading(false)
      }
    },
    [client],
  )

  const createProject = useCallback(
    async (kind: BusinessProjectKind) => {
      setLoading(true)
      setProjectError("")
      try {
        const assistantId: EnabledBusinessAssistantId =
          kind === "video" ? "video-creation" : "geo-growth"
        const project = await client.createProject({
          kind,
          assistantId,
          title: kind === "video" ? "新视频创作项目" : "新 GEO 创作项目",
          goal:
            kind === "video"
              ? "完成一条可发布的短视频"
              : "建立企业知识并完成首篇 GEO 优化内容",
        })
        const detail = await client.getProject(project.id)
        setActiveProject(detail)
        setProjects((current) => [
          project,
          ...current.filter((item) => item.id !== project.id),
        ])
        setProjectsLoaded(true)
        return project
      } catch (caught) {
        setProjectError(friendlyProjectError(caught))
        return null
      } finally {
        setLoading(false)
      }
    },
    [client],
  )

  const requestHighlight = useCallback(() => {
    const target = currentGuideStep?.highlightTarget
    if (!target) {
      setTargetMissing(true)
      return
    }
    setTargetMissing(false)
    setHighlightTarget(target)
  }, [currentGuideStep?.highlightTarget])
  const clearHighlight = useCallback(() => setHighlightTarget(null), [])
  const reportTargetMissing = useCallback(
    (missing: boolean) => setTargetMissing(missing),
    [],
  )
  const clearProjectError = useCallback(() => setProjectError(""), [])
  const nextGuideStep = useCallback(
    () => setGuideStepIndex(guideStepIndex + 1),
    [guideStepIndex, setGuideStepIndex],
  )
  const previousGuideStep = useCallback(
    () => setGuideStepIndex(guideStepIndex - 1),
    [guideStepIndex, setGuideStepIndex],
  )
  const completeGuide = useCallback(() => {
    if (!activeGuide) return
    setGuideProgress((current) => {
      const next = setGuideCompleted(current, activeView, true)
      saveGuideProgress(next)
      return next
    })
  }, [activeGuide, activeView])

  const value = useMemo<BusinessAssistantContextValue>(
    () => ({
      activeView,
      activeGuide,
      currentGuideStep,
      guideStepIndex,
      guideCompleted,
      projects,
      activeProject,
      isOpen,
      pageContext,
      loading,
      projectsLoaded,
      projectError,
      highlightTarget,
      targetMissing,
      setOpen,
      setPageContext,
      setGuideStepIndex,
      nextGuideStep,
      previousGuideStep,
      completeGuide,
      requestHighlight,
      clearHighlight,
      reportTargetMissing,
      clearProjectError,
      refreshProjects,
      openProject,
      createProject,
      updateActiveProject: setActiveProject,
      navigate: onNavigate,
    }),
    [
      activeGuide,
      activeProject,
      activeView,
      clearHighlight,
      clearProjectError,
      completeGuide,
      createProject,
      currentGuideStep,
      guideStepIndex,
      guideCompleted,
      highlightTarget,
      isOpen,
      loading,
      nextGuideStep,
      onNavigate,
      openProject,
      pageContext,
      projectError,
      projects,
      projectsLoaded,
      previousGuideStep,
      refreshProjects,
      reportTargetMissing,
      requestHighlight,
      setGuideStepIndex,
      targetMissing,
    ],
  )

  return (
    <BusinessAssistantContext.Provider value={value}>
      {children}
    </BusinessAssistantContext.Provider>
  )
}

export function useBusinessAssistant(): BusinessAssistantContextValue {
  const value = useContext(BusinessAssistantContext)
  if (!value) {
    throw new Error(
      "useBusinessAssistant must be used inside BusinessAssistantProvider",
    )
  }
  return value
}
