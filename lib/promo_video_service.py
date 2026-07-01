import asyncio
import io
import json
import logging
import os
import subprocess
import time

import httpx
from PIL import Image

logger = logging.getLogger("promo_video")

DEEPSEEK_API_URL = "https://api.deepseek.com/chat/completions"
DEEPSEEK_MODEL = os.getenv("DEEPSEEK_CHAT_MODEL") or "deepseek-chat"


async def call_deepseek(api_key, system_prompt, user_prompt, temperature=0.7, max_tokens=2048):
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }
    payload = {
        "model": DEEPSEEK_MODEL,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "temperature": temperature,
        "max_tokens": max_tokens,
    }
    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(DEEPSEEK_API_URL, headers=headers, json=payload)
        resp.raise_for_status()
        data = resp.json()
    return data["choices"][0]["message"]["content"].strip()


STORYBOARD_SYSTEM_PROMPT = "你是一位资深广告创意总监和AI绘画提示词专家。请根据用户提供的产品信息，生成一段用于AI绘画模型创作产品广告分镜图的创意提示词。\n\n要求：\n1. 提示词必须用中文描述，结合产品特点\n2. 需要包含画面构图、光影、氛围、风格描述\n3. 提示词需要体现产品卖点\n4. 保持画面美观且有广告质感\n5. 不要超过300字\n6. 直接输出提示词，不要有其他解释性文字"


async def generate_storyboard_prompt(deepseek_api_key, product_name, selling_points, target_audience, style, image_description=""):
    user_prompt = (
        f"产品名称：{product_name}\n"
        f"核心卖点：{'、'.join(selling_points)}\n"
        f"目标受众：{target_audience}\n"
        f"视频风格：{style}\n"
        f"补充说明：{image_description}\n"
        f"请生成一段用于AI绘画的产品广告分镜图创意提示词。"
    )
    return await call_deepseek(deepseek_api_key, STORYBOARD_SYSTEM_PROMPT, user_prompt)


VIDEO_PROMPT_SYSTEM_PROMPT = "你是一位视频导演和AI视频生成提示词专家。请根据用户的产品信息以及选中的分镜图数量，生成一段用于Seedance/SparkVideo 2.0 AI视频生成模型的提示词。\n\n要求：\n1. 使用 @Image 1, @Image 2 等引用对应的参考图片，构建完整视频叙事\n2. 描述画面的运镜、转场、节奏\n3. 结合产品卖点，让视频有叙事性\n4. 注意节奏匹配\n5. 不要超过500字\n6. 直接输出提示词"


async def generate_video_prompt(deepseek_api_key, promo_script, style, frame_count, duration):
    image_refs = ", ".join([f"@Image {i+1}" for i in range(frame_count)])
    user_prompt = (
        f"宣传文案：{promo_script}\n"
        f"视频风格：{style or '科技感'}\n"
        f"视频时长：{duration}秒\n"
        f"参考图片数量：{frame_count}张（分别是 {image_refs}）\n"
        f"请生成一段可用于AI视频生成的提示词，用 @Image 1~N 引用对应图片。"
    )
    return await call_deepseek(deepseek_api_key, VIDEO_PROMPT_SYSTEM_PROMPT, user_prompt)


RH_BASE_URL = "https://www.runninghub.cn/openapi/v2"
STORYBOARD_AI_APP_ID = "2004879210508419073"
CROP_AI_APP_ID = "2037785424789245953"
SPARKVIDEO_ENDPOINT = "/rhart-video/sparkvideo-2.0/multimodal-video"

# RH API 文档 node 5 fieldData（完整 JSON 字符串，勿简化为 fieldValue）
RH_CHANNEL_FIELD_DATA = (
    '[{"name":"Third-party","index":"Third-party","description":"第三方",'
    '"fastIndex":1.0,"descriptionEn":"Third party"},'
    '{"name":"Official","index":"Official","description":"官方",'
    '"fastIndex":2.0,"descriptionEn":"Official"}]'
)
RH_RESOLUTION_FIELD_DATA = '[["1k", "2k", "4k", "8k (Official only)"], {"default": "2k"}]'

RH_HTTP_TIMEOUT = httpx.Timeout(connect=30.0, read=120.0, write=120.0, pool=30.0)
RH_QUERY_MAX_RETRIES = 5
RH_TRANSIENT_RETRIES = 3


def _is_transient_http_error(exc: BaseException) -> bool:
    if isinstance(exc, (httpx.RemoteProtocolError, httpx.ReadError, httpx.ConnectError, httpx.WriteError)):
        return True
    msg = str(exc).lower()
    return any(
        k in msg
        for k in (
            "server disconnected",
            "connection reset",
            "connection aborted",
            "timed out",
            "timeout",
            "eof",
        )
    )


def _format_rh_task_failure(result: dict) -> str:
    """从 RH query 响应提取可读失败原因（含 failedReason.exception_message）。"""
    parts: list[str] = []
    code = (result.get("errorCode") or "").strip()
    msg = (result.get("errorMessage") or "").strip()
    if code:
        parts.append(code)
    if msg:
        parts.append(msg)
    failed = result.get("failedReason")
    if isinstance(failed, dict):
        node = (failed.get("node_name") or failed.get("node_id") or "").strip()
        detail = (failed.get("exception_message") or "").strip()
        if node:
            parts.append(f"节点 {node}")
        if detail:
            parts.append(detail)
    return "：".join(parts) if parts else "工作流运行失败"


async def _rh_post_json(api_key: str, url: str, payload: dict, *, retries: int = RH_TRANSIENT_RETRIES) -> dict:
    headers = {"Content-Type": "application/json", "Authorization": f"Bearer {api_key}"}
    last_err: BaseException | None = None
    for attempt in range(retries):
        try:
            async with httpx.AsyncClient(timeout=RH_HTTP_TIMEOUT) as client:
                resp = await client.post(url, headers=headers, json=payload)
                if not resp.is_success:
                    raise RuntimeError(
                        f"RH API HTTP {resp.status_code}: {resp.text[:500]}"
                    )
                data = resp.json()
                code = data.get("code")
                if code is not None and code != 0:
                    msg = (data.get("msg") or data.get("message") or "").strip()
                    raise RuntimeError(
                        f"RH API 业务错误 code={code}"
                        + (f": {msg}" if msg else "")
                        + f" — {str(data)[:300]}"
                    )
                return data
        except httpx.HTTPStatusError as e:
            body = (e.response.text or "")[:500] if e.response is not None else ""
            last_err = RuntimeError(f"RH API HTTP {e.response.status_code if e.response else '?'}: {body}")
            if attempt < retries - 1 and _is_transient_http_error(e):
                wait = min(2**attempt, 8)
                logger.warning("RH POST HTTP error (attempt %s/%s), retry in %ss: %s", attempt + 1, retries, wait, last_err)
                await asyncio.sleep(wait)
                continue
            raise last_err from e
        except Exception as e:
            last_err = e
            if attempt < retries - 1 and _is_transient_http_error(e):
                wait = min(2**attempt, 8)
                logger.warning("RH POST transient error (attempt %s/%s), retry in %ss: %s", attempt + 1, retries, wait, e)
                await asyncio.sleep(wait)
                continue
            raise
    raise last_err or RuntimeError("RH request failed")

# ── RH node mapping (AI App 2004879210508419073) — verify against RH console docs ──
# node 5  channel + resolution (fieldData per RH API doc)
# node 31 select: "1"=9宫格, "2"=16宫格, "3"=25宫格  (see _PROMO_FRAME_COUNT_RH in main.py)
# node 14 select: "1"=文生图 "2"=图生图
# node 13 image: 图生图模式才传
# node 7  text:  用户宣传文案（MVP 直传，不经 DeepSeek）
# SparkVideo 2.0: audioUrls 传参考音色 RH URL；无音色时 generateAudio=true


def _write_debug_json(output_dir: str | None, filename: str, data: dict) -> None:
    if not output_dir:
        return
    try:
        os.makedirs(output_dir, exist_ok=True)
        path = os.path.join(output_dir, filename)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
    except Exception as e:
        logger.warning("Failed to write debug file %s: %s", filename, e)


async def submit_storyboard_to_rh(
    api_key,
    creative_prompt,
    frame_count_value,
    *,
    resolution="2k",
    channel="Third-party",
    image_mode="2",
    product_image_url=None,
    instance_type="default",
    output_dir=None,
):
    url = f"{RH_BASE_URL}/run/ai-app/{STORYBOARD_AI_APP_ID}"
    node_info_list = [
        {
            "nodeId": "5",
            "fieldName": "channel",
            "fieldValue": channel,
            "fieldData": RH_CHANNEL_FIELD_DATA,
            "description": "第三方/官方路线切换",
        },
        {
            "nodeId": "5",
            "fieldName": "resolution",
            "fieldValue": resolution,
            "fieldData": RH_RESOLUTION_FIELD_DATA,
            "description": "分辨率设置",
        },
        {
            "nodeId": "31",
            "fieldName": "select",
            "fieldValue": frame_count_value,
            "description": "分镜数量切换",
        },
        {
            "nodeId": "14",
            "fieldName": "select",
            "fieldValue": image_mode,
            "description": "文生图/图生图",
        },
        {
            "nodeId": "7",
            "fieldName": "text",
            "fieldValue": creative_prompt,
            "description": "提示词",
        },
    ]
    if image_mode == "2" and product_image_url:
        node_info_list.append(
            {
                "nodeId": "13",
                "fieldName": "image",
                "fieldValue": product_image_url,
                "description": "图像参考",
            }
        )
    payload = {
        "nodeInfoList": node_info_list,
        "instanceType": instance_type or "default",
        "usePersonalQueue": "false",
    }
    _write_debug_json(output_dir, "rh_submit_payload.json", {
        "url": url,
        "payload": payload,
        "api_key": "***redacted***",
    })
    try:
        data = await _rh_post_json(api_key, url, payload)
    except Exception as e:
        raise RuntimeError(f"分镜工作流提交失败: {e}") from e
    _write_debug_json(output_dir, "rh_submit_response.json", data)
    task_id = (data.get("taskId") or "").strip()
    if not task_id:
        raise ValueError(f"分镜工作流返回无 taskId: {str(data)[:500]}")
    logger.info("Storyboard task submitted: taskId=%s", task_id)
    return task_id


async def submit_sparkvideo_task(
    api_key,
    prompt,
    image_urls,
    duration,
    resolution="720p",
    ratio="adaptive",
    real_person_mode=False,
    audio_urls: list[str] | None = None,
):
    url = f"{RH_BASE_URL}{SPARKVIDEO_ENDPOINT}"
    voice_urls = [u for u in (audio_urls or []) if u]
    payload = {
        "prompt": prompt,
        "resolution": resolution,
        "duration": duration,
        "imageUrls": image_urls,
        "videoUrls": [],
        "audioUrls": voice_urls,
        "generateAudio": not voice_urls,
        "ratio": ratio,
        "realPersonMode": real_person_mode,
        "conversionSlots": [],
        "returnLastFrame": False,
        "seed": -1,
    }
    data = await _rh_post_json(api_key, url, payload)
    task_id = data.get("taskId", "")
    if not task_id:
        raise ValueError(f"SparkVideo 返回无 taskId: {str(data)[:500]}")
    logger.info(f"SparkVideo task submitted: taskId={task_id}")
    return task_id


async def query_runninghub_task(api_key, task_id):
    url = f"{RH_BASE_URL}/query"
    return await _rh_post_json(api_key, url, {"taskId": task_id}, retries=RH_QUERY_MAX_RETRIES)


async def wait_for_runninghub_task(
    api_key,
    task_id,
    max_wait=600,
    poll_interval=5,
    on_poll=None,
    min_urls: int | None = None,
    task_label: str = "分镜",
):
    start = time.time()
    query_failures = 0
    while True:
        elapsed = time.time() - start
        if elapsed > max_wait:
            raise TimeoutError(f"分镜任务超时（已等待 {int(max_wait // 60)} 分钟），请在 RunningHub 控制台查看 taskId={task_id}")
        try:
            result = await query_runninghub_task(api_key, task_id)
            query_failures = 0
        except Exception as e:
            query_failures += 1
            if query_failures >= RH_QUERY_MAX_RETRIES and not _is_transient_http_error(e):
                raise RuntimeError(f"查询 RunningHub 任务失败: {e}") from e
            if query_failures >= RH_QUERY_MAX_RETRIES * 2:
                raise RuntimeError(
                    f"RunningHub 连接不稳定（{e}），请稍后重试。taskId={task_id}"
                ) from e
            wait = min(2 ** min(query_failures - 1, 3), 8)
            logger.warning("RH query failed (%s), retry in %ss: %s", query_failures, wait, e)
            await asyncio.sleep(wait)
            continue

        rh_status = (result.get("status") or "").strip()
        if on_poll:
            try:
                on_poll(result, elapsed, rh_status)
            except TypeError:
                try:
                    on_poll(result, elapsed)
                except Exception:
                    pass
            except Exception:
                pass

        if rh_status == "SUCCESS":
            valid_url = pick_first_valid_url(result.get("results"))
            if valid_url:
                if min_urls is not None:
                    url_count = len(pick_all_urls(result.get("results")))
                    if url_count < min_urls:
                        logger.warning(
                            "RH task %s SUCCESS but only %s/%s URLs, keep polling",
                            task_id,
                            url_count,
                            min_urls,
                        )
                        await asyncio.sleep(poll_interval)
                        continue
                logger.info(f"RH task {task_id} completed in {elapsed:.0f}s")
                return result
            logger.warning("RH task %s SUCCESS but no valid URL, keep polling", task_id)
        elif rh_status == "FAILED":
            detail = _format_rh_task_failure(result)
            raise RuntimeError(f"RunningHub {task_label}失败（{detail}）")
        await asyncio.sleep(poll_interval)


async def upload_to_runninghub(api_key, file_path):
    url = f"{RH_BASE_URL}/media/upload/binary"
    headers = {"Authorization": f"Bearer {api_key}"}
    last_err: BaseException | None = None
    data = None
    last_resp_text = ""
    for attempt in range(RH_TRANSIENT_RETRIES):
        try:
            async with httpx.AsyncClient(timeout=RH_HTTP_TIMEOUT) as client:
                with open(file_path, "rb") as f:
                    resp = await client.post(url, headers=headers, files={"file": (os.path.basename(file_path), f)})
                    last_resp_text = resp.text or ""
                    if not resp.is_success:
                        raise RuntimeError(f"RH 上传 HTTP {resp.status_code}: {last_resp_text[:500]}")
                    data = resp.json()
                    break
        except Exception as e:
            last_err = e
            if attempt < RH_TRANSIENT_RETRIES - 1 and _is_transient_http_error(e):
                await asyncio.sleep(min(2**attempt, 8))
                continue
            raise
    if data is None:
        raise last_err or RuntimeError("RH upload failed")
    code = data.get("code")
    if code is not None and code != 0:
        msg = (data.get("msg") or data.get("message") or "").strip()
        raise ValueError(
            f"RH 上传业务错误 code={code}"
            + (f": {msg}" if msg else "")
            + f" — {str(data)[:300]}"
        )
    data_payload = data.get("data") or {}
    download_url = (data_payload.get("download_url") or "").strip()
    if not download_url:
        raise ValueError(f"RH 上传返回无 download_url: {last_resp_text[:500] or str(data)[:500]}")
    logger.info("File uploaded to RH: %s -> %s", file_path, download_url[:80])
    return download_url


def _validate_image_bytes(data: bytes) -> None:
    """Validate downloaded content is a real image (min 1KB)."""
    if len(data) < 1024:
        raise ValueError(f"下载校验失败：图片过小（{len(data)} 字节）")
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return
    if data[:2] == b"\xff\xd8":
        return
    if data[:4] == b"RIFF" and len(data) >= 12 and data[8:12] == b"WEBP":
        return
    preview = data[:64]
    if preview.lstrip().startswith(b"<") or b"<html" in preview.lower():
        raise ValueError("下载校验失败：下载到非图片内容（疑似 HTML 错误页）")
    try:
        with Image.open(io.BytesIO(data)) as probe:
            probe.verify()
        return
    except Exception:
        pass
    raise ValueError(f"下载校验失败：非受支持图片格式（magic={data[:4]!r}）")


def _image_ext_from_bytes(data: bytes) -> str:
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return ".png"
    if data[:2] == b"\xff\xd8":
        return ".jpg"
    if data[:4] == b"RIFF" and len(data) >= 12 and data[8:12] == b"WEBP":
        return ".webp"
    return ".png"


def _is_rh_cdn_url(url: str) -> bool:
    lower = url.lower()
    return "runninghub" in lower


async def download_file(
    url,
    output_dir,
    filename="",
    *,
    validate_as_image: bool = False,
    api_key: str | None = None,
):
    os.makedirs(output_dir, exist_ok=True)
    last_err: BaseException | None = None
    content = None
    last_status = 0
    auth_retried = False

    async def _fetch(with_bearer: bool) -> tuple[bytes, int]:
        headers = {}
        if with_bearer and api_key:
            headers["Authorization"] = f"Bearer {api_key}"
        async with httpx.AsyncClient(timeout=RH_HTTP_TIMEOUT) as client:
            resp = await client.get(url, headers=headers or None)
            status = resp.status_code
            if not resp.is_success:
                raise RuntimeError(
                    f"下载失败 HTTP {status}（URL: {url[:80]}…）"
                )
            return resp.content, status

    for attempt in range(RH_TRANSIENT_RETRIES):
        try:
            try:
                content, last_status = await _fetch(False)
            except RuntimeError as e:
                err_msg = str(e)
                if (
                    not auth_retried
                    and api_key
                    and _is_rh_cdn_url(url)
                    and any(code in err_msg for code in ("401", "403"))
                ):
                    auth_retried = True
                    content, last_status = await _fetch(True)
                else:
                    raise
            break
        except Exception as e:
            last_err = e
            if attempt < RH_TRANSIENT_RETRIES - 1 and _is_transient_http_error(e):
                await asyncio.sleep(min(2**attempt, 8))
                continue
            raise
    if content is None:
        raise last_err or RuntimeError(f"下载失败（URL: {url[:80]}…, HTTP {last_status}）")
    if validate_as_image:
        try:
            _validate_image_bytes(content)
        except ValueError as e:
            magic = repr(content[:8])
            raise ValueError(f"{e}（URL: {url[:80]}…, HTTP {last_status}, magic={magic}）") from e
    if not filename:
        filename = f"download_{int(time.time()*1000)}_{abs(hash(url))%10000}"
    if not os.path.splitext(filename)[1]:
        filename = filename + _image_ext_from_bytes(content)
    filepath = os.path.join(output_dir, filename)
    with open(filepath, "wb") as f:
        f.write(content)
    logger.info(f"Downloaded: {url[:60]} -> {filepath}")
    return filepath


def crop_storyboard_grid(image_data, grid_cols, grid_rows, output_dir):
    img = Image.open(io.BytesIO(image_data))
    if img.mode != "RGB":
        img = img.convert("RGB")
    width, height = img.size
    frame_w = width // grid_cols
    frame_h = height // grid_rows
    logger.info(
        "Cropping grid %dx%d into %dx%d cells of %dx%d px",
        width,
        height,
        grid_cols,
        grid_rows,
        frame_w,
        frame_h,
    )
    os.makedirs(output_dir, exist_ok=True)
    paths = []
    idx = 1
    for r in range(grid_rows):
        for c in range(grid_cols):
            frame = img.crop((c * frame_w, r * frame_h, (c + 1) * frame_w, (r + 1) * frame_h))
            path = os.path.join(output_dir, f"frame_{idx:02d}.png")
            frame.save(path, "PNG")
            paths.append(path)
            idx += 1
    expected = grid_cols * grid_rows
    if len(paths) != expected:
        raise RuntimeError(f"裁切帧数 {len(paths)} 不等于期望 {expected}")
    for path in paths:
        if os.path.getsize(path) <= 0:
            raise RuntimeError(f"裁切帧文件为空: {path}")
    logger.info(f"Cropped {len(paths)} frames from {grid_cols}x{grid_rows} grid")
    return paths


def get_grid_dims(frame_count):
    return {9: (3, 3), 16: (4, 4), 25: (5, 5)}.get(frame_count, (3, 3))


def slice_images_for_segments(image_urls, segment_count):
    if segment_count <= 1:
        return [image_urls]
    per = len(image_urls) // segment_count
    rem = len(image_urls) % segment_count
    result = []
    start = 0
    for i in range(segment_count):
        extra = 1 if i < rem else 0
        end = start + per + extra
        result.append(image_urls[start:end])
        start = end
    return result


def concatenate_videos_ffmpeg(video_paths, output_path, ffmpeg_path="ffmpeg"):
    if len(video_paths) == 1:
        subprocess.run([ffmpeg_path, "-y", "-i", video_paths[0], "-c", "copy", output_path], check=True, capture_output=True, encoding="utf-8", errors="replace")
        return output_path
    concat_list = os.path.join(os.path.dirname(output_path) or ".", f"concat_{int(time.time()*1000)}.txt")
    try:
        with open(concat_list, "w", encoding="utf-8") as f:
            for vp in video_paths:
                abs_path = os.path.abspath(vp).replace("\\", "/").replace(":", "\\:")
                f.write(f"file '{abs_path}'\n")
        subprocess.run([ffmpeg_path, "-y", "-f", "concat", "-safe", "0", "-i", concat_list, "-c", "copy", output_path], check=True, capture_output=True, text=True, encoding="utf-8", errors="replace")
        logger.info(f"Concatenated {len(video_paths)} videos -> {output_path}")
    finally:
        if os.path.exists(concat_list):
            os.remove(concat_list)
    return output_path


def pick_first_valid_url(results):
    if not results or not isinstance(results, list):
        return None
    for item in results:
        if isinstance(item, dict):
            url = (item.get("url") or "").strip()
            if url:
                return url
    return None


def pick_all_urls(results):
    urls = []
    if not results or not isinstance(results, list):
        return urls
    for item in results:
        if isinstance(item, dict):
            url = (item.get("url") or "").strip()
            if url:
                urls.append(url)
    return urls


async def submit_grid_crop_to_rh(
    api_key,
    image_rh_url,
    rows,
    cols,
    *,
    save_all=True,
    instance_type="default",
    output_dir=None,
) -> str:
    """Submit multi-grid crop AI App; returns RH taskId."""
    url = f"{RH_BASE_URL}/run/ai-app/{CROP_AI_APP_ID}"
    node_info_list = [
        {
            "nodeId": "19",
            "fieldName": "value",
            "fieldValue": str(rows),
            "description": "行数",
        },
        {
            "nodeId": "20",
            "fieldName": "value",
            "fieldValue": str(cols),
            "description": "列数",
        },
        {
            "nodeId": "21",
            "fieldName": "value",
            "fieldValue": "0",
            "description": "单格下标（全部保存时忽略）",
        },
        {
            "nodeId": "4",
            "fieldName": "image",
            "fieldValue": image_rh_url,
            "description": "九宫格图",
        },
    ]
    if save_all:
        node_info_list.append(
            {
                "nodeId": "22",
                "fieldName": "value",
                "fieldValue": "true",
                "description": "保存全部格子",
            }
        )
    payload = {
        "nodeInfoList": node_info_list,
        "instanceType": instance_type or "default",
        "usePersonalQueue": "false",
    }
    _write_debug_json(output_dir, "rh_crop_submit_payload.json", {
        "url": url,
        "payload": payload,
        "api_key": "***redacted***",
    })
    try:
        data = await _rh_post_json(api_key, url, payload)
    except Exception as e:
        raise RuntimeError(f"多宫格裁切提交失败: {e}") from e
    _write_debug_json(output_dir, "rh_crop_submit_response.json", data)
    task_id = (data.get("taskId") or "").strip()
    if not task_id:
        raise ValueError(f"裁切工作流返回无 taskId: {str(data)[:500]}")
    logger.info("Grid crop task submitted: taskId=%s rows=%s cols=%s", task_id, rows, cols)
    return task_id


async def download_crop_results(
    api_key: str,
    result: dict,
    output_dir: str,
    expected_count: int,
) -> list[str]:
    """Download all crop frame URLs to frames/frame_01.png …; validate count."""
    urls = pick_all_urls(result.get("results"))
    if len(urls) < expected_count:
        raise RuntimeError(
            f"裁切返回 {len(urls)} 张 URL，期望 {expected_count} 张"
        )
    if len(urls) > expected_count:
        logger.warning(
            "Crop returned %s URLs, truncating to expected %s",
            len(urls),
            expected_count,
        )
        urls = urls[:expected_count]
    frames_dir = os.path.join(output_dir, "frames")
    sem = asyncio.Semaphore(4)

    async def _download_frame(i: int, frame_url: str) -> str:
        async with sem:
            try:
                path = await download_file(
                    frame_url,
                    frames_dir,
                    f"frame_{i:02d}",
                    validate_as_image=True,
                    api_key=api_key,
                )
                logger.info(
                    "Crop frame %02d downloaded: %s -> %s",
                    i,
                    frame_url[:120],
                    path,
                )
                return path
            except Exception as e:
                logger.error(
                    "Crop frame %02d download failed: url=%s error=%s",
                    i,
                    frame_url[:120],
                    e,
                )
                raise

    paths = list(
        await asyncio.gather(
            *[_download_frame(i, frame_url) for i, frame_url in enumerate(urls, start=1)]
        )
    )
    if len(paths) != expected_count:
        raise RuntimeError(
            f"裁切落盘 {len(paths)} 张，期望 {expected_count} 张"
        )
    for path in paths:
        if os.path.getsize(path) <= 0:
            raise RuntimeError(f"裁切帧文件为空: {path}")
    logger.info("Downloaded %s crop frames to %s", len(paths), frames_dir)
    return paths


PROMO_VIDEO_COST_PER_15S = 800


def calculate_promo_video_cost(duration):
    segments = max(1, (duration + 14) // 15)
    return segments * PROMO_VIDEO_COST_PER_15S
