/**
 * 数字人口播 · 多风格剪辑模板目录
 *
 * 前端选择面板与 `/api/video/edit` 的 `preset` 字段对齐。
 * 后端当前以 `default` 为完整实现；其余风格已登记，便于后续按 id 扩展 ffmpeg 参数。
 */

export type EditingPresetId =
  | "default"
  | "clean"
  | "bold"
  | "minimal"
  | "business"

export type EditingPresetMeta = {
  id: EditingPresetId
  name: string
  description: string
  /** 能力标签，仅展示 */
  features: string[]
  /** false = 面板可见但不可选（即将上线） */
  available: boolean
}

export const DEFAULT_EDITING_PRESET_ID: EditingPresetId = "default"

export const EDITING_PRESETS: EditingPresetMeta[] = [
  {
    id: "default",
    name: "默认剪辑",
    description: "字幕烧录 + BGM 混音 + 名片叠加，适合大多数口播成片",
    features: ["AI 字幕", "BGM", "名片"],
    available: true,
  },
  {
    id: "clean",
    name: "清爽字幕",
    description: "轻量字幕与柔和配乐，画面更干净，适合知识科普",
    features: ["轻字幕", "柔和 BGM"],
    available: true,
  },
  {
    id: "bold",
    name: "爆款字幕",
    description: "加粗描边字幕、节奏感更强，适合带货与热点口播",
    features: ["粗字幕", "强节奏 BGM"],
    available: true,
  },
  {
    id: "minimal",
    name: "极简成片",
    description: "仅保留人声与基础字幕，不叠加名片，适合纯内容输出",
    features: ["基础字幕", "无人名片"],
    available: true,
  },
  {
    id: "business",
    name: "商务名片",
    description: "强化名片信息区，适合顾问、机构与 B 端人设口播",
    features: ["AI 字幕", "BGM", "强化名片"],
    available: true,
  },
]

const PRESET_MAP = new Map(EDITING_PRESETS.map((p) => [p.id, p]))

export function getEditingPreset(id: string): EditingPresetMeta {
  return PRESET_MAP.get(id as EditingPresetId) ?? EDITING_PRESETS[0]
}

/** 未知或未开放的 preset 回退到默认，保证请求始终合法 */
export function resolveEditingPresetId(id: string | undefined | null): EditingPresetId {
  if (!id) return DEFAULT_EDITING_PRESET_ID
  const meta = PRESET_MAP.get(id as EditingPresetId)
  if (!meta || !meta.available) return DEFAULT_EDITING_PRESET_ID
  return meta.id
}
