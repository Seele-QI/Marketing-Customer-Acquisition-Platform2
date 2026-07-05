"""
ASR 字幕校对对齐 — 原文案断句 + ASR 词级时间戳。

时间戳来自 ASR 词级结果；展示文案与换页/换行来自用户原文案标点。
"""

from __future__ import annotations

import logging
import os
import re
from typing import Any

from lib.subtitle_generator import (
    ASS_BOLD,
    ASS_FONT_NAME,
    ASS_FONT_SIZE,
    ASS_OUTLINE,
    ASS_PRIMARY_COLOUR,
    ASS_MARGIN_V_RATIO,
    MIN_SENTENCE_DURATION_MS,
    generate_ass,
    generate_srt,
    max_chars_for_video_width,
)
from lib.video_extract import TimedSentence, TimedWord

logger = logging.getLogger(__name__)

# 换页：句末标点与换行
_PAGE_BREAK_RE = re.compile(r"[。！？\r\n]+")
# 对齐用：仅保留中英数字
_ALIGN_KEEP_RE = re.compile(r"[0-9A-Za-z\u4e00-\u9fff]+")

__all__ = [
    "normalize_for_align",
    "split_script_cues",
    "flatten_asr_words",
    "align_script_to_asr",
    "script_aligned_sentences_to_subtitle",
    "try_build_aligned_subtitle",
]


def normalize_for_align(text: str) -> str:
    """去空白与标点，仅保留中英数字，用于字符级对齐。"""
    if not text:
        return ""
    return "".join(_ALIGN_KEEP_RE.findall(text))


def split_script_cues(script: str) -> list[str]:
    """
    按 。！？ 与换行切分为字幕页（cue）。

    保留段内 ，、 供行内折行；不在此处剥标点。
    """
    raw = (script or "").replace("\r\n", "\n").replace("\r", "\n")
    cues: list[str] = []
    for paragraph in raw.split("\n"):
        paragraph = paragraph.strip()
        if not paragraph:
            continue
        pieces = [p.strip() for p in _PAGE_BREAK_RE.split(paragraph) if p.strip()]
        cues.extend(pieces)
    return cues


def flatten_asr_words(sentences: list[TimedSentence]) -> list[TimedWord]:
    """展平 ASR 句子中的词级时间戳；无 words 时用整句作为一个伪词。"""
    words: list[TimedWord] = []
    for sent in sentences:
        if sent.words:
            for w in sent.words:
                w_text = (w.text or "").strip()
                if not w_text and not (w.punc or "").strip():
                    continue
                words.append(w)
        else:
            text = (sent.text or "").strip()
            if text:
                words.append(
                    TimedWord(
                        text=text,
                        start_ms=int(sent.start_ms),
                        end_ms=int(sent.end_ms),
                    )
                )
    return words


def align_script_to_asr(
    script: str,
    sentences: list[TimedSentence],
) -> list[dict[str, Any]]:
    """
    校对工序：原文案切 cue，映射到 ASR 词级时间轴。

    返回 [{start_ms, end_ms, text}, ...]，text 为原文案 cue（含 ，、）。
    """
    cues = split_script_cues(script)
    if not cues:
        raise ValueError("原文案为空，无法校对对齐")

    words = flatten_asr_words(sentences)
    if not words:
        raise ValueError("ASR 无可用时间戳，无法校对对齐")

    cue_norms = [normalize_for_align(c) for c in cues]
    # 全空归一化时按等长分配
    cue_weights = [max(1, len(n)) for n in cue_norms]
    total_weight = sum(cue_weights)

    word_norms = [normalize_for_align(w.text) for w in words]
    word_weights = [max(1, len(n)) if n else 1 for n in word_norms]
    total_asr_weight = sum(word_weights)

    # 每个 cue 应消耗的 ASR「字符权重」
    targets: list[int] = []
    allocated = 0
    for i, weight in enumerate(cue_weights):
        if i == len(cue_weights) - 1:
            targets.append(total_asr_weight - allocated)
        else:
            piece = max(1, round(total_asr_weight * weight / total_weight))
            # 预留后续 cue 至少各 1
            remaining_cues = len(cue_weights) - i - 1
            max_allowed = total_asr_weight - allocated - remaining_cues
            piece = min(piece, max(1, max_allowed))
            targets.append(piece)
            allocated += piece

    result: list[dict[str, Any]] = []
    word_idx = 0
    n_words = len(words)

    for i, cue in enumerate(cues):
        start_idx = word_idx
        if i == len(cues) - 1:
            end_idx = n_words
        else:
            need = targets[i]
            consumed = 0
            end_idx = start_idx
            while end_idx < n_words and consumed < need:
                consumed += word_weights[end_idx]
                end_idx += 1
            # 至少吃掉一个词（若还有剩余）
            if end_idx == start_idx and end_idx < n_words:
                end_idx = start_idx + 1
            # 保证后续 cue 至少各留一词
            remaining_cues = len(cues) - i - 1
            max_end = n_words - remaining_cues
            end_idx = min(end_idx, max(start_idx + 1, max_end))

        if start_idx >= n_words:
            # 词已耗尽：沿用上一 cue 末尾时间，给极短时长
            prev_end = result[-1]["end_ms"] if result else words[-1].end_ms
            start_ms = int(prev_end)
            end_ms = start_ms + MIN_SENTENCE_DURATION_MS
        else:
            end_idx = max(end_idx, start_idx + 1)
            end_idx = min(end_idx, n_words)
            start_ms = int(words[start_idx].start_ms)
            end_ms = int(words[end_idx - 1].end_ms)
            if end_ms <= start_ms:
                end_ms = start_ms + MIN_SENTENCE_DURATION_MS

        result.append({
            "start_ms": start_ms,
            "end_ms": end_ms,
            "text": cue,
        })
        word_idx = end_idx

    # 保证时间轴单调不重叠
    for i in range(1, len(result)):
        if result[i]["start_ms"] < result[i - 1]["end_ms"]:
            result[i]["start_ms"] = result[i - 1]["end_ms"]
        if result[i]["end_ms"] <= result[i]["start_ms"]:
            result[i]["end_ms"] = result[i]["start_ms"] + MIN_SENTENCE_DURATION_MS

    logger.info(
        "字幕校对对齐完成: %d cue, %d ASR words, script_chars=%d",
        len(result),
        n_words,
        sum(len(n) for n in cue_norms),
    )
    return result


def script_aligned_sentences_to_subtitle(
    script: str,
    sentences: list[TimedSentence],
    output_dir: str,
    filename_prefix: str = "aligned",
    *,
    format: str = "ass",
    video_width: int = 1080,
    video_height: int = 1920,
    font_name: str = ASS_FONT_NAME,
    font_size: int = ASS_FONT_SIZE,
    bold: int = ASS_BOLD,
    primary_colour: str = ASS_PRIMARY_COLOUR,
    outline: int = ASS_OUTLINE,
    margin_v_ratio: float = ASS_MARGIN_V_RATIO,
    max_chars: int | None = None,
) -> str:
    """原文案 + ASR 时间戳 → 字幕文件。"""
    os.makedirs(output_dir, exist_ok=True)
    cues = align_script_to_asr(script, sentences)

    wrap_chars = (
        max_chars
        if max_chars is not None
        else max_chars_for_video_width(video_width, font_size)
    )
    ext = ".ass" if format == "ass" else ".srt"
    output_path = os.path.join(output_dir, f"{filename_prefix}{ext}")

    if format == "ass":
        return generate_ass(
            cues,
            output_path,
            video_width,
            video_height,
            font_name,
            font_size,
            bold=bold,
            primary_colour=primary_colour,
            outline=outline,
            margin_v_ratio=margin_v_ratio,
            max_chars=wrap_chars,
        )
    return generate_srt(cues, output_path, max_chars=wrap_chars)


def try_build_aligned_subtitle(
    script: str,
    sentences: list[TimedSentence],
    output_dir: str,
    filename_prefix: str = "aligned",
    **kwargs: Any,
) -> str | None:
    """
    尝试校对对齐生成字幕；失败返回 None，由调用方回退。

    script 为空或对齐异常时返回 None。
    """
    if not (script or "").strip():
        return None
    if not sentences:
        return None
    try:
        return script_aligned_sentences_to_subtitle(
            script,
            sentences,
            output_dir,
            filename_prefix=filename_prefix,
            **kwargs,
        )
    except Exception as exc:
        logger.warning("字幕校对对齐失败，将回退: %s", exc)
        return None
