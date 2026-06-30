"""generate_ass 样式与宽度换行测试。"""

from lib.subtitle_asr import CLIP_SUBTITLE_STYLE
from lib.subtitle_generator import generate_ass, max_chars_for_video_width


def test_clip_subtitle_style_constants():
    assert CLIP_SUBTITLE_STYLE["font_size"] == 68
    assert CLIP_SUBTITLE_STYLE["primary_colour"] == "&H0000C8FF"
    assert CLIP_SUBTITLE_STYLE["bold"] == 1
    assert CLIP_SUBTITLE_STYLE["outline"] == 4


def test_generate_ass_clip_style(tmp_path):
    sentences = [{"start_ms": 0, "end_ms": 2000, "text": "这是一段测试字幕"}]
    ass_path = tmp_path / "test.ass"

    generate_ass(
        sentences,
        str(ass_path),
        video_width=1080,
        video_height=1440,
        font_name=CLIP_SUBTITLE_STYLE["font_name"],
        font_size=CLIP_SUBTITLE_STYLE["font_size"],
        bold=CLIP_SUBTITLE_STYLE["bold"],
        primary_colour=CLIP_SUBTITLE_STYLE["primary_colour"],
        outline=CLIP_SUBTITLE_STYLE["outline"],
        margin_v_ratio=CLIP_SUBTITLE_STYLE["margin_v_ratio"],
    )

    content = ass_path.read_text(encoding="utf-8-sig")
    assert ",68," in content
    assert "&H0000C8FF" in content
    assert ",1,0,0,0," in content  # Bold=1
    assert ",4,0,2,10,10," in content  # Outline=4
    assert "PlayResX: 1080" in content
    assert "PlayResY: 1440" in content


def test_generate_ass_backward_compatible_defaults(tmp_path):
    sentences = [{"start_ms": 0, "end_ms": 1000, "text": "默认样式"}]
    ass_path = tmp_path / "default.ass"

    generate_ass(sentences, str(ass_path))

    content = ass_path.read_text(encoding="utf-8-sig")
    assert ",43," in content
    assert "&H00FFFFFF" in content
    assert ",0,0,0,0," in content  # Bold=0


def test_generate_ass_width_based_wrap(tmp_path):
    long_text = "这是一段非常非常非常非常非常非常长的字幕需要按屏宽折行显示"
    sentences = [{"start_ms": 0, "end_ms": 5000, "text": long_text}]
    ass_path = tmp_path / "wrap.ass"
    max_chars = max_chars_for_video_width(1080, 68)

    generate_ass(
        sentences,
        str(ass_path),
        video_width=1080,
        video_height=1440,
        font_size=68,
        max_chars=max_chars,
    )

    content = ass_path.read_text(encoding="utf-8-sig")
    dialogue_lines = [line for line in content.splitlines() if line.startswith("Dialogue:")]
    assert len(dialogue_lines) == 1
    assert "\\N" in dialogue_lines[0]
