from lib.credit_pricing import calculate_promo_video_cost
from lib.promo_video_service import calculate_promo_video_cost as service_cost


def test_calculate_promo_video_cost_15s():
    assert calculate_promo_video_cost(15) == 450
    assert service_cost(15) == 450


def test_calculate_promo_video_cost_30s():
    assert calculate_promo_video_cost(30) == 900
    assert service_cost(30, "720p") == 900


def test_calculate_promo_video_cost_45s():
    assert calculate_promo_video_cost(45) == 1350
    assert service_cost(45, "1080p") == 1350


def test_resolution_no_longer_affects_cost():
    assert service_cost(15, "480p") == 450
    assert service_cost(15, "1080p") == 450
    assert service_cost(15, "") == 450
