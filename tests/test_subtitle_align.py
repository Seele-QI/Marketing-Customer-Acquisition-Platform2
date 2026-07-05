"""ASR 字幕校对对齐与标点断句测试。"""

from __future__ import annotations

from pathlib import Path

from lib.subtitle_align import (
    align_script_to_asr,
    flatten_asr_words,
    normalize_for_align,
    script_aligned_sentences_to_subtitle,
    split_script_cues,
    try_build_aligned_subtitle,
)
from lib.subtitle_generator import _auto_wrap_subtitle, clean_subtitle_display
from lib.video_extract import TimedSentence, TimedWord


def _words(*pairs: tuple[str, int, int]) -> list[TimedWord]:
    return [TimedWord(text=t, start_ms=s, end_ms=e) for t, s, e in pairs]


def _sentence(text: str, start_ms: int, end_ms: int, words: list[TimedWord] | None = None) -> TimedSentence:
    return TimedSentence(text=text, start_ms=start_ms, end_ms=end_ms, words=words or [])


def test_normalize_for_align_strips_punctuation():
    assert normalize_for_align("公转私，三个字。") == "公转私三个字"
    assert normalize_for_align("Hello, 世界！") == "Hello世界"


def test_split_script_cues_page_breaks_keep_commas():
    cues = split_script_cues("公转私三个字，多少老板踩过坑。\n第二句！")
    assert cues == ["公转私三个字，多少老板踩过坑", "第二句"]


def test_align_uses_script_text_not_asr_typos():
    """ASR 错字时，cue 文本仍为原文案。"""
    script = "公转私三个字。多少老板踩过坑。"
    # ASR 把「私」听成「是」
    sentences = [
        _sentence(
            "公转是三个字",
            0,
            2000,
            _words(("公转是", 0, 800), ("三个字", 800, 2000)),
        ),
        _sentence(
            "多少老板踩过坑",
            2000,
            4000,
            _words(("多少", 2000, 2600), ("老板", 2600, 3200), ("踩过坑", 3200, 4000)),
        ),
    ]
    cues = align_script_to_asr(script, sentences)
    assert len(cues) == 2
    assert cues[0]["text"] == "公转私三个字"
    assert cues[1]["text"] == "多少老板踩过坑"
    assert "是" not in cues[0]["text"]
    assert cues[0]["start_ms"] == 0
    assert cues[0]["end_ms"] == 2000
    assert cues[1]["start_ms"] == 2000
    assert cues[1]["end_ms"] == 4000


def test_align_timeline_is_monotonic():
    script = "第一句。第二句。第三句。"
    words = _words(
        ("第一句", 0, 1000),
        ("第二句", 1000, 2000),
        ("第三句", 2000, 3000),
    )
    sentences = [_sentence("第一句第二句第三句", 0, 3000, words)]
    cues = align_script_to_asr(script, sentences)
    assert len(cues) == 3
    for i in range(1, len(cues)):
        assert cues[i]["start_ms"] >= cues[i - 1]["end_ms"]
        assert cues[i]["end_ms"] > cues[i]["start_ms"]


def test_auto_wrap_splits_on_comma_then_strips():
    """行内按 ，、 换行，展示不含标点。"""
    wrapped = _auto_wrap_subtitle(
        "这是一句测试文本，一句测试文本，两句测试文本，三句测试文本",
        max_chars=12,
    )
    assert "\n" in wrapped
    assert "，" not in wrapped
    for line in wrapped.split("\n"):
        assert len(line) <= 12


def test_clean_subtitle_display():
    assert clean_subtitle_display("你好，世界。") == "你好世界"


def test_script_aligned_ass_has_multiple_dialogues_and_line_breaks(tmp_path: Path):
    script = "公转私三个字，多少老板踩过坑。第二页内容。"
    sentences = [
        _sentence(
            "公转是三个字多少老板踩过坑",
            0,
            4000,
            _words(
                ("公转是", 0, 800),
                ("三个字", 800, 1600),
                ("多少", 1600, 2200),
                ("老板", 2200, 3000),
                ("踩过坑", 3000, 4000),
            ),
        ),
        _sentence(
            "第二页内容",
            4000,
            5000,
            _words(("第二页", 4000, 4500), ("内容", 4500, 5000)),
        ),
    ]
    path = script_aligned_sentences_to_subtitle(
        script,
        sentences,
        str(tmp_path),
        filename_prefix="demo",
        format="ass",
        video_width=1080,
        video_height=1920,
        max_chars=10,
    )
    content = Path(path).read_text(encoding="utf-8-sig")
    dialogues = [line for line in content.splitlines() if line.startswith("Dialogue:")]
    assert len(dialogues) == 2
    # 第一页含逗号折行 → ASS 用 \N
    assert "\\N" in dialogues[0] or "公转私" in dialogues[0]
    assert "公转私" in dialogues[0]
    assert "是" not in dialogues[0]
    assert "第二页内容" in dialogues[1].replace(" ", "")


def test_try_build_aligned_returns_none_when_script_empty(tmp_path: Path):
    sentences = [_sentence("你好", 0, 1000, _words(("你好", 0, 1000)))]
    assert try_build_aligned_subtitle("", sentences, str(tmp_path)) is None


def test_try_build_aligned_returns_none_when_no_sentences(tmp_path: Path):
    assert try_build_aligned_subtitle("你好。", [], str(tmp_path)) is None


def test_flatten_asr_words_falls_back_to_sentence_when_no_words():
    sentences = [_sentence("整句文本", 100, 900)]
    words = flatten_asr_words(sentences)
    assert len(words) == 1
    assert words[0].text == "整句文本"
    assert words[0].start_ms == 100
    assert words[0].end_ms == 900


def test_align_with_sentence_level_only_still_uses_script():
    script = "甲句。乙句。"
    sentences = [
        _sentence("甲句错字", 0, 1500),
        _sentence("乙句错字", 1500, 3000),
    ]
    cues = align_script_to_asr(script, sentences)
    assert [c["text"] for c in cues] == ["甲句", "乙句"]
    assert cues[0]["start_ms"] == 0
    assert cues[1]["end_ms"] == 3000
