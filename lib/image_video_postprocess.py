"""
图文视频 ffmpeg 合成模块。

功能：多张图片 + 配音音频 + 字幕 + BGM → 带转场效果的竖屏视频。

复用 video_postprocess 的：
- split_script_segments / create_timeline_by_chars → 字幕时间轴
- build_ass_subtitles → ASS 字幕文件生成
- _pick_bgm → 随机 BGM 选取
- PostProcessResult → 统一结果类型
"""

from __future__ import annotations

import os
import random
import subprocess
from pathlib import Path
from typing import Optional

from lib.ffmpeg_runner import run_ffmpeg, run_ffprobe
from lib.video_postprocess import (
    PostProcessResult,
    split_script_segments,
    create_timeline_by_chars,
    build_ass_subtitles,
    _pick_bgm,
    _escape_filter_path,
    probe_audio_duration,
)

# ── ffmpeg / ffprobe 路径（与 video_postprocess 一致） ──────────────────────
_PROJECT_ROOT = Path(__file__).resolve().parent.parent
_LOCAL_FFMPEG_BIN = _PROJECT_ROOT / "tools" / "ffmpeg" / "bin"
# 环境变量优先：桌面打包场景下，Electron 主进程通过 env 注入绝对路径，
# 这样不需要在每个运行机器上把 ffmpeg 复制到 tools/ffmpeg/bin/。
# 见 docs/superpowers/specs/2026-06-24-electron-desktop-packaging-design.md
_FFMPEG_EXE = os.environ.get("FFMPEG_EXE") or (
    str(_LOCAL_FFMPEG_BIN / "ffmpeg.exe") if (_LOCAL_FFMPEG_BIN / "ffmpeg.exe").exists() else "ffmpeg"
)
_FFPROBE_EXE = os.environ.get("FFPROBE_EXE") or (
    str(_LOCAL_FFMPEG_BIN / "ffprobe.exe") if (_LOCAL_FFMPEG_BIN / "ffprobe.exe").exists() else "ffprobe"
)

# ── 可用转场效果 ──────────────────────────────────────────────────────────
_XFADE_TRANSITIONS = ["slideleft", "slideright", "fade"]

# ── 输出配置 ──────────────────────────────────────────────────────────────
DEFAULT_WIDTH = 1080
DEFAULT_HEIGHT = 1440  # 3:4 竖屏
DEFAULT_FPS = 25
DEFAULT_TRANSITION_DUR = 0.3

# ── BGM 混音配置 ──────────────────────────────────────────────────────────
DEFAULT_BGM_VOLUME = 0.32
VOICE_VOLUME = 1.0


def _run_ffmpeg(args: list[str], timeout: int = 900) -> subprocess.CompletedProcess[str]:
    """执行 ffmpeg 命令，返回 CompletedProcess。"""
    return run_ffmpeg(args, timeout=timeout)


def _probe_image_resolution(image_path: str) -> tuple[int, int]:
    """探测图片原始分辨率。"""
    cmd = [
        _FFPROBE_EXE, "-v", "error",
        "-select_streams", "v:0",
        "-show_entries", "stream=width,height",
        "-of", "csv=s=x:p=0",
        image_path,
    ]
    res = run_ffprobe(cmd, timeout=30)
    if res.returncode == 0 and "x" in res.stdout:
        w, h = res.stdout.strip().split("x", 1)
        return int(w), int(h)
    return DEFAULT_WIDTH, DEFAULT_HEIGHT


def _build_image_video_ffmpeg_command(
    *,
    image_paths: list[str],
    durations: list[float],
    ass_path: str,
    voice_audio_path: str,
    bgm_path: str,
    output_path: str,
    width: int = DEFAULT_WIDTH,
    height: int = DEFAULT_HEIGHT,
    fps: int = DEFAULT_FPS,
    transition_dur: float = DEFAULT_TRANSITION_DUR,
    bgm_volume: float = DEFAULT_BGM_VOLUME,
) -> list[str]:
    """
    构建单次 ffmpeg filter_complex 命令。

    filter_complex 结构：
    1. 每个图片 scale+pad → [vi]
    2. 级联 xfade → [xN] （最后一级）
    3. 字幕烧录 subtitles → [vout]
    4. 音频混流 amix（voice + bgm）→ [aout]

    转场 offset 公式（第 i 个转场，i 从 0 开始）：
        offset = sum(d[0..i]) - (i + 1) × transition_dur
    """
    n = len(image_paths)
    if n < 2:
        raise ValueError("至少需要 2 张图片才能使用转场")

    cl = [_FFMPEG_EXE, "-y"]

    # ── 输入文件 ──
    # 每张图片作为独立视频输入（-loop 1 循环为静态帧流）
    for img in image_paths:
        cl += ["-loop", "1", "-i", img]
    # 配音音频
    cl += ["-i", voice_audio_path]
    # BGM 音频
    cl += ["-i", bgm_path]

    # ── filter_complex ──
    fc_parts: list[str] = []

    # 1) 图片预处理：缩放到目标尺寸，居中裁剪/填充
    for i in range(n):
        fc_parts.append(
            f"[{i}:v]scale={width}:{height}:force_original_aspect_ratio=decrease,"
            f"pad={width}:{height}:(ow-iw)/2:(oh-ih)/2:black,setsar=1,fps={fps}[v{i}]"
        )

    # 2) xfade 级联
    # 计算每个转场的 offset
    offsets: list[float] = []
    cum = 0.0
    for i in range(n - 1):
        cum += durations[i]
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

    # 4) 音频混流：原声 + BGM（无淡入淡出）
    voice_idx = n       # 第 n 个输入是配音
    bgm_idx = n + 1     # 第 n+1 个输入是 BGM

    # 计算总视频时长
    total_duration = round(sum(durations) - (n - 1) * transition_dur, 3)

    fc_parts.append(
        f"[{voice_idx}:a]volume={VOICE_VOLUME:.2f},atrim=0:{total_duration:.3f},"
        f"apad=whole_dur={total_duration:.3f},aresample=48000,"
        f"aformat=sample_fmts=fltp:channel_layouts=stereo[voice];"
        f"[{bgm_idx}:a]atrim=0:{total_duration:.3f},aresample=48000,"
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


def image_video_render(
    *,
    task_id: str,
    output_dir: str,
    image_paths: list[str],
    script: str,
    voice_audio_path: str,
    bgm_dir: Optional[str] = None,
    bgm_volume: float = DEFAULT_BGM_VOLUME,
    width: int = DEFAULT_WIDTH,
    height: int = DEFAULT_HEIGHT,
    fps: int = DEFAULT_FPS,
    transition_dur: float = DEFAULT_TRANSITION_DUR,
    attempt: int = 0,
    max_retry: int = 2,
    subtitle_file_path: str = "",
) -> PostProcessResult:
    """
    图文视频端到端渲染入口。

    1. 探测配音时长 → 作为视频总时长基准
    2. 脚本断句 + 按字数比例分配时间轴
    3. 图片随机打乱 → 按时间轴一一对应（不足时循环）
    4. 生成 ASS 字幕文件
    5. 选取随机 BGM
    6. 构建 ffmpeg 命令 → 执行
    7. 失败自动重试

    Args:
        task_id: 任务 ID（用于文件命名）
        output_dir: 输出目录
        image_paths: 图片文件路径列表
        script: 文案全文
        voice_audio_path: 配音音频文件路径
        bgm_dir: BGM 素材目录
        bgm_volume: BGM 音量 (0.0-1.0)
        width: 输出视频宽度
        height: 输出视频高度
        fps: 帧率
        transition_dur: 转场时长（秒）
        attempt: 当前重试次数
        max_retry: 最大重试次数

    Returns:
        PostProcessResult
    """
    os.makedirs(output_dir, exist_ok=True)

    # 1. 探测配音时长
    voice_duration = probe_audio_duration(voice_audio_path)
    if voice_duration <= 0:
        return PostProcessResult(False, "failed", error="配音音频无效或时长为 0")

    # 2. 脚本断句 + 时间轴
    segments = split_script_segments(script)
    if not segments:
        return PostProcessResult(False, "failed", error="文案内容为空，无法生成时间轴")

    timeline = create_timeline_by_chars(script, voice_duration)
    if not timeline:
        return PostProcessResult(False, "failed", error="无法生成字幕时间轴")

    durations: list[float] = [float(row["duration"]) for row in timeline]

    # 3. 图片随机排布，与时间轴一一对应（不足循环）
    shuffled = list(image_paths)
    random.shuffle(shuffled)
    assigned_images: list[str] = []
    for i in range(len(timeline)):
        assigned_images.append(shuffled[i % len(shuffled)])

    # 4. 生成 ASS 字幕（优先使用预生成 ASR 字幕）
    generated_ass_path = os.path.join(output_dir, f"{task_id}.ass")
    if subtitle_file_path and os.path.isfile(subtitle_file_path):
        ass_path = subtitle_file_path
        ass_is_generated = False
    else:
        ass_path = generated_ass_path
        build_ass_subtitles(script, ass_path, voice_duration, width, height)
        ass_is_generated = True

    # 5. 选取 BGM
    bgm_path = _pick_bgm(bgm_dir)
    debug_dir = output_dir
    Path(os.path.join(debug_dir, "ffmpeg_bgm_choice.txt")).write_text(
        bgm_path or "NO_BGM_SELECTED", encoding="utf-8"
    )
    if not bgm_path:
        return PostProcessResult(False, "failed", error="未配置 BGM 目录或目录为空")

    # 6. 构建 ffmpeg 命令
    output_path = os.path.join(output_dir, f"{task_id}_final.mp4")
    cmd = _build_image_video_ffmpeg_command(
        image_paths=assigned_images,
        durations=durations,
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

    # 写调试文件
    Path(os.path.join(debug_dir, "ffmpeg_burn_cmd.txt")).write_text(
        " ".join(cmd), encoding="utf-8"
    )

    # 7. 执行 ffmpeg
    try:
        res = _run_ffmpeg(cmd)
    except subprocess.TimeoutExpired:
        return PostProcessResult(False, "failed", error="ffmpeg 执行超时（900s）")

    if res.returncode == 0 and os.path.exists(output_path):
        if ass_is_generated:
            try:
                os.remove(ass_path)
            except Exception:
                pass
        return PostProcessResult(True, "published", output_path)

    err = (res.stderr or "ffmpeg 图文视频合成失败")[-3000:]
    Path(os.path.join(debug_dir, "ffmpeg_burn_stderr.txt")).write_text(
        err, encoding="utf-8"
    )

    # 8. 重试
    if attempt < max_retry:
        return image_video_render(
            task_id=task_id,
            output_dir=output_dir,
            image_paths=image_paths,
            script=script,
            voice_audio_path=voice_audio_path,
            bgm_dir=bgm_dir,
            bgm_volume=bgm_volume,
            width=width,
            height=height,
            fps=fps,
            transition_dur=transition_dur,
            attempt=attempt + 1,
            max_retry=max_retry,
            subtitle_file_path=subtitle_file_path,
        )

    return PostProcessResult(False, "failed", error=err)
