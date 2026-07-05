import os
import sys

from tests.conftest import setup_test_db

setup_test_db()
os.environ["EMAIL_HASH_SALT"] = "test-salt-do-not-use-in-prod"

from lib import auth  # noqa: E402
from lib.geo_matrix_store import (  # noqa: E402
    create_project,
    delete_project,
    get_project,
    list_projects,
    replace_matrix,
    update_project,
)


def _make_user(email="matrix@test.com"):
    h = auth.hash_email(email)
    return auth.get_or_create_user_by_hash(h, auth.mask_email(email))


def test_create_and_list_projects():
    uid = _make_user("mx1@test.com")
    p = create_project(user_id=uid, name="测试矩阵")
    assert p["name"] == "测试矩阵"
    assert p["userId"] == uid
    assert isinstance(p["platforms"], list)
    assert p["matrix"]["platforms"] == []

    items = list_projects(uid)
    assert any(x["id"] == p["id"] for x in items)


def test_update_project_config():
    uid = _make_user("mx2@test.com")
    p = create_project(user_id=uid, name="原名称")
    updated = update_project(
        p["id"],
        uid,
        name="新名称",
        platforms=["xiaohongshu", "zhihu"],
        model_skill_id="model-deepseek",
        viral_skill_ids=["viral-zhihu"],
    )
    assert updated["name"] == "新名称"
    assert updated["platforms"] == ["xiaohongshu", "zhihu"]
    assert updated["modelSkillId"] == "model-deepseek"
    assert updated["viralSkillIds"] == ["viral-zhihu"]


def test_replace_matrix():
    uid = _make_user("mx3@test.com")
    p = create_project(user_id=uid, name="矩阵")
    matrix = {
        "platforms": [
            {
                "platformId": "xiaohongshu",
                "cells": [
                    {
                        "date": "2026-07-07",
                        "week": 1,
                        "themeArc": "测试弧",
                        "title": "标题",
                        "contentDirection": "方向",
                        "format": "图文",
                        "geoIntent": "种草",
                        "platformNative": "要点",
                    }
                ],
            }
        ],
        "skillId": "content-matrix-planning",
    }
    out = replace_matrix(p["id"], uid, matrix, enterprise_snapshot="snap")
    assert len(out["matrix"]["platforms"]) == 1
    assert out["enterpriseSnapshot"] == "snap"
    fetched = get_project(p["id"], uid)
    assert fetched["matrix"]["platforms"][0]["cells"][0]["title"] == "标题"


def test_delete_project():
    uid = _make_user("mx4@test.com")
    p = create_project(user_id=uid, name="待删")
    delete_project(p["id"], uid)
    items = list_projects(uid)
    assert not any(x["id"] == p["id"] for x in items)


def test_update_provider_and_enterprise_snapshot():
    uid = _make_user("mx6@test.com")
    p = create_project(user_id=uid, name="provider测试")
    assert p.get("provider", "deepseek") == "deepseek"

    updated = update_project(
        p["id"],
        uid,
        provider="doubao",
        enterprise_snapshot="企业知识库快照内容",
    )
    assert updated["provider"] == "doubao"
    assert updated["enterpriseSnapshot"] == "企业知识库快照内容"

    cleared = update_project(
        p["id"],
        uid,
        clear_enterprise_snapshot=True,
    )
    assert cleared["enterpriseSnapshot"] is None
    assert cleared["provider"] == "doubao"


def test_user_isolation():
    uid1 = _make_user("mx5a@test.com")
    uid2 = _make_user("mx5b@test.com")
    p = create_project(user_id=uid1, name="用户1项目")
    import pytest
    from fastapi import HTTPException

    with pytest.raises(HTTPException) as exc:
        get_project(p["id"], uid2)
    assert exc.value.status_code == 404
