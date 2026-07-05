from __future__ import annotations

import os
import random
import re
import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

from lib.ffmpeg_runner import run_ffmpeg, run_ffprobe
from lib.subtitle_generator import (
    max_chars_for_video_width,
    clean_subtitle_display as _shared_clean_subtitle_display,
    _auto_wrap_subtitle as _shared_auto_wrap_subtitle,
)


# ── 模板常量（单模板，未来扩展在此添加分支） ──────────────────────────────────────────

TEMPLATE_NAME = "default"
TEMPLATE_DISPLAY_NAME = "默认剪辑"

TEMPLATE_CONFIG = {
    "voice_volume": 1.0,        # 原声音量倍率
    "bgm_fade_in_sec": 1.0,     # BGM 渐入秒数
    "bgm_fade_out_sec": 2.0,    # BGM 渐出秒数
    "video_codec": "libx264",
    "video_preset": "fast",
    "audio_codec": "aac",
    "threads": "4",
    "subtitle_fontsize": 80,
    "subtitle_bold": 1,
    "subtitle_fontname": "宋体",
    "subtitle_primary_colour": "&H0000C8FF",
    "subtitle_outline": 4,
    "subtitle_scale_x": 100,
    "subtitle_scale_y": 100,
    "subtitle_margin_v_ratio": 0.22,
    "card_fontsize": 17,
    "card_line_height": 21,
    "card_padding": 20,
    "card_color": "white",
    "card_border_color": "black@0.8",
    "card_border_w": 2,
}


@dataclass
class PostProcessResult:
    ok: bool
    status: str
    output_path: Optional[str] = None
    error: str = ""


_PUNCTUATION_WEIGHTS = {
    "，": 0.8,
    "、": 0.6,
    "；": 1.0,
    "。": 1.4,
    "！": 1.4,
    "？": 1.4,
    "：": 0.8,
    "—": 0.8,
    "…": 1.2,
    ",": 0.6,
    ".": 1.0,
    "!": 1.2,
    "?": 1.2,
    "/": 0.2,
}

_SUBTITLE_ALLOWED_RE = re.compile(r"[^0-9A-Za-z\u4e00-\u9fff\s]+")
_SUBTITLE_BREAK_RE = re.compile(r"[。！？\r\n]+")
# 行内级切分标点：长字幕内部按停顿（，）或并列（、）换行（不产生新 Dialogue）
_SUBTITLE_LINE_BREAK_RE = re.compile(r"[，、]")

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


def _escape_ass_text(text: str) -> str:
    return text.replace("\\", "\\\\").replace("{", "\\{").replace("}", "\\}")


def _format_time(seconds: float) -> str:
    seconds = max(0.0, seconds)
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    cs = int((seconds - int(seconds)) * 100)
    return f"{h}:{m:02d}:{s:02d}.{cs:02d}"


def _line_weight(line: str) -> float:
    clean = _clean_subtitle_text(line)
    weight = float(len(clean.replace(" ", "")))
    for ch in line:
        weight += _PUNCTUATION_WEIGHTS.get(ch, 0.0)
    return max(1.0, weight)


def _clean_subtitle_text(text: str) -> str:
    return _shared_clean_subtitle_display(text)


def split_script_segments(script: str) -> list[str]:
    """一句一字幕页：按 。！？ 与换行切分，保留段内 ，、 供折行。"""
    from lib.subtitle_align import split_script_cues

    return split_script_cues(script)


def _auto_wrap(text: str, max_chars: int = 24) -> str:
    """语义化字幕折行：先按 ，、 切分，再剥标点，最后硬切。

    每个折行段之间用 \\N 拼接，渲染为同一 Dialogue 的多行。
    """
    wrapped = _shared_auto_wrap_subtitle(text, max_chars)
    return wrapped.replace("\n", "\\N")


def probe_duration(media_path: str) -> float:
    cmd = [_FFPROBE_EXE, "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", media_path]
    res = run_ffprobe(cmd, timeout=30)
    if res.returncode == 0 and res.stdout.strip():
        return max(0.1, float(res.stdout.strip()))
    return 30.0


def probe_audio_duration(media_path: str) -> float:
    cmd = [_FFPROBE_EXE, "-v", "error", "-select_streams", "a:0", "-show_entries", "stream=duration", "-of", "default=noprint_wrappers=1:nokey=1", media_path]
    res = run_ffprobe(cmd, timeout=30)
    if res.returncode == 0 and res.stdout.strip() and res.stdout.strip() != "N/A":
        return max(0.1, float(res.stdout.strip().splitlines()[0]))
    return probe_duration(media_path)


def resolve_target_duration(input_video_path: str) -> float:
    audio_duration = probe_audio_duration(input_video_path)
    video_duration = probe_duration(input_video_path)
    if audio_duration and audio_duration > 0:
        if video_duration and video_duration > 0:
            return round(min(audio_duration, video_duration), 3)
        return round(audio_duration, 3)
    return round(video_duration, 3)


def probe_resolution(video_path: str) -> tuple[int, int]:
    cmd = [_FFPROBE_EXE, "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=s=x:p=0", video_path]
    res = run_ffprobe(cmd, timeout=30)
    if res.returncode == 0 and "x" in res.stdout:
        w, h = res.stdout.strip().split("x", 1)
        return int(w), int(h)
    return 576, 1024


def has_audio_stream(video_path: str) -> bool:
    cmd = [_FFPROBE_EXE, "-v", "error", "-select_streams", "a:0", "-show_entries", "stream=index", "-of", "csv=p=0", video_path]
    res = run_ffprobe(cmd, timeout=30)
    return res.returncode == 0 and bool(res.stdout.strip())


def create_timeline_by_chars(script: str, duration: float) -> list[dict[str, float | str]]:
    lines = split_script_segments(script)
    if not lines:
        return []

    duration = round(max(0.0, float(duration)), 3)
    if duration <= 0:
        return []

    weights: list[float] = []
    for line in lines:
        char_count = len(line.replace(" ", ""))
        weight = max(1.0, float(char_count))
        if char_count <= 6:
            weight += 1.4
        elif char_count >= 18:
            weight += 2.0
        weights.append(weight)

    total_weight = sum(weights) or float(len(lines))
    min_piece = 0.6
    max_piece = 6.5
    enforce_minimum = duration >= round(min_piece * len(lines), 3)
    allocated: list[float] = []
    remaining = duration

    for idx, weight in enumerate(weights):
        remaining_count = len(weights) - idx - 1
        if idx == len(weights) - 1:
            piece_duration = round(remaining, 3)
        else:
            piece_duration = round(duration * (weight / total_weight), 3)
            if enforce_minimum:
                piece_duration = max(min_piece, min(piece_duration, max_piece))
                max_allowed = round(remaining - (remaining_count * min_piece), 3)
                piece_duration = min(piece_duration, max_allowed)
            else:
                max_allowed = remaining
                piece_duration = min(piece_duration, max_allowed)
            piece_duration = round(max(0.001, piece_duration), 3)
        allocated.append(piece_duration)
        remaining = round(remaining - piece_duration, 3)

    if allocated:
        allocated[-1] = round(allocated[-1] + remaining, 3)

    timeline: list[dict[str, float | str]] = []
    cursor = 0.0
    for idx, line in enumerate(lines):
        start = round(cursor, 3)
        end = round(cursor + allocated[idx], 3)
        timeline.append({"start": start, "duration": round(allocated[idx], 3), "end": end, "text": line})
        cursor = end
    if timeline:
        timeline[-1]["end"] = round(duration, 3)
        timeline[-1]["duration"] = round(duration - float(timeline[-1]["start"]), 3)
    return timeline


def build_ass_subtitles(script: str, output_path: str, duration: float, width: int, height: int) -> None:
    timeline = create_timeline_by_chars(script, duration)
    if not timeline:
        raise ValueError("脚本内容为空，无法生成字幕时间轴")
    cfg = TEMPLATE_CONFIG
    margin_v = int(height * cfg["subtitle_margin_v_ratio"]) if height else 220
    wrap_max_chars = max_chars_for_video_width(width, cfg["subtitle_fontsize"])
    style_line = (
        f"Style: Default,{cfg['subtitle_fontname']},{cfg['subtitle_fontsize']},"
        f"{cfg['subtitle_primary_colour']},&H000000FF,&H00000000,&H00000000,"
        f"{cfg['subtitle_bold']},0,0,0,{cfg['subtitle_scale_x']},{cfg['subtitle_scale_y']},0,0,1,"
        f"{cfg['subtitle_outline']},0,2,10,10,{margin_v},1"
    )
    ass = [
        "[Script Info]",
        "Title: Generated Subtitle",
        "ScriptType: v4.00+",
        "Collisions: Normal",
        "WrapStyle: 1",
        "PlayDepth: 0",
        f"PlayResX: {width}",
        f"PlayResY: {height}",
        "",
        "[V4+ Styles]",
        "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
        style_line,
        "",
        "[Events]",
        "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
    ]
    for row in timeline:
        text = _escape_ass_text(_auto_wrap(str(row["text"]), wrap_max_chars))
        ass.append(f"Dialogue: 0,{_format_time(float(row['start']))},{_format_time(float(row['end']))},Default,,0,0,0,,{text}")
    Path(output_path).write_text("\n".join(ass), encoding="utf-8-sig")


def _run_ffmpeg(args: list[str], timeout: int = 900) -> subprocess.CompletedProcess[str]:
    return run_ffmpeg(args, timeout=timeout)


def _escape_filter_path(path_value: str) -> str:
    return path_value.replace("\\", "/").replace(":", "\\:").replace("'", "\\'")


def _drawtext_escape(text: str) -> str:
    return text.replace("\\", "\\\\").replace("'", "\\'").replace(":", "\\:").replace(",", "\\,")


def _pick_bgm(bgm_dir: Optional[str]) -> Optional[str]:
    if not bgm_dir or not os.path.isdir(bgm_dir):
        return None
    files = [f for f in os.listdir(bgm_dir) if f.lower().endswith((".mp3", ".wav", ".aac", ".m4a"))]
    return os.path.join(bgm_dir, random.choice(files)) if files else None


def _build_image_slideshow(
    image_paths: list[str],
    output_path: str,
    target_width: int,
    slide_height: int,
    total_duration: float,
) -> Optional[str]:
    """预构建图片幻灯片视频：每张图显示 1.5 秒 + 1.5 秒黑场间隔。

    所有图片统一缩放到 ``target_width × slide_height``，保持原始宽高比并用黑边居中填充。
    返回幻灯片视频路径；若 ``image_paths`` 为空或构建失败则返回 None。
    """
    if not image_paths:
        return None

    n = len(image_paths)
    # 每张图 1.5s 展示 + 1.5s 黑场 = 3s 一个周期
    segment_dur = 1.5
    gap_dur = 1.5

    # 构建 filter_complex：对每张图 scale+pad → [s0], [s1], ... + 一个 [blank] 黑场源
    filter_parts: list[str] = []
    concat_labels: list[str] = []

    for idx, img_path in enumerate(image_paths):
        escaped = _escape_filter_path(img_path)
        filter_parts.append(
            f"[{idx}:v]scale={target_width}:{slide_height}:force_original_aspect_ratio=decrease,"
            f"pad={target_width}:{slide_height}:(ow-iw)/2:(oh-ih)/2:black,setsar=1,fps=25[s{idx}]"
        )
        concat_labels.append(f"[s{idx}]")
        concat_labels.append("[blank]")

    # 黑场源（复用，时长等于 gap_dur）
    filter_parts.append(
        f"color=c=black:s={target_width}x{slide_height}:r=25:d={gap_dur}[blank]"
    )

    # concat 拼接：s0 → blank → s1 → blank → ... → sN-1 → blank（最后多一个 blank 无影响，-t 裁剪）
    concat_n = len(concat_labels)
    filter_parts.append(f"{''.join(concat_labels)}concat=n={concat_n}:v=1:a=0[out]")

    filter_complex = ";".join(filter_parts)

    # 组装输入参数
    inputs: list[str] = []
    for img_path in image_paths:
        inputs.extend(["-loop", "1", "-t", f"{segment_dur}", "-i", img_path])

    cmd = [
        _FFMPEG_EXE, "-y",
        *inputs,
        "-filter_complex", filter_complex,
        "-map", "[out]",
        "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p",
        "-t", f"{total_duration:.3f}",
        output_path,
    ]

    res = _run_ffmpeg(cmd, timeout=300)
    if res.returncode == 0 and os.path.exists(output_path) and os.path.getsize(output_path) > 0:
        return output_path
    # 构建失败不阻断主流程，记录 stderr 后回退到无幻灯片模式
    err_sample = (res.stderr or "")[-500:]
    print(f"[video_postprocess] 图片幻灯片构建失败 (n={n}): {err_sample}", flush=True)
    return None


def _build_ffmpeg_command(
    *,
    input_video_path: str,
    bgm_path: Optional[str],
    ass_path: Optional[str],
    output_path: str,
    duration: float,
    bgm_volume: float,
    business_card_lines: Optional[list[str]] = None,
    slideshow_path: Optional[str] = None,
) -> list[str]:
    """单模板：原声 + 可选 BGM 混音 + 可选字幕烧录 + 可选 drawtext 名片。

    - ``bgm_path`` 为空：仅人声，不混 BGM
    - ``ass_path`` 为空：不烧字幕（名片 drawtext 仍可叠加）

    当提供 ``slideshow_path`` 时，图片幻灯片会通过 vstack 拼在视频下方；
    字幕和名片在 vstack 前烧录到主视频上，确保坐标不变。
    """
    cfg = TEMPLATE_CONFIG
    width, height = probe_resolution(input_video_path)
    bgm_volume = max(0.0, min(float(bgm_volume), 1.0))
    business_card_lines = business_card_lines or []
    use_bgm = bool(bgm_path)

    # ── 视频 filter（可选字幕 + 可选名片） ──
    filters: list[str] = []
    if ass_path:
        filters.append(f"subtitles='{_escape_filter_path(ass_path)}'")
    if business_card_lines:
        line_h = cfg["card_line_height"]
        base_y = max(0, (height - len(business_card_lines) * line_h) // 2)
        for idx, line in enumerate(business_card_lines):
            y = base_y + idx * line_h
            filters.append(
                f"drawtext=text='{_drawtext_escape(line)}':font='宋体':"
                f"fontcolor={cfg['card_color']}:fontsize={cfg['card_fontsize']}:"
                f"x={cfg['card_padding']}:y={y}:borderw={cfg['card_border_w']}:"
                f"bordercolor={cfg['card_border_color']}"
            )
    vf = ",".join(filters) if filters else ""

    # ── 音频 filter：原声，可选 + BGM 混音 ──
    voice_vol = cfg["voice_volume"]
    fade_in = cfg["bgm_fade_in_sec"]
    fade_out = cfg["bgm_fade_out_sec"]

    voice_chain = (
        f"[0:a]volume={voice_vol:.2f},atrim=0:{duration:.3f},apad=whole_dur={duration:.3f},aresample=48000,"
        "aformat=sample_fmts=fltp:channel_layouts=stereo[voice]"
    )

    if use_bgm:
        # BGM 输入索引：无幻灯片时是 1，有幻灯片时是 2（幻灯片占输入 1）
        bgm_input_idx = 2 if slideshow_path else 1
        music_chain = (
            f"[{bgm_input_idx}:a]atrim=0:{duration:.3f},aresample=48000,"
            "aformat=sample_fmts=fltp:channel_layouts=stereo,"
            f"volume={bgm_volume:.2f},afade=t=in:st=0:d={fade_in},"
            f"afade=t=out:st={max(0, duration - fade_out):.3f}:d={fade_out}[music]"
        )
        amix = "[voice][music]amix=inputs=2:duration=first:dropout_transition=0[aout]"
        audio_fc = f"{voice_chain};{music_chain};{amix}"
    else:
        audio_fc = (
            f"[0:a]volume={voice_vol:.2f},atrim=0:{duration:.3f},apad=whole_dur={duration:.3f},"
            "aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo[aout]"
        )

    cmd: list[str] = [_FFMPEG_EXE, "-y", "-stream_loop", "-1", "-i", input_video_path]
    if slideshow_path:
        cmd += ["-stream_loop", "-1", "-i", slideshow_path]
    if use_bgm:
        cmd += ["-stream_loop", "-1", "-i", bgm_path]

    if slideshow_path:
        if vf:
            video_fc = f"[0:v]{vf}[main_sub];[main_sub][1:v]vstack=inputs=2[vout]"
        else:
            video_fc = "[0:v][1:v]vstack=inputs=2[vout]"
        fc = f"{video_fc};{audio_fc}"
        cmd += [
            "-filter_complex", fc,
            "-map", "[vout]", "-map", "[aout]",
        ]
    else:
        cmd += ["-filter_complex", audio_fc, "-map", "0:v", "-map", "[aout]"]
        if vf:
            cmd += ["-vf", vf]

    cmd += [
        "-c:v", cfg["video_codec"], "-preset", cfg["video_preset"],
        "-c:a", cfg["audio_codec"],
        "-threads", cfg["threads"],
        "-t", f"{duration:.3f}",
        output_path,
    ]
    return cmd


def burn_subtitle_ffmpeg(
    input_video_path: str,
    ass_path: str,
    output_path: str,
    duration: float,
    business_card_text: str = "",
    bgm_dir: Optional[str] = None,
    preset: str = "default",
    bgm_volume: float = 0.32,
    slide_image_paths: Optional[list[str]] = None,
    *,
    enable_bgm: bool = True,
    enable_subtitles: bool = True,
) -> PostProcessResult:
    """单模板入口：可选 BGM → 可选字幕 → 可选图片幻灯片 → 拼 ffmpeg 命令 → 执行。"""
    width, height = probe_resolution(input_video_path)  # noqa: F841 - probed for test back-compat
    _ = has_audio_stream(input_video_path)  # no-op 调用，保留 test mock 兼容
    use_bgm = bool(enable_bgm) and float(bgm_volume) > 0
    bgm_path = _pick_bgm(bgm_dir) if use_bgm else None
    debug_dir = os.path.dirname(output_path)
    Path(os.path.join(debug_dir, "ffmpeg_bgm_choice.txt")).write_text(
        bgm_path or ("BGM_DISABLED" if not use_bgm else "NO_BGM_SELECTED"),
        encoding="utf-8",
    )
    if use_bgm and not bgm_path:
        return PostProcessResult(False, "failed", error="未配置 BGM 目录或目录为空，无法添加 BGM")
    card_lines = [ln.strip() for ln in (business_card_text or "").replace("\r\n", "\n").replace("\r", "\n").split("\n") if ln.strip()] if business_card_text else []

    effective_ass = ass_path if (enable_subtitles and ass_path and os.path.isfile(ass_path)) else None

    # ── 图片幻灯片预处理 ──
    slideshow_path: Optional[str] = None
    slide_paths = slide_image_paths or []
    if slide_paths:
        slide_h = int(width * 0.75) if width > 0 else 432
        slideshow_out = os.path.join(debug_dir, "_slideshow_tmp.mp4")
        slideshow_path = _build_image_slideshow(slide_paths, slideshow_out, width, slide_h, duration)
        if slideshow_path:
            Path(os.path.join(debug_dir, "ffmpeg_slideshow_info.txt")).write_text(
                f"images={len(slide_paths)} w={width} slide_h={slide_h} duration={duration:.3f}",
                encoding="utf-8",
            )

    cmd = _build_ffmpeg_command(
        input_video_path=input_video_path,
        bgm_path=bgm_path,
        ass_path=effective_ass,
        output_path=output_path,
        duration=duration,
        bgm_volume=bgm_volume if use_bgm else 0.0,
        business_card_lines=card_lines,
        slideshow_path=slideshow_path,
    )
    Path(os.path.join(debug_dir, "ffmpeg_burn_cmd.txt")).write_text(" ".join(cmd), encoding="utf-8")
    res = _run_ffmpeg(cmd)

    # 清理临时幻灯片文件
    if slideshow_path and os.path.isfile(slideshow_path):
        try:
            os.remove(slideshow_path)
        except Exception:
            pass

    if res.returncode == 0 and os.path.exists(output_path):
        return PostProcessResult(True, "published", output_path)
    err = (res.stderr or "ffmpeg 字幕烧录失败")[-2000:]
    Path(os.path.join(debug_dir, "ffmpeg_burn_stderr.txt")).write_text(err, encoding="utf-8")
    return PostProcessResult(False, "failed", error=err)


def render_video_with_template(
    *,
    task_id: str,
    output_dir: str,
    script: str,
    business_card_text: str,
    bgm_dir: Optional[str],
    bgm_volume: float,
    input_video_path: str,
    keep_original: bool = True,
    attempt: int = 0,
    max_retry: int = 2,
    subtitle_file_path: str = "",
    slide_image_paths: Optional[list[str]] = None,
    enable_bgm: bool = True,
    enable_subtitles: bool = True,
) -> PostProcessResult:
    """端到端 orchestrator：探测元数据 → 可选 BGM → 可选字幕 → 拼 ffmpeg → 输出。

    输入必须是本地文件路径；URL / Base64 / upload_id 由调用方（main.py）解析好再传入。
    失败时按 ``max_retry`` 自动重试。

    ``enable_subtitles=False``：不烧字幕。
    ``enable_bgm=False`` 或 ``bgm_volume<=0``：不混 BGM。
    """
    os.makedirs(output_dir, exist_ok=True)
    if keep_original:
        try:
            shutil.copy2(input_video_path, os.path.join(output_dir, f"{task_id}_original.mp4"))
        except Exception:
            pass

    duration = resolve_target_duration(input_video_path)

    ass_path = ""
    owned_ass = False
    if enable_subtitles:
        # 字幕文件：优先使用预生成的 ASR 字幕，否则按字符比例分配
        if subtitle_file_path and os.path.isfile(subtitle_file_path):
            ass_path = subtitle_file_path
        else:
            width, height = probe_resolution(input_video_path)
            ass_path = os.path.join(output_dir, f"{task_id}.ass")
            build_ass_subtitles(script, ass_path, duration, width, height)
            owned_ass = True

    output_path = os.path.join(output_dir, f"{task_id}_final.mp4")
    result = burn_subtitle_ffmpeg(
        input_video_path, ass_path, output_path, duration,
        business_card_text, bgm_dir, "default", bgm_volume,
        slide_image_paths=slide_image_paths,
        enable_bgm=enable_bgm,
        enable_subtitles=enable_subtitles,
    )
    if result.ok:
        # 只清理自己生成的临时 ASS，不删传入的字幕文件
        if owned_ass and ass_path:
            try:
                os.remove(ass_path)
            except Exception:
                pass
        return result
    if attempt < max_retry:
        return render_video_with_template(
            task_id=task_id, output_dir=output_dir, script=script,
            business_card_text=business_card_text, bgm_dir=bgm_dir,
            bgm_volume=bgm_volume, input_video_path=input_video_path,
            keep_original=False, attempt=attempt + 1, max_retry=max_retry,
            subtitle_file_path=subtitle_file_path,
            slide_image_paths=slide_image_paths,
            enable_bgm=enable_bgm,
            enable_subtitles=enable_subtitles,
        )
    return result


def run_ffmpeg_post_process(task_id: str, input_video_path: str, output_dir: str, script: str, keep_original: bool = True, business_card_text: str = "", bgm_dir: Optional[str] = None, preset: str = "default", bgm_volume: float = 0.32, attempt: int = 0, max_retry: int = 2, subtitle_file_path: str = "", slide_image_paths: Optional[list[str]] = None, enable_bgm: bool = True, enable_subtitles: bool = True) -> PostProcessResult:
    """旧 API 兼容层：直接 delegate 到 render_video_with_template。"""
    return render_video_with_template(
        task_id=task_id, output_dir=output_dir, script=script,
        business_card_text=business_card_text, bgm_dir=bgm_dir,
        bgm_volume=bgm_volume, input_video_path=input_video_path,
        keep_original=keep_original, attempt=attempt, max_retry=max_retry,
        subtitle_file_path=subtitle_file_path,
        slide_image_paths=slide_image_paths,
        enable_bgm=enable_bgm,
        enable_subtitles=enable_subtitles,
    )
