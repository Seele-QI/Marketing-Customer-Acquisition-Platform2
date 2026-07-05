"""宣传视频 aicost Seedance 辅助函数单元测试。"""

from lib.promo_video_service import (
    map_promo_aspect_ratio,
    strip_data_url_b64,
)


def test_map_promo_aspect_ratio_adaptive():
    assert map_promo_aspect_ratio("adaptive") == "auto"
    assert map_promo_aspect_ratio("auto") == "auto"


def test_map_promo_aspect_ratio_explicit():
    assert map_promo_aspect_ratio("16:9") == "16:9"
    assert map_promo_aspect_ratio("9:16") == "9:16"
    assert map_promo_aspect_ratio("1:1") == "1:1"


def test_strip_data_url_b64():
    assert strip_data_url_b64("abc123") == "abc123"
    assert strip_data_url_b64("data:audio/mpeg;base64,QQ==") == "QQ=="
