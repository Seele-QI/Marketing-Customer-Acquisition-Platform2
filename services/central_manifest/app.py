"""
轻量中央版本 Manifest 服务（FastAPI 精简镜像缺少 /api/central/manifest 时的旁路部署）。

用法（Zeabur 新建服务 / 本地）：
  pip install fastapi uvicorn
  uvicorn services.central_manifest.app:app --host 0.0.0.0 --port 8080

环境变量与主仓 main.py 对齐：
  CENTRAL_LATEST_VERSION / CENTRAL_FORCE_UPDATE_BELOW /
  CENTRAL_UPDATE_URL / CENTRAL_RELEASE_NOTES
"""

from __future__ import annotations

import os

from fastapi import FastAPI

app = FastAPI(title="central-manifest", docs_url=None, redoc_url=None)


def _ver_tuple(v: str) -> tuple:
    try:
        return tuple(int(x) for x in v.split("."))
    except Exception:
        return (0,)


@app.get("/health")
def health():
    return {"status": "ok", "service": "central-manifest"}


@app.get("/api/central/manifest")
def central_manifest(client_version: str = "0.0.0"):
    latest = (os.getenv("CENTRAL_LATEST_VERSION") or "0.1.0").strip()
    min_ver = (os.getenv("CENTRAL_FORCE_UPDATE_BELOW") or "0.0.1").strip()
    update_url = (os.getenv("CENTRAL_UPDATE_URL") or "").strip()
    notes = (os.getenv("CENTRAL_RELEASE_NOTES") or "").strip()
    force = _ver_tuple(client_version) < _ver_tuple(min_ver)
    return {
        "latest_version": latest,
        "min_supported_version": min_ver,
        "update_url": update_url,
        "force_update": force,
        "release_notes": notes,
    }
