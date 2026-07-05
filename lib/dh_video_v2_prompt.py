# -*- coding: utf-8 -*-
"""数字人视频创作（新）— Seedance 提示词生成"""

from lib.promo_video_service import call_deepseek

DH_V2_SEEDANCE_PROMPT_SYSTEM = """你是一位精通 Seedance 2.0 的 AI 视频导演与提示词工程师。

请根据用户口播文案、时长与参考图数量，生成可直接用于 Seedance 2.0 的视频生成提示词。

写作规范（六步公式）：
1. 主体：具体人物外观与状态（若有多张参考图，用 Image1、Image2… 或 @图1、@图2 引用）
2. 动作：具体动词，量化强度，口播/表情/手势与文案节奏一致
3. 环境：场景、光线、氛围
4. 镜头：仅写一个主运镜（如 slow push-in、orbit、tracking shot），与主体动作分开描述
5. 风格：电影感、纪录片、商业广告等具体影像风格
6. 约束：用正向表述（stable composition, sharp focus），避免负面提示词

多模态引用：
- 参考图用 Image1~ImageN 或 @图N
- 有音频参考时注明 @音频1 驱动口型节奏

时长规则：
- 15 秒：核心描述 60~100 字，一条连贯镜头叙事
- 30/45 秒：必须输出【时间轴】分段

直接输出提示词正文，不要解释、不要 markdown 代码块。"""


async def generate_dh_v2_video_prompt(
    deepseek_api_key: str,
    *,
    script: str,
    duration: int,
    image_count: int,
    mode: str = "direct",
    visual_style: str = "",
    has_audio_ref: bool = False,
) -> str:
    refs = ", ".join(f"Image{i + 1}" for i in range(max(1, image_count)))
    lines = [
        f"口播文案：{script.strip()}",
        f"目标时长：{duration} 秒",
        f"参考图数量：{image_count} 张（{refs}）",
        f"创作路径：{'分镜选帧后成片' if mode == 'storyboard' else '参考图直出'}",
    ]
    if visual_style.strip():
        lines.append(f"画面风格：{visual_style.strip()}")
    if has_audio_ref:
        lines.append("已上传参考音频：是，请在提示词中注明 @音频1 与口型节奏")
    if duration > 15:
        lines.append(f"请按 {duration} 秒输出【时间轴】分段提示词。")
    lines.append("请生成 Seedance 2.0 视频提示词。")
    user_prompt = "\n".join(lines)
    return await call_deepseek(deepseek_api_key, DH_V2_SEEDANCE_PROMPT_SYSTEM, user_prompt)
