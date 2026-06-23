"""
视频混剪 ffmpeg 合成模块。

功能：多段视频素材 + 配音音频 + 字幕 + BGM → 带转场效果的竖屏混剪视频。

核心规则：
- 每个视频片段最多播放 5 秒
- 长视频（>5s）自动虚拟切分为多个 ≤5s 片段
- 每句文案对应 1+ 个视频片段（超 5 秒自动续接下一片段）
- 片段不够时循环复用
- 原视频音轨全部静音，最终音频 = AI配音 + BGM

复用 video_postprocess / image_video_postprocess 的：
- 字幕时间轴（split_script_segments / create_timeline_by_chars / build_ass_subtitles）
- BGM 选取（_pick_bgm）
- xfade 转场构建逻辑
"""

from __future__ import annotations

import os
import random
import subprocess
from pathlib import Path
from typing import Optional

from lib.video_postprocess import (
    PostProcessResult,
    split_script_segments,
    create_timeline_by_chars,
    build_ass_subtitles,
    _pick_bgm,
    _escape_filter_path,
    probe_audio_duration,
    probe_duration,
)

# ── ffmpeg / ffprobe 路径 ──────────────────────────────────────────────────
_PROJECT_ROOT = Path(__file__).resolve().parent.parent
_LOCAL_FFMPEG_BIN = _PROJECT_ROOT / "tools" / "ffmpeg" / "bin"
_FFMPEG_EXE = str(_LOCAL_FFMPEG_BIN / "ffmpeg.exe") if (_LOCAL_FFMPEG_BIN / "ffmpeg.exe").exists() else "ffmpeg"
_FFPROBE_EXE = str(_LOCAL_FFMPEG_BIN / "ffprobe.exe") if (_LOCAL_FFMPEG_BIN / "ffprobe.exe").exists() else "ffprobe"

# ── 常量 ──────────────────────────────────────────────────────────────────
_XFADE_TRANSITIONS = ["slideleft", "slideright", "fade"]
MAX_SEGMENT_DUR = 5.0        # 每个片段最多播放 5 秒
MIN_VIDEO_DUR = 2.0          # 原始视频最短 2 秒
MAX_VIDEO_DUR = 30.0         # 原始视频最长 30 秒
TRANSITION_DUR = 0.3         # 转场时长
DEFAULT_WIDTH = 1080          # 3:4 竖屏
DEFAULT_HEIGHT = 1440
DEFAULT_FPS = 25
DEFAULT_BGM_VOLUME = 0.32
VOICE_VOLUME = 1.0


def _run_ffmpeg(args: list[str], timeout: int = 900) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        args, capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=timeout,
    )


def _build_segment_plan(
    video_paths: list[str],
    timeline: list[dict],
) -> list[dict]:
    """
    构建视频片段播放计划。

    1. 探测所有视频时长
    2. 将 >5s 的视频虚拟切分为多个 ≤5s 片段
    3. 随机打乱所有片段
    4. 按 timeline 逐句分配片段（每句可能拆分到多个片段）

    Returns:
        [{video_path, trim_start, play_duration}, ...]
        所有片段的 play_duration 之和 = 总配音时长 + (片段数-1)*0.3
    """
    # ── 1. 探测视频时长 → 构建虚拟片段池 ──
    pool: list[dict] = []  # [{video_path, trim_start, video_dur}]
    for vpath in video_paths:
        dur = probe_duration(vpath)
        if dur < MIN_VIDEO_DUR or dur > MAX_VIDEO_DUR:
            continue  # 跳过不符合时长要求的视频
        if dur <= MAX_SEGMENT_DUR:
            pool.append({"video_path": vpath, "trim_start": 0.0, "video_dur": dur})
        else:
            pos = 0.0
            while pos < dur:
                chunk = min(MAX_SEGMENT_DUR, dur - pos)
                if chunk >= 0.5:  # 过滤过短尾块
                    pool.append({"video_path": vpath, "trim_start": pos, "video_dur": chunk})
                pos += chunk

    if len(pool) < 2:
        raise ValueError(f"可用视频片段不足（至少需要 2 个），当前: {len(pool)}")

    # ── 2. 随机打乱 ──
    random.shuffle(pool)

    # ── 3. 计算需要的总播放时长 ──
    # 配音时长（所有句子时长之和）
    voice_duration = sum(float(row["duration"]) for row in timeline)

    # ── 4. 按 timeline 分配片段 ──
    plan: list[dict] = []
    pool_idx = 0

    for entry in timeline:
        remaining = float(entry["duration"])
        while remaining > 0.001:
            seg = pool[pool_idx % len(pool)]
            play_time = round(min(seg["video_dur"], remaining, MAX_SEGMENT_DUR), 3)
            if play_time < 0.1:
                play_time = remaining  # 兜底：剩余时间过短直接吃掉
            plan.append({
                "video_path": seg["video_path"],
                "trim_start": seg["trim_start"],
                "play_duration": play_time,
            })
            remaining = round(remaining - play_time, 3)
            pool_idx += 1

    # ── 5. 调整总时长以匹配配音 ──
    # xfade 级联公式：总输出 = sum(play) - (N-1)*transition
    n = len(plan)
    total_video = round(sum(p["play_duration"] for p in plan) - (n - 1) * TRANSITION_DUR, 3)
    gap = round(voice_duration - total_video, 3)

    if gap != 0 and plan:
        # 按比例分配到所有片段，避免末片段异常长/短
        total_play = sum(p["play_duration"] for p in plan)
        if total_play > 0:
            for p in plan:
                p["play_duration"] = round(p["play_duration"] + gap * p["play_duration"] / total_play, 3)
            # 消除浮点累积误差：最后一个片段吸收剩余差额
            actual_total = sum(p["play_duration"] for p in plan)
            residual = round(voice_duration + (n - 1) * TRANSITION_DUR - actual_total, 3)
            if residual != 0:
                plan[-1]["play_duration"] = round(plan[-1]["play_duration"] + residual, 3)

    return plan


def _build_mashup_ffmpeg_command(
    *,
    plan: list[dict],
    ass_path: str,
    voice_audio_path: str,
    bgm_path: str,
    output_path: str,
    width: int = DEFAULT_WIDTH,
    height: int = DEFAULT_HEIGHT,
    fps: int = DEFAULT_FPS,
    transition_dur: float = TRANSITION_DUR,
    bgm_volume: float = DEFAULT_BGM_VOLUME,
) -> list[str]:
    """
    构建 ffmpeg filter_complex 命令。

    结构：
    1. 每个片段: trim + scale + pad + fps → [v-i]
    2. xfade 级联（转场随机从 slideleft/slideright/fade 选取）
    3. 字幕烧录 → [vout]
    4. 音频混流（voice + bgm，无淡入淡出，所有视频输入音轨丢弃） → [aout]
    """
    n = len(plan)
    cl = [_FFMPEG_EXE, "-y"]

    # ── 输入文件 ──
    # 每个片段独立作为视频输入（允许同一文件出现多次）
    seen_paths: dict[str, int] = {}
    video_input_map: list[int] = []  # plan_idx → input_idx
    for idx, seg in enumerate(plan):
        vpath = seg["video_path"]
        if vpath not in seen_paths:
            seen_paths[vpath] = len(seen_paths)
            cl += ["-i", vpath]
        video_input_map.append(seen_paths[vpath])

    voice_input_idx = len(seen_paths)
    cl += ["-i", voice_audio_path]
    bgm_input_idx = voice_input_idx + 1
    cl += ["-i", bgm_path]

    # ── filter_complex ──
    fc_parts: list[str] = []

    # 1) 每个片段预处理
    for i, seg in enumerate(plan):
        inp_idx = video_input_map[i]
        t_start = seg["trim_start"]
        t_dur = seg["play_duration"]
        # trim 从源视频截取 → 缩放 → 填充 → 帧率统一
        fc_parts.append(
            f"[{inp_idx}:v]trim=start={t_start:.3f}:duration={t_dur:.3f},setpts=PTS-STARTPTS,"
            f"scale={width}:{height}:force_original_aspect_ratio=decrease,"
            f"pad={width}:{height}:(ow-iw)/2:(oh-ih)/2:black,setsar=1,fps={fps}[v{i}]"
        )

    # 2) xfade 级联
    # offset 公式：第 i 个转场 offset = sum(play[0..i]) - (i+1)*transition
    offsets: list[float] = []
    cum = 0.0
    for i in range(n - 1):
        cum += plan[i]["play_duration"]
        offset = round(cum - (i + 1) * transition_dur, 3)
        offsets.append(max(0.001, offset))

    prev_label = "v0"
    for i in range(n - 1):
        transition = random.choice(_XFADE_TRANSITIONS)
        next_label = f"x{i + 1}" if i < n - 2 else "xfinal"
        fc_parts.append(
            f"[{prev_label}][v{i + 1}]xfade=transition={transition}:"
            f"duration={transition_dur}:offset={offsets[i]}[{next_label}]"
        )
        prev_label = next_label

    # 3) 字幕烧录
    fc_parts.append(f"[xfinal]subtitles='{_escape_filter_path(ass_path)}'[vout]")

    # 4) 音频混流（配音 + BGM，无淡入淡出）
    total_duration = round(
        sum(p["play_duration"] for p in plan) - (n - 1) * transition_dur, 3
    )

    fc_parts.append(
        f"[{voice_input_idx}:a]volume={VOICE_VOLUME:.2f},atrim=0:{total_duration:.3f},"
        f"apad=whole_dur={total_duration:.3f},aresample=48000,"
        f"aformat=sample_fmts=fltp:channel_layouts=stereo[voice];"
        f"[{bgm_input_idx}:a]atrim=0:{total_duration:.3f},aresample=48000,"
        f"aformat=sample_fmts=fltp:channel_layouts=stereo,"
        f"volume={bgm_volume:.2f}[music];"
        f"[voice][music]amix=inputs=2:duration=first:dropout_transition=0[aout]"
    )

    fc = ";".join(fc_parts)

    cl += [
        "-filter_complex", fc,
        "-map", "[vout]",
        "-map", "[aout]",
        "-c:v", "libx264",
        "-preset", "fast",
        "-c:a", "aac",
        "-threads", "4",
        "-t", f"{total_duration:.3f}",
        output_path,
    ]

    return cl


def mashup_video_render(
    *,
    task_id: str,
    output_dir: str,
    video_paths: list[str],
    script: str,
    voice_audio_path: str,
    bgm_dir: Optional[str] = None,
    bgm_volume: float = DEFAULT_BGM_VOLUME,
    width: int = DEFAULT_WIDTH,
    height: int = DEFAULT_HEIGHT,
    fps: int = DEFAULT_FPS,
    transition_dur: float = TRANSITION_DUR,
    attempt: int = 0,
    max_retry: int = 2,
) -> PostProcessResult:
    """
    视频混剪端到端渲染入口。

    1. 探测配音时长 → 作为视频总时长基准
    2. 文案断句 → 时间轴分配
    3. 构建片段播放计划（segment plan）
    4. 生成 ASS 字幕
    5. 选取随机 BGM
    6. 构建 ffmpeg 命令 → 执行
    7. 失败自动重试
    """
    os.makedirs(output_dir, exist_ok=True)

    # 1. 探测配音时长
    voice_duration = probe_audio_duration(voice_audio_path)
    if voice_duration <= 0:
        return PostProcessResult(False, "failed", error="配音音频无效或时长为 0")

    # 2. 文案断句 + 时间轴
    segments = split_script_segments(script)
    if not segments:
        return PostProcessResult(False, "failed", error="文案内容为空")

    timeline = create_timeline_by_chars(script, voice_duration)
    if not timeline:
        return PostProcessResult(False, "failed", error="无法生成字幕时间轴")

    # 3. 构建片段播放计划
    try:
        plan = _build_segment_plan(video_paths, timeline)
    except ValueError as e:
        return PostProcessResult(False, "failed", error=str(e))

    # 4. 生成 ASS 字幕
    ass_path = os.path.join(output_dir, f"{task_id}.ass")
    build_ass_subtitles(script, ass_path, voice_duration, width, height)

    # 5. 选取 BGM
    bgm_path = _pick_bgm(bgm_dir)
    Path(os.path.join(output_dir, "ffmpeg_bgm_choice.txt")).write_text(
        bgm_path or "NO_BGM_SELECTED", encoding="utf-8"
    )
    if not bgm_path:
        return PostProcessResult(False, "failed", error="未配置 BGM 目录或目录为空")

    # 6. 构建 ffmpeg 命令
    output_path = os.path.join(output_dir, f"{task_id}_final.mp4")
    cmd = _build_mashup_ffmpeg_command(
        plan=plan,
        ass_path=ass_path,
        voice_audio_path=voice_audio_path,
        bgm_path=bgm_path,
        output_path=output_path,
        width=width,
        height=height,
        fps=fps,
        transition_dur=transition_dur,
        bgm_volume=bgm_volume,
    )

    Path(os.path.join(output_dir, "ffmpeg_burn_cmd.txt")).write_text(" ".join(cmd), encoding="utf-8")

    # 7. 执行 ffmpeg
    try:
        res = _run_ffmpeg(cmd)
    except subprocess.TimeoutExpired:
        return PostProcessResult(False, "failed", error="ffmpeg 执行超时（900s）")

    if res.returncode == 0 and os.path.exists(output_path):
        try:
            os.remove(ass_path)
        except Exception:
            pass
        return PostProcessResult(True, "published", output_path)

    err = (res.stderr or "ffmpeg 视频混剪失败")[-3000:]
    Path(os.path.join(output_dir, "ffmpeg_burn_stderr.txt")).write_text(err, encoding="utf-8")

    if attempt < max_retry:
        return mashup_video_render(
            task_id=task_id, output_dir=output_dir, video_paths=video_paths,
            script=script, voice_audio_path=voice_audio_path, bgm_dir=bgm_dir,
            bgm_volume=bgm_volume, width=width, height=height, fps=fps,
            transition_dur=transition_dur, attempt=attempt + 1, max_retry=max_retry,
        )

    return PostProcessResult(False, "failed", error=err)
