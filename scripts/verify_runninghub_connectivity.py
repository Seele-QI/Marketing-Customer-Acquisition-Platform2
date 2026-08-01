#!/usr/bin/env python3
"""Non-billed RunningHub connectivity check for local desktop configuration."""

from __future__ import annotations

import asyncio
import base64
import json
import tempfile
import uuid
from pathlib import Path
from urllib.parse import urlsplit

import httpx

from lib.runninghub_client import RunningHubClient, RunningHubError
from lib.runninghub_network import runninghub_async_transport


ROOT = Path(__file__).resolve().parent.parent
DOTENV = ROOT / ".env"
PNG_1X1 = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nWQAAAAASUVORK5CYII="
)


def read_dotenv(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    for raw in path.read_text(encoding="utf-8-sig").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip().strip('"').strip("'")
    return values


async def query_probe(label: str, query) -> dict[str, object]:
    try:
        payload = await query(f"connectivity-probe-{uuid.uuid4().hex}")
        return {
            "ok": True,
            "label": label,
            "transport": "HTTP success",
            "status": str(payload.get("status") or "UNKNOWN"),
        }
    except RunningHubError as exc:
        # A business-level "task not found" still proves DNS/TLS/API routing.
        authenticated = exc.status_code not in {401, 403}
        return {
            "ok": authenticated,
            "label": label,
            "transport": f"HTTP {exc.status_code or 'business-error'}",
            "status": "TASK_NOT_FOUND_EXPECTED" if authenticated else "AUTH_FAILED",
        }


async def upload_probe(label: str, upload, image_path: str) -> dict[str, object]:
    try:
        url = await upload(image_path)
    except RunningHubError as exc:
        return {
            "ok": False,
            "label": label,
            "stage": "upload",
            "transport": f"HTTP {exc.status_code or 'business-error'}",
            "status": "FAILED",
        }

    host = urlsplit(url).hostname or "unknown"
    try:
        async with httpx.AsyncClient(
            timeout=30,
            trust_env=False,
            follow_redirects=True,
            transport=runninghub_async_transport(),
        ) as client:
            response = await client.get(url)
        return {
            "ok": response.is_success and len(response.content) > 0,
            "label": label,
            "stage": "download",
            "download_host": host,
            "transport": f"HTTP {response.status_code}",
            "download_bytes": len(response.content),
        }
    except httpx.HTTPError as exc:
        return {
            "ok": False,
            "label": label,
            "stage": "download",
            "download_host": host,
            "transport": type(exc).__name__,
            "status": "FAILED",
        }


async def main() -> int:
    env = read_dotenv(DOTENV)
    required = ("RUNNINGHUB_API_KEY", "RUNNINGHUB_IMAGE_API_KEY", "RUNNINGHUB_IMAGE_BASE_URL")
    missing = [key for key in required if not env.get(key)]
    if missing:
        print(json.dumps({"ok": False, "missing": missing}, ensure_ascii=False))
        return 2

    client = RunningHubClient(
        env["RUNNINGHUB_API_KEY"],
        image_api_key=env["RUNNINGHUB_IMAGE_API_KEY"],
        image_base_url=env["RUNNINGHUB_IMAGE_BASE_URL"],
    )
    try:
        with tempfile.TemporaryDirectory(prefix="runninghub-probe-") as tmp:
            image_path = Path(tmp) / "probe.png"
            image_path.write_bytes(PNG_1X1)
            results = [
                await query_probe("domestic-query", client.query_task),
                await upload_probe("domestic-upload-download", client.upload_file, str(image_path)),
                await query_probe("overseas-image-query", client.query_image_task),
                await upload_probe(
                    "overseas-image-upload-download",
                    client.upload_image_file,
                    str(image_path),
                ),
            ]
    finally:
        await client.close()

    ok = all(bool(item["ok"]) for item in results)
    print(json.dumps({"ok": ok, "checks": results}, ensure_ascii=False, indent=2))
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
