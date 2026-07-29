"""Persistent previews and sequential multi-platform distribution jobs."""
from __future__ import annotations

import asyncio
from contextlib import contextmanager
import json
import os
import re
import sqlite3
import time
import uuid
from pathlib import Path
from typing import Any, Dict, List
from lib.publisher.submit_mode import normalize_submit_mode, submit_mode_scope

VIDEO_PLATFORMS = ("douyin", "xiaohongshu", "kuaishou", "shipinhao")
ARTICLE_PLATFORMS = ("zhihu", "weibo", "sohu", "xiaohongshu", "dianping", "ctrip", "toutiao", "baijiahao")
VIDEO_TITLE_LIMITS = {"douyin": 30, "xiaohongshu": 20, "kuaishou": 50, "shipinhao": 30}
ARTICLE_TITLE_LIMITS = {"zhihu": 100, "weibo": 40, "sohu": 50, "xiaohongshu": 20, "dianping": 30, "ctrip": 40, "toutiao": 30, "baijiahao": 30}

def _plain_markdown(value: str) -> str:
    value = re.sub(r"!\[[^]]*\]\([^)]*\)", "", value or "")
    value = re.sub(r"\[([^]]+)\]\([^)]*\)", r"\1", value)
    return re.sub(r"^#{1,6}\s*", "", value, flags=re.M).strip()

def build_adaptations(content_type: str, source: Dict[str, Any], platforms: List[str]) -> List[Dict[str, Any]]:
    allowed = VIDEO_PLATFORMS if content_type == "video" else ARTICLE_PLATFORMS
    targets = [platform for platform in platforms if platform in allowed]
    if not targets:
        raise ValueError("至少选择一个受支持的平台")
    title = str(source.get("title") or "").strip()
    body = str(source.get("markdown") or source.get("description") or "").strip()
    tags = [str(tag).strip().lstrip("#") for tag in source.get("tags", []) if str(tag).strip()]
    if not title or not body:
        raise ValueError("标题和内容不能为空")
    output = []
    for platform in targets:
        limits = VIDEO_TITLE_LIMITS if content_type == "video" else ARTICLE_TITLE_LIMITS
        item = {"platform": platform, "title": title[:limits[platform]], "body": _plain_markdown(body) if content_type == "geo_article" and platform in {"weibo", "xiaohongshu"} else body, "tags": tags[:10], "media": source.get("media", [])}
        if platform in {"dianping", "ctrip"}:
            item.update({"poiName": str(source.get("poiName") or "").strip(), "cityOrDestination": str(source.get("cityOrDestination") or "").strip(), "poiReference": str(source.get("poiReference") or "").strip(), "contentDisclosure": "官方攻略/笔记"})
        output.append(item)
    return output

class DistributionJobStore:
    def __init__(self, db_path: str | None = None):
        root = Path(__file__).resolve().parent.parent
        self.db_path = db_path or os.getenv("CREDIT_DB_OVERRIDE") or str(root / "data" / "accounts.db")
        Path(self.db_path).parent.mkdir(parents=True, exist_ok=True)
        self._init()

    @contextmanager
    def _connect(self):
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        try:
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    def _init(self):
        with self._connect() as conn:
            conn.executescript("""
            CREATE TABLE IF NOT EXISTS distribution_previews (token TEXT PRIMARY KEY,user_id INTEGER NOT NULL,content_type TEXT NOT NULL,source_json TEXT NOT NULL,adaptations_json TEXT NOT NULL,created_at REAL NOT NULL);
            CREATE TABLE IF NOT EXISTS distribution_jobs (id TEXT PRIMARY KEY,user_id INTEGER NOT NULL,preview_token TEXT NOT NULL,idempotency_key TEXT NOT NULL,content_type TEXT NOT NULL,status TEXT NOT NULL,created_at REAL NOT NULL,updated_at REAL NOT NULL,UNIQUE(user_id,idempotency_key));
            CREATE TABLE IF NOT EXISTS distribution_job_items (id TEXT PRIMARY KEY,job_id TEXT NOT NULL,platform TEXT NOT NULL,position INTEGER NOT NULL,status TEXT NOT NULL,adaptation_json TEXT NOT NULL,result_json TEXT,error TEXT,attempts INTEGER NOT NULL DEFAULT 0,updated_at REAL NOT NULL,UNIQUE(job_id,platform));
            """)
            job_columns = {row["name"] for row in conn.execute("PRAGMA table_info(distribution_jobs)")}
            if "submit_mode" not in job_columns:
                conn.execute("ALTER TABLE distribution_jobs ADD COLUMN submit_mode TEXT NOT NULL DEFAULT 'manual_confirm'")
            conn.execute("UPDATE distribution_job_items SET status='failed',error='应用重启，任务可重试' WHERE status IN ('running','waiting_user')")
            conn.execute("UPDATE distribution_jobs SET status='failed',updated_at=? WHERE status='running'", (time.time(),))

    def create_preview(self, user_id: int, content_type: str, source: Dict[str, Any], platforms: List[str]):
        if content_type not in {"video", "geo_article"}:
            raise ValueError("contentType 必须为 video 或 geo_article")
        adaptations = build_adaptations(content_type, source, platforms)
        token = uuid.uuid4().hex
        with self._connect() as conn:
            conn.execute("INSERT INTO distribution_previews VALUES (?,?,?,?,?,?)", (token,user_id,content_type,json.dumps(source,ensure_ascii=False),json.dumps(adaptations,ensure_ascii=False),time.time()))
        return {"previewToken": token, "contentType": content_type, "adaptations": adaptations}

    def create_job(self, user_id: int, preview_token: str, idempotency_key: str, confirmed: bool, submit_mode: str = "manual_confirm"):
        if not confirmed:
            raise ValueError("发布前必须完成一次确认")
        submit_mode = normalize_submit_mode(submit_mode)
        with self._connect() as conn:
            existing = conn.execute("SELECT id FROM distribution_jobs WHERE user_id=? AND idempotency_key=?",(user_id,idempotency_key)).fetchone()
            if existing:
                return self.get_job(user_id, existing["id"])
            preview = conn.execute("SELECT * FROM distribution_previews WHERE token=? AND user_id=?",(preview_token,user_id)).fetchone()
            if not preview:
                raise ValueError("预览不存在或已失效")
            job_id, now = uuid.uuid4().hex, time.time()
            conn.execute("INSERT INTO distribution_jobs (id,user_id,preview_token,idempotency_key,content_type,status,created_at,updated_at,submit_mode) VALUES (?,?,?,?,?,?,?,?,?)",(job_id,user_id,preview_token,idempotency_key,preview["content_type"],"queued",now,now,submit_mode))
            for position, adaptation in enumerate(json.loads(preview["adaptations_json"])):
                conn.execute("INSERT INTO distribution_job_items VALUES (?,?,?,?,?,?,?,?,?,?)",(uuid.uuid4().hex,job_id,adaptation["platform"],position,"queued",json.dumps(adaptation,ensure_ascii=False),None,None,0,now))
        return self.get_job(user_id, job_id)

    def get_job(self, user_id: int, job_id: str):
        with self._connect() as conn:
            job = conn.execute("SELECT * FROM distribution_jobs WHERE id=? AND user_id=?",(job_id,user_id)).fetchone()
            if not job:
                raise ValueError("任务不存在")
            rows = conn.execute("SELECT platform,status,result_json,error,attempts,updated_at FROM distribution_job_items WHERE job_id=? ORDER BY position",(job_id,)).fetchall()
        return {"jobId":job["id"],"contentType":job["content_type"],"submitMode":job["submit_mode"],"status":job["status"],"createdAt":job["created_at"],"items":[{"platform":r["platform"],"status":r["status"],"result":json.loads(r["result_json"]) if r["result_json"] else None,"error":r["error"],"attempts":r["attempts"],"updatedAt":r["updated_at"]} for r in rows]}

    def source_for_job(self, job_id: str):
        with self._connect() as conn:
            row = conn.execute("SELECT p.source_json FROM distribution_jobs j JOIN distribution_previews p ON p.token=j.preview_token WHERE j.id=?",(job_id,)).fetchone()
        return json.loads(row[0]) if row else {}

    def queued_items(self, job_id: str):
        with self._connect() as conn:
            return [dict(row) for row in conn.execute("SELECT * FROM distribution_job_items WHERE job_id=? AND status='queued' ORDER BY position",(job_id,)).fetchall()]

    def set_job_status(self, job_id: str, status: str):
        with self._connect() as conn:
            conn.execute("UPDATE distribution_jobs SET status=?,updated_at=? WHERE id=?",(status,time.time(),job_id))

    def set_item(self, item_id: str, status: str, *, result=None, error=None):
        with self._connect() as conn:
            conn.execute("UPDATE distribution_job_items SET status=?,result_json=?,error=?,attempts=attempts+CASE WHEN ?='running' THEN 1 ELSE 0 END,updated_at=? WHERE id=?",(status,json.dumps(result,ensure_ascii=False) if result is not None else None,error,status,time.time(),item_id))

    def reset_item(self, user_id: int, job_id: str, platform: str):
        self.get_job(user_id, job_id)
        with self._connect() as conn:
            row = conn.execute("SELECT status FROM distribution_job_items WHERE job_id=? AND platform=?",(job_id,platform)).fetchone()
            if not row or row["status"] == "success":
                raise ValueError("该平台不存在或已经发布成功")
            conn.execute("UPDATE distribution_job_items SET status='queued',error=NULL,result_json=NULL,updated_at=? WHERE job_id=? AND platform=?",(time.time(),job_id,platform))
        self.set_job_status(job_id,"queued")

    def cancel(self, user_id: int, job_id: str):
        self.get_job(user_id, job_id)
        with self._connect() as conn:
            conn.execute("UPDATE distribution_job_items SET status='cancelled',updated_at=? WHERE job_id=? AND status='queued'",(time.time(),job_id))
        self.set_job_status(job_id,"cancelled")
        return self.get_job(user_id,job_id)

store = DistributionJobStore()
_running: set[str] = set()

async def run_job(user_id: int, job_id: str):
    if job_id in _running:
        return
    _running.add(job_id)
    try:
        store.set_job_status(job_id,"running")
        job, source = store.get_job(user_id,job_id), store.source_for_job(job_id)
        for item in store.queued_items(job_id):
            if store.get_job(user_id, job_id)["status"] == "cancelled":
                break
            store.set_item(item["id"],"running")
            try:
                adaptation = json.loads(item["adaptation_json"])
                if job["contentType"] == "video":
                    from lib.publisher.manager import publish_to_platform
                    with submit_mode_scope(job["submitMode"]):
                        result = await publish_to_platform(user_id=user_id,platform=item["platform"],video_url=str(source.get("videoUrl") or ""),title=adaptation["title"],description="\n\n".join(filter(None,[adaptation["body"]," ".join(f"#{tag}" for tag in adaptation["tags"])])))
                else:
                    from lib.publisher.article import publish_geo_article
                    result = await publish_geo_article(platform=item["platform"],user_id=user_id,adaptation=adaptation,project_root=str(Path(__file__).resolve().parent.parent),submit_mode=job["submitMode"])
                data, state = result.to_dict(), (result.metadata or {}).get("state")
                status = "success" if result.success else ("waiting_user" if state == "waiting_user" else "failed")
                store.set_item(item["id"],status,result=data,error=result.error)
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                store.set_item(item["id"], "failed", error=f"发布执行异常：{exc}")

        latest = store.get_job(user_id,job_id)
        if latest["status"] != "cancelled":
            statuses = {item["status"] for item in latest["items"]}
            final_status = (
                "success"
                if statuses == {"success"}
                else ("waiting_user" if "waiting_user" in statuses else "failed")
            )
            store.set_job_status(job_id, final_status)
    except asyncio.CancelledError:
        # Process shutdown may cancel the coroutine. The store initialization
        # converts any leftover running state to a retryable failure on restart.
        raise
    except Exception:
        # Never leave a persisted job in an endless running state when setup,
        # database access, or an unexpected orchestration step fails.
        try:
            store.set_job_status(job_id, "failed")
        except Exception:
            pass
    finally:
        _running.discard(job_id)

def schedule_job(user_id: int, job_id: str):
    asyncio.create_task(run_job(user_id,job_id))
