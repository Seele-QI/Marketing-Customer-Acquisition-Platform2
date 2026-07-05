"""本地分镜脚本模板（DeepSeek 不可用时的兜底）"""

from __future__ import annotations


def build_local_segment_prompt(
    *,
    dialogue: str,
    creative_idea: str,
    seg_index: int,
    total_segs: int,
    has_audio_ref: bool,
) -> tuple[str, str]:
    idea = (creative_idea or "电影感数字人口播").strip()
    dlg = (dialogue or "").strip().replace("\n", " ")
    shot = (
        f"{idea}，竖屏 9:16，人物半身出镜，柔和面光，背景简洁专业。"
        f"本段口播情绪自然，眼神看镜头，轻微手势配合语气。"
    )
    if total_segs > 1 and seg_index > 0:
        shot += " 画面承接上一段叙事，保持服装与场景一致。"

    audio_hint = " @音频1 驱动口型节奏，" if has_audio_ref else ""
    prompt = (
        f"【风格】{idea}\n"
        f"【时间轴】0-15s：@图1 当前图片为视频固定首帧，正面口播，表情自然，{dlg[:60]}{audio_hint}"
        f"镜头 slow push-in，stable composition, sharp focus"
    )
    if total_segs > 1:
        prompt += f"（第 {seg_index + 1}/{total_segs} 段，15 秒）"
    return shot, prompt
