# -*- coding: utf-8 -*-
"""数字人视频创作（新）— AI 分镜脚本生成"""

from __future__ import annotations

import json
import re

from lib.promo_video_service import call_deepseek

DH_V2_SCRIPT_PLAN_SYSTEM = """你是一位精通 Seedance 2.0 的数字人视频导演。

用户会提供完整口播文案、视频创作想法，以及已按时间切好的各段台词（顺序不可更改）。
请为每一段生成：
1. shot_details：本分镜画面细节（场景、人物状态、光线、构图，中文 40-80 字）
2. video_prompt：Seedance 2.0 视频生成提示词（六步公式：主体、动作、环境、镜头、风格、约束）

规则：
- 每段固定 15 秒，提示词内用【时间轴】0-15s 描述段内节奏
- 参考图用 @图1、@图2 或 Image1（全片共用同一套参考图）
- 有音频参考时注明 @音频1 驱动口型
- 多段时第 2 段起注明「承接前段叙事」
- 不要改写或重排 dialogue，dialogue 由系统注入

只输出 JSON，无 markdown：
{
  "segments": [
    {"index": 0, "shot_details": "...", "video_prompt": "..."},
    ...
  ]
}"""


def _extract_json_block(text: str) -> dict:
    raw = (text or "").strip()
    if raw.startswith("```"):
        raw = re.sub(r"^```(?:json)?\s*", "", raw)
        raw = re.sub(r"\s*```$", "", raw)
    start = raw.find("{")
    end = raw.rfind("}")
    if start < 0 or end <= start:
        raise ValueError("AI 未返回有效 JSON")
    return json.loads(raw[start : end + 1])


async def generate_dh_v2_script_plan_segments(
    deepseek_api_key: str,
    *,
    script: str,
    creative_idea: str,
    dialogue_slices: list[str],
    image_count: int = 1,
    has_audio_ref: bool = False,
    plan_duration: int = 15,
) -> list[dict]:
    lines = [
        f"完整口播文案：{script.strip()}",
        f"视频创作想法：{(creative_idea or '').strip() or '电影感数字人口播'}",
        f"计划总时长：{plan_duration} 秒，共 {len(dialogue_slices)} 段，每段 15 秒",
        f"参考图数量：{image_count} 张",
    ]
    if has_audio_ref:
        lines.append("已上传参考音频：是")
    lines.append("\n各段台词（顺序固定，请勿修改）：")
    for i, dlg in enumerate(dialogue_slices):
        lines.append(f"--- 段 {i + 1} ({i * 15}-{(i + 1) * 15}s) ---\n{dlg.strip()}")
    lines.append("\n请输出 JSON segments 数组。")

    content = await call_deepseek(
        deepseek_api_key,
        DH_V2_SCRIPT_PLAN_SYSTEM,
        "\n".join(lines),
        temperature=0.65,
        max_tokens=4096,
    )
    data = _extract_json_block(content)
    segs = data.get("segments")
    if not isinstance(segs, list):
        raise ValueError("AI JSON 缺少 segments 数组")

    out: list[dict] = []
    for i, dlg in enumerate(dialogue_slices):
        item = segs[i] if i < len(segs) and isinstance(segs[i], dict) else {}
        out.append(
            {
                "index": i,
                "dialogue": dlg.strip(),
                "shot_details": str(item.get("shot_details") or "").strip(),
                "video_prompt": str(item.get("video_prompt") or "").strip(),
            }
        )
    return out
