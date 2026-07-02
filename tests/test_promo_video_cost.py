from lib.promo_video_service import calculate_promo_video_cost


def test_calculate_promo_video_cost_480p():
    assert calculate_promo_video_cost(15, "480p") == 798
    assert calculate_promo_video_cost(30, "480p") == 798 * 2


def test_calculate_promo_video_cost_720p():
    assert calculate_promo_video_cost(45, "720p") == 1528 * 3


def test_calculate_promo_video_cost_1080p():
    assert calculate_promo_video_cost(60, "1080p") == 2289 * 4


def test_calculate_promo_video_cost_unknown_resolution_fallbacks_to_1080p():
    assert calculate_promo_video_cost(30, "2k") == 2289 * 2
    assert calculate_promo_video_cost(15, "") == 2289
    assert calculate_promo_video_cost(15, None) == 2289

