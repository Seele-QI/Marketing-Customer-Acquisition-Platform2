"""
字幕生成模块 — 从 FlashRecognizer 句子级时间轴生成 SRT / ASS 字幕文件

输入：
  - TimedSentence[]（FlashRecognizer 直接返回，已含精确句子起止时间 + 词级时间戳）
  - 或 TimedWord[]（兼容旧接口，自动合并为句子）

输出：SRT 文件 或 ASS 文件路径

用途：剪辑板块「自动字幕生成」— ASR → 字幕文件 → ffmpeg 烧录
"""

from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Any

from lib.video_extract import TimedSentence, TimedWord

logger = logging.getLogger(__name__)

# ── 配置常量 ──────────────────────────────────────────────────────

DEFAULT_MERGE_GAP_MS = 600
MIN_SENTENCE_DURATION_MS = 400
MAX_CHARS_PER_LINE = 22

ASS_FONT_NAME = "宋体"
ASS_FONT_SIZE = 40
ASS_MARGIN_V_RATIO = 0.22
ASS_OUTLINE = 2
ASS_SHADOW = 0

_SENTENCE_END = {"。", "？", "！", "……", "…", ".", "?", "!"}
_CLAUSE_MARKERS = {"，", "、", "：", "；", ",", ":", ";"}


# ── 句子格式化工具 ────────────────────────────────────────────────

def _auto_wrap_subtitle(text: str, max_chars: int = MAX_CHARS_PER_LINE) -> str:
    """长句子自动换行。优先在标点处换行，否则硬切。"""
    if len(text) <= max_chars:
        return text

    parts: list[str] = []
    remaining = text
    while len(remaining) > max_chars:
        split_at = -1
        for marker in _CLAUSE_MARKERS:
            pos = remaining.rfind(marker, 0, max_chars)
            if pos > split_at:
                split_at = pos
        if split_at > max_chars // 2:
            parts.append(remaining[:split_at + 1])
            remaining = remaining[split_at + 1:]
        else:
            parts.append(remaining[:max_chars])
            remaining = remaining[max_chars:]
    parts.append(remaining)
    return "\n".join(p.strip() for p in parts)


def _escape_ass_text(text: str) -> str:
    """ASS 特殊字符转义"""
    return text.replace("\\", "\\\\").replace("{", "\\{").replace("}", "}")


def _ms_to_srt_time(ms: int) -> str:
    """毫秒 → SRT 时间 HH:MM:SS,mmm"""
    h = ms // 3600000
    m = (ms % 3600000) // 60000
    s = (ms % 60000) // 1000
    millis = ms % 1000
    return f"{h:02d}:{m:02d}:{s:02d},{millis:03d}"


def _ms_to_ass_time(ms: int) -> str:
    """毫秒 → ASS 时间 H:MM:SS.cs"""
    total_sec = ms / 1000.0
    h = int(total_sec // 3600)
    m = int((total_sec % 3600) // 60)
    s = int(total_sec % 60)
    cs = int((total_sec - int(total_sec)) * 100)
    return f"{h}:{m:02d}:{s:02d}.{cs:02d}"


# ── 句子生成（从 TimedSentence 或 TimedWord）─────────────────────

def _is_punctuation(text: str) -> bool:
    return text.strip() in (_SENTENCE_END | _CLAUSE_MARKERS)


def sentences_from_timed_words(
    words: list[TimedWord],
    merge_gap_ms: int = DEFAULT_MERGE_GAP_MS,
    min_chars: int = 4,
) -> list[dict[str, Any]]:
    """
    从词级时间戳合并为句子（兼容旧接口，FlashRecognizer 不需要此步骤）。
    返回 [{start_ms, end_ms, text}, ...]
    """
    if not words:
        return []

    sentences: list[dict[str, Any]] = []
    current_words = [words[0]]

    for i in range(1, len(words)):
        gap = words[i].start_ms - words[i - 1].end_ms
        if gap > merge_gap_ms:
            sentences.append(_build_sentence(current_words))
            current_words = [words[i]]
        else:
            current_words.append(words[i])

    if current_words:
        sentences.append(_build_sentence(current_words))

    # 合并过短句子
    merged: list[dict[str, Any]] = []
    i = 0
    while i < len(sentences):
        cur = dict(sentences[i])
        while len(cur["text"]) < min_chars and i + 1 < len(sentences):
            i += 1
            nxt = sentences[i]
            cur["text"] = cur["text"] + nxt["text"]
            cur["end_ms"] = nxt["end_ms"]
        merged.append(cur)
        i += 1

    return merged


def _build_sentence(words: list[TimedWord]) -> dict[str, Any]:
    """将一组 TimedWord 合并为一个句子"""
    meaningful = [w for w in words if not _is_punctuation(w.text)]
    if not meaningful:
        meaningful = words
    text = "".join(w.text + w.punc for w in words)
    start_ms = words[0].start_ms
    end_ms = words[-1].end_ms
    if end_ms - start_ms < MIN_SENTENCE_DURATION_MS:
        end_ms = start_ms + MIN_SENTENCE_DURATION_MS
    return {"start_ms": start_ms, "end_ms": end_ms, "text": text.strip()}


def sentences_from_flash_result(
    timed_sentences: list[TimedSentence],
) -> list[dict[str, Any]]:
    """
    从 FlashRecognizer 的 TimedSentence 直接转换为字幕句子（推荐路径）。

    FlashRecognizer 已自动完成断句和词对齐，无需本地合并逻辑。
    """
    result: list[dict[str, Any]] = []
    for s in timed_sentences:
        text = s.text.strip()
        if not text:
            continue
        start_ms = s.start_ms
        end_ms = s.end_ms
        if end_ms - start_ms < MIN_SENTENCE_DURATION_MS:
            end_ms = start_ms + MIN_SENTENCE_DURATION_MS
        result.append({"start_ms": start_ms, "end_ms": end_ms, "text": text})
    return result


# ── SRT 生成 ──────────────────────────────────────────────────────

def generate_srt(sentences: list[dict[str, Any]], output_path: str) -> str:
    """从句子时间轴生成 SRT 字幕文件。返回输出路径"""
    lines: list[str] = []
    for i, sent in enumerate(sentences, 1):
        start_srt = _ms_to_srt_time(sent["start_ms"])
        end_srt = _ms_to_srt_time(sent["end_ms"])
        text = _auto_wrap_subtitle(sent["text"]).replace("\n", "\n")
        lines.append(f"{i}")
        lines.append(f"{start_srt} --> {end_srt}")
        lines.append(text)
        lines.append("")

    content = "\n".join(lines)
    Path(output_path).write_text(content, encoding="utf-8")
    logger.info(f"SRT 字幕已生成: {output_path} ({len(sentences)} 句)")
    return output_path


# ── ASS 生成 ──────────────────────────────────────────────────────

def generate_ass(
    sentences: list[dict[str, Any]],
    output_path: str,
    video_width: int = 1080,
    video_height: int = 1920,
    font_name: str = ASS_FONT_NAME,
    font_size: int = ASS_FONT_SIZE,
) -> str:
    """从句子时间轴生成 ASS 字幕文件（匹配项目现有风格）。返回输出路径"""
    margin_v = int(video_height * ASS_MARGIN_V_RATIO) if video_height else 220

    header = [
        "[Script Info]",
        "Title: ASR Generated Subtitle (FlashRecognizer)",
        "ScriptType: v4.00+",
        "Collisions: Normal",
        "WrapStyle: 1",
        "PlayDepth: 0",
        f"PlayResX: {video_width}",
        f"PlayResY: {video_height}",
        "",
        "[V4+ Styles]",
        "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, "
        "OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, "
        "ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, "
        "Alignment, MarginL, MarginR, MarginV, Encoding",
        f"Style: Default,{font_name},{font_size},&H00FFFFFF,&H000000FF,"
        f"&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,"
        f"{ASS_OUTLINE},{ASS_SHADOW},2,10,10,{margin_v},1",
        "",
        "[Events]",
        "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
    ]

    events: list[str] = []
    for sent in sentences:
        start_ass = _ms_to_ass_time(sent["start_ms"])
        end_ass = _ms_to_ass_time(sent["end_ms"])
        text = _auto_wrap_subtitle(sent["text"])
        text = _escape_ass_text(text).replace("\n", "\\N")
        events.append(
            f"Dialogue: 0,{start_ass},{end_ass},Default,,0,0,0,,{text}"
        )

    content = "\n".join(header + events)
    Path(output_path).write_text(content, encoding="utf-8-sig")
    logger.info(f"ASS 字幕已生成: {output_path} ({len(sentences)} 句)")
    return output_path


# ── 快捷入口 ──────────────────────────────────────────────────────

def timed_sentences_to_subtitle(
    sentences: list[TimedSentence],
    output_dir: str,
    filename_prefix: str = "subtitle",
    *,
    format: str = "ass",
    video_width: int = 1080,
    video_height: int = 1920,
) -> str:
    """
    一站式：FlashRecognizer 句子 → 字幕文件（推荐路径）。

    参数：
        sentences: FlashRecognizer 返回的 TimedSentence 列表
        output_dir: 输出目录
        filename_prefix: 文件名前缀
        format: 字幕格式 ("ass" | "srt")
        video_width, video_height: 视频分辨率（仅 ASS）

    返回：字幕文件路径
    """
    os.makedirs(output_dir, exist_ok=True)

    sentence_dicts = sentences_from_flash_result(sentences)
    if not sentence_dicts:
        raise ValueError("无有效句子，无法生成字幕")

    ext = ".ass" if format == "ass" else ".srt"
    output_path = os.path.join(output_dir, f"{filename_prefix}{ext}")

    if format == "ass":
        return generate_ass(sentence_dicts, output_path, video_width, video_height)
    else:
        return generate_srt(sentence_dicts, output_path)


def timed_words_to_subtitle(
    words: list[TimedWord],
    output_dir: str,
    filename_prefix: str = "subtitle",
    *,
    format: str = "ass",
    video_width: int = 1080,
    video_height: int = 1920,
    merge_gap_ms: int = DEFAULT_MERGE_GAP_MS,
) -> str:
    """
    一站式：词级时间戳 → 字幕文件（兼容旧接口，FlashRecognizer 不需要此路径）。

    先合并词为句子（按间隔阈值），再生成字幕文件。
    """
    os.makedirs(output_dir, exist_ok=True)

    sentence_dicts = sentences_from_timed_words(words, merge_gap_ms=merge_gap_ms)
    if not sentence_dicts:
        raise ValueError("无有效词序列，无法生成字幕")

    ext = ".ass" if format == "ass" else ".srt"
    output_path = os.path.join(output_dir, f"{filename_prefix}{ext}")

    if format == "ass":
        return generate_ass(sentence_dicts, output_path, video_width, video_height)
    else:
        return generate_srt(sentence_dicts, output_path)
