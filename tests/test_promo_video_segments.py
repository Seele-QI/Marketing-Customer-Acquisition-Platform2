"""Unit tests for promo video segment planning."""

from lib.promo_video_service import (
    build_seedance_segment_prompt,
    plan_promo_video_segments,
)


def test_plan_15s_single_segment():
    paths = [f"/frames/frame_{i:02d}.png" for i in range(1, 4)]
    plans = plan_promo_video_segments(
        selected_paths=paths,
        total_duration=15,
        video_prompt="Image1 开场，Image2 特写，Image3 收尾",
        promo_script="新鲜玉米从田间到餐桌",
    )
    assert len(plans) == 1
    assert len(plans[0].frame_paths) == 3
    assert plans[0].duration_sec == 15
    assert "@图1" in plans[0].prompt
    assert "固定首帧" in plans[0].prompt


def test_plan_30s_two_segments():
    paths = [f"/frames/frame_{i:02d}.png" for i in range(1, 7)]
    plans = plan_promo_video_segments(
        selected_paths=paths,
        total_duration=30,
        video_prompt="@Image 1 开场 @Image 2 转场",
        promo_script="",
    )
    assert len(plans) == 2
    assert len(plans[0].frame_paths) + len(plans[1].frame_paths) == 6
    assert plans[0].frame_paths[0] == paths[0]
    assert "第 1/2 段" in plans[0].prompt
    assert "第 2/2 段" in plans[1].prompt
    assert "@图1" in plans[0].prompt


def test_plan_60s_four_segments_nine_images():
    paths = [f"/frames/frame_{i:02d}.png" for i in range(1, 10)]
    plans = plan_promo_video_segments(
        selected_paths=paths,
        total_duration=60,
        video_prompt="Image1 to Image9 narrative",
        promo_script="",
    )
    assert len(plans) == 4
    total_frames = sum(len(p.frame_paths) for p in plans)
    assert total_frames == 9
    for p in plans:
        assert len(p.frame_paths) <= 9


def test_build_seedance_segment_prompt_renumbers_to_tu_refs():
    out = build_seedance_segment_prompt(
        "@Image 3 结尾，@Image 1 开场",
        image_count=2,
        seg_idx=0,
        total_segs=1,
    )
    assert "@图1" in out
    assert "@图2" in out
    assert "固定首帧" in out
    assert "@Image" not in out


def test_build_seedance_segment_prompt_with_audio():
    out = build_seedance_segment_prompt(
        "产品特写运镜",
        image_count=1,
        seg_idx=0,
        total_segs=1,
        has_audio=True,
    )
    assert "@图1" in out
    assert "@音频1" in out
