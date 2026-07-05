# -*- coding: utf-8 -*-
"""dh-v2 script plan tests"""

from lib.dh_video_v2_script_plan import _extract_json_block, DH_V2_SCRIPT_PLAN_SYSTEM


def test_extract_json_block_plain():
    data = _extract_json_block('{"segments": [{"shot_details": "a", "video_prompt": "b"}]}')
    assert len(data["segments"]) == 1


def test_extract_json_block_markdown():
    raw = '```json\n{"segments": []}\n```'
    data = _extract_json_block(raw)
    assert "segments" in data


def test_system_prompt_mentions_dialogue():
    assert "dialogue" in DH_V2_SCRIPT_PLAN_SYSTEM
