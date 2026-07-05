import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  IP_POSITIONING_SYSTEM,
  buildPositioningUserMessage,
} from "@/lib/prompts/ip-positioning-prompts"
import { EMPTY_INTAKE } from "@/lib/ip-positioning-schema"

describe("ip-positioning prompts", () => {
  it("system prompt includes skill framework keywords", () => {
    assert.match(IP_POSITIONING_SYSTEM, /定位公式/)
    assert.match(IP_POSITIONING_SYSTEM, /反共识/)
    assert.match(IP_POSITIONING_SYSTEM, /uniqueMechanism|专属方法论/)
    assert.match(IP_POSITIONING_SYSTEM, /thirtyDayPlan/)
    assert.match(IP_POSITIONING_SYSTEM, /confidenceScore/)
  })

  it("buildPositioningUserMessage includes intake sections and documents", () => {
    const message = buildPositioningUserMessage({
      intake: {
        ...EMPTY_INTAKE,
        industry: "教育培训",
        keyExperiences: "10年教培创业",
        resources: "3000学员",
        contrarianTrigger: "反对刷题",
        frequentQuestions: "如何选校",
        uniqueExperience: "从一线老师到机构创始人",
        targetAudience: "焦虑家长",
        shortTermMonetization: "咨询",
        longTermVision: "行业 IP",
        contentFormats: "口播",
        outputFrequency: "每周3条",
        rememberedVibe: "犀利",
      },
      documents: [
        {
          name: "resume.txt",
          type: "text/plain",
          size: 100,
          text: "曾任某机构教学总监",
          truncated: false,
        },
      ],
    })

    assert.match(message, /教育培训/)
    assert.match(message, /反对刷题/)
    assert.match(message, /resume\.txt/)
    assert.match(message, /教学总监/)
    assert.match(message, /严格返回 JSON/)
  })
})
