#!/usr/bin/env python3
"""验证数字人视频创作（新）— Seedance API + 多段拼接管线。

用法（项目根目录）:
  python tools/verify_dh_video_v2.py --smoke     # 仅测 API 连通（文生视频）
  python tools/verify_dh_video_v2.py --full      # 含参考图单段 + ffmpeg 拼接烟测
  python tools/verify_dh_video_v2.py --download-url <url> [--upstream-id ID]
"""

from __future__ import annotations

import argparse
import asyncio
import base64
import os
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from dotenv import load_dotenv

load_dotenv(ROOT / ".env", override=True)


def _tiny_png_data_url() -> str:
    # 1x1 PNG
    raw = base64.b64decode(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
    )
    b64 = base64.b64encode(raw).decode()
    return f"data:image/png;base64,{b64}"


async def smoke_api() -> None:
    from lib.dh_video_v2_service import poll_aicost_task, submit_aicost_seedance, download_video_file

    img = _tiny_png_data_url()
    prompt = (
        "专业数字人口播，竖屏 9:16，柔和面光，镜头 slow push-in，stable composition\n\n"
        "@图1 当前图片为视频固定首帧"
    )
    print("[1/3] 提交首帧参考图生视频任务…")
    res = await submit_aicost_seedance(
        prompt=prompt,
        images_base64=[img],
        aspect_ratio="9:16",
        client_task_id="verify_smoke",
    )
    tid = res.get("id") or res.get("task_id")
    print(f"      task_id={tid}")
    if not tid:
        raise SystemExit("FAIL: 未返回 task_id")

    print("[2/3] 轮询任务（最长 30 分钟）…")
    done = await poll_aicost_task(str(tid), max_wait=1800)
    url = done.get("result_url") or ""
    print(f"      status={done.get('status')} url={url[:80]}…")

    out = Path(tempfile.gettempdir()) / "dh_v2_smoke.mp4"
    print(f"[3/3] 下载到 {out} …")
    await download_video_file(
        url,
        str(out),
        upstream_id=str(tid),
        debug_context="verify_smoke",
    )
    size = out.stat().st_size
    print(f"      文件大小 {size} bytes")
    if size < 10_000:
        raise SystemExit(f"FAIL: 视频过小 ({size} bytes)")
    print("SMOKE OK")


async def download_url_only(url: str, upstream_id: str = "") -> None:
    """仅测试本机视频 URL 下载（排查 VPN/CDN/鉴权问题）。"""
    from lib.dh_video_v2_service import download_video_file

    out = Path(tempfile.gettempdir()) / "dh_v2_download_test.mp4"
    print(f"下载 URL: {url[:120]}…")
    if upstream_id:
        print(f"upstream_id: {upstream_id}")
    print(f"输出: {out}")
    try:
        await download_video_file(
            url,
            str(out),
            upstream_id=upstream_id,
            debug_context="verify_download_url",
        )
    except Exception as e:
        print(f"FAIL: {e}")
        raise SystemExit(1) from e
    size = out.stat().st_size
    print(f"OK: {size} bytes -> {out}")


async def full_pipeline_smoke() -> None:
    from lib.dh_video_v2_local_plan import build_local_segment_prompt
    from lib.dh_video_v2_service import run_multi_segment_pipeline
    from lib.video_concat import concatenate_videos_ffmpeg

    img = _tiny_png_data_url()
    segs = []
    script_parts = ["大家好，这是第一段测试口播。", "这是第二段，用于验证拼接。"]
    for i, dlg in enumerate(script_parts):
        shot, prompt = build_local_segment_prompt(
            dialogue=dlg,
            creative_idea="专业数字人口播",
            seg_index=i,
            total_segs=2,
            has_audio_ref=False,
        )
        segs.append(
            {
                "index": i,
                "dialogue": dlg,
                "shot_details": shot,
                "video_prompt": prompt,
            }
        )

    out_dir = Path(tempfile.gettempdir()) / "dh_v2_full_test"
    out_dir.mkdir(parents=True, exist_ok=True)
    print("[full] 2 段顺序提交 Seedance（约 2×15s，请耐心等待）…")
    final = await run_multi_segment_pipeline(
        segments=segs,
        images_base64=[img],
        audios_base64=None,
        aspect_ratio="9:16",
        output_dir=str(out_dir),
        client_task_id="verify_full",
        on_progress=lambda d, t, i: print(f"      段进度 {d}/{t} (末段 #{i + 1})"),
    )
    size = Path(final).stat().st_size
    print(f"[full] final.mp4 = {final} ({size} bytes)")
    if size < 10_000:
        raise SystemExit("FAIL: 拼接产物过小")
    print("FULL PIPELINE OK")


def concat_only_smoke() -> None:
    """不调用 API，仅验证 ffmpeg 拼接可用。"""
    from lib.dh_video_v2_service import _ffmpeg_exe
    from lib.video_concat import concatenate_videos_ffmpeg

    smoke = Path(tempfile.gettempdir()) / "dh_v2_smoke.mp4"
    if not smoke.is_file() or smoke.stat().st_size < 1000:
        print("SKIP concat-only: 先运行 --smoke 生成 dh_v2_smoke.mp4")
        return
    out_dir = Path(tempfile.gettempdir()) / "dh_v2_concat_test"
    out_dir.mkdir(parents=True, exist_ok=True)
    final = out_dir / "concat_final.mp4"
    concatenate_videos_ffmpeg([str(smoke), str(smoke)], str(final), ffmpeg_path=_ffmpeg_exe())
    print(f"CONCAT OK: {final} ({final.stat().st_size} bytes)")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--smoke", action="store_true", help="文生视频 API 烟测")
    parser.add_argument("--full", action="store_true", help="双段参考图 + 拼接全链路")
    parser.add_argument("--concat", action="store_true", help="仅 ffmpeg 拼接烟测")
    parser.add_argument("--download-url", metavar="URL", help="仅测试下载指定视频 URL")
    parser.add_argument("--upstream-id", default="", help="配合 --download-url 的 Seedance task id")
    args = parser.parse_args()

    if args.download_url:
        asyncio.run(download_url_only(args.download_url.strip(), args.upstream_id.strip()))
        return

    if not (args.smoke or args.full or args.concat):
        args.smoke = True

    key = os.getenv("SEEDANCE_API_KEY") or os.getenv("AICOST_API_KEY")
    if not key and not args.concat:
        raise SystemExit("SEEDANCE_API_KEY 未配置")

    if args.concat:
        concat_only_smoke()
        return
    if args.smoke:
        asyncio.run(smoke_api())
    if args.full:
        asyncio.run(full_pipeline_smoke())


if __name__ == "__main__":
    main()
