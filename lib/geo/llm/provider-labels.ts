import type { LlmProviderId } from "@/lib/geo/llm/router"

export const LLM_PROVIDER_LABELS: Record<LlmProviderId, string> = {
  deepseek: "DeepSeek",
  doubao: "豆包 Seed 2.1 Pro",
  kimi: "Kimi",
  gpt: "GPT-5.5",
  claude: "Claude Opus",
  gemini: "Gemini",
}

export function getLlmProviderLabel(id: LlmProviderId): string {
  return LLM_PROVIDER_LABELS[id] ?? id
}
