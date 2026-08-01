import { GEO_VIEWS } from "@/lib/geo/workspace"
import { VIDEO_VIEWS } from "@/lib/video/workspace"

import type {
  BusinessAssistantDefinition,
  BusinessAssistantId,
} from "@/lib/business-assistant/types"

const VIDEO_SUPPORTED_VIEWS = Object.freeze(Object.values(VIDEO_VIEWS))
const GEO_SUPPORTED_VIEWS = Object.freeze(Object.values(GEO_VIEWS))

const BUSINESS_ASSISTANTS: readonly BusinessAssistantDefinition[] =
  Object.freeze([
    {
      id: "video-creation",
      agentId: "video-production",
      name: "视频创作助理",
      shortName: "视频助理",
      description: "围绕选题、脚本、素材、生成、质检和分发准备推进视频项目。",
      projectKind: "video",
      availability: "enabled",
      supportedViews: VIDEO_SUPPORTED_VIEWS,
      workflowStages: [
        "目标与受众",
        "选题与脚本",
        "形象与素材",
        "视频生成",
        "成片质检",
        "分发准备",
      ],
    },
    {
      id: "geo-growth",
      agentId: "geo-growth",
      name: "GEO 创作助理",
      shortName: "GEO 助理",
      description: "围绕企业知识、内容矩阵、文章生成、评分和优化推进 GEO 项目。",
      projectKind: "geo",
      availability: "enabled",
      supportedViews: GEO_SUPPORTED_VIEWS,
      workflowStages: [
        "企业实体",
        "知识库",
        "内容矩阵",
        "文章生成",
        "质量评分",
        "优化与导出",
      ],
    },
    {
      id: "douyin-interception",
      agentId: "channel-distribution",
      name: "抖音截流助理",
      shortName: "截流助理",
      description: "抖音线索发现、复核、触达与跟进能力预留。",
      availability: "reserved",
      supportedViews: [],
      workflowStages: [],
    },
  ] satisfies readonly BusinessAssistantDefinition[])

const ASSISTANT_BY_ID = new Map(
  BUSINESS_ASSISTANTS.map((assistant) => [assistant.id, assistant]),
)

export function getBusinessAssistant(
  id: string,
): BusinessAssistantDefinition | undefined {
  return ASSISTANT_BY_ID.get(id as BusinessAssistantId)
}

export function listEnabledBusinessAssistants(): BusinessAssistantDefinition[] {
  return BUSINESS_ASSISTANTS.filter(
    (assistant) => assistant.availability === "enabled",
  )
}

export function resolveAssistantForView(
  view: string,
): BusinessAssistantDefinition | undefined {
  return listEnabledBusinessAssistants().find((assistant) =>
    assistant.supportedViews.includes(view),
  )
}
