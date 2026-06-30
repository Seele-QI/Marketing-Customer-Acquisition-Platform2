"""宽度换行与 max_chars_for_video_width 边界测试。"""

from lib.subtitle_generator import max_chars_for_video_width


def test_max_chars_for_video_width_1080_68():
    assert max_chars_for_video_width(1080, 68) == 15


def test_max_chars_for_video_width_custom_margins():
    assert max_chars_for_video_width(1080, 68, margin_l=20, margin_r=20) == 15


def test_max_chars_for_video_width_narrow():
    assert max_chars_for_video_width(200, 68) == 2


def test_max_chars_for_video_width_zero_font_fallback():
    assert max_chars_for_video_width(1080, 0) == 22


def test_max_chars_for_video_width_minimum_one():
    assert max_chars_for_video_width(10, 100) == 1
