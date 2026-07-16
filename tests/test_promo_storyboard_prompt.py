from lib.promo_video_service import (
    PROMO_STORYBOARD_NO_LABEL_SUFFIX,
    augment_storyboard_creative_prompt,
)


def test_augment_appends_suffix_to_normal_prompt():
    result = augment_storyboard_creative_prompt("科技感产品特写，柔和光影")
    assert result.endswith(PROMO_STORYBOARD_NO_LABEL_SUFFIX)
    assert result.startswith("科技感产品特写，柔和光影")


def test_augment_idempotent_when_suffix_already_present():
    original = f"产品场景描述。{PROMO_STORYBOARD_NO_LABEL_SUFFIX}"
    assert augment_storyboard_creative_prompt(original) == original


def test_augment_empty_returns_suffix_only():
    assert augment_storyboard_creative_prompt("") == PROMO_STORYBOARD_NO_LABEL_SUFFIX
    assert augment_storyboard_creative_prompt("   ") == PROMO_STORYBOARD_NO_LABEL_SUFFIX
