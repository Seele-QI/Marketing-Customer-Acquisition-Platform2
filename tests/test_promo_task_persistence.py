from __future__ import annotations

import base64

from lib.promo_video_service import (
    persist_storyboard_task_to_disk,
    recover_storyboard_task_from_disk,
)


def test_inflight_storyboard_state_survives_restart_as_terminal_recoverable_error(tmp_path):
    task = {
        "task_id": "pv_restart_test",
        "status": "storyboard_processing",
        "stage": "pv_rh_poll",
        "progress": 30,
        "rh_task_id": "upstream-123",
        "frame_count": 9,
        "promo_script": "测试文案",
        "duration": 15,
        "ratio": "9:16",
        "audio_base64": base64.b64encode(b"audio").decode(),
    }

    persist_storyboard_task_to_disk(task, str(tmp_path))
    recovered = recover_storyboard_task_from_disk(task["task_id"], str(tmp_path))

    assert recovered is not None
    assert recovered["status"] == "storyboard_failed"
    assert recovered["rh_task_id"] == "upstream-123"
    assert "服务曾重启" in recovered["error"]
    assert (tmp_path / task["task_id"] / "task_state.json").is_file()
    assert (tmp_path / task["task_id"] / "reference_audio.bin").read_bytes() == b"audio"
