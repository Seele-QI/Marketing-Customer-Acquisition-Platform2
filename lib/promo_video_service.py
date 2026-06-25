import asyncio
import io
import logging
import os
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


async def generate_video_prompt(deepseek_api_key, product_name, selling_points, target_audience, style, frame_count, duration):
    image_refs = ", ".join([f"@Image {i+1}" for i in range(frame_count)])
    user_prompt = (
        f"产品名称：{product_name}\n"
        f"核心卖点：{'、'.join(selling_points)}\n"
        f"目标受众：{target_audience}\n"
        f"视频风格：{style}\n"
        f"视频时长：{duration}秒\n"
        f"参考图片数量：{frame_count}张（分别是 {image_refs}）\n"
        f"请生成一段可用于AI视频生成的提示词，用 @Image 1~N 引用对应图片。"
    )
    return await call_deepseek(deepseek_api_key, VIDEO_PROMPT_SYSTEM_PROMPT, user_prompt)


RH_BASE_URL = "https://www.runninghub.cn/openapi/v2"
STORYBOARD_AI_APP_ID = "2004879210508419073"
SPARKVIDEO_ENDPOINT = "/rhart-video/sparkvideo-2.0/multimodal-video"


async def submit_storyboard_to_rh(api_key, product_image_url, creative_prompt, frame_count_value, resolution="2k", channel="Third-party", instance_type="plus"):
    url = f"{RH_BASE_URL}/run/ai-app/{STORYBOARD_AI_APP_ID}"
    headers = {"Content-Type": "application/json", "Authorization": f"Bearer {api_key}"}
    payload = {
        "nodeInfoList": [
            {"nodeId": "5", "fieldName": "channel", "fieldValue": channel},
            {"nodeId": "5", "fieldName": "resolution", "fieldValue": resolution},
            {"nodeId": "31", "fieldName": "select", "fieldValue": frame_count_value, "description": "分镜数量切换"},
            {"nodeId": "14", "fieldName": "select", "fieldValue": "2", "description": "图生图模式"},
            {"nodeId": "13", "fieldName": "image", "fieldValue": product_image_url, "description": "图像参考"},
            {"nodeId": "7", "fieldName": "text", "fieldValue": creative_prompt, "description": "提示词"},
        ],
        "instanceType": instance_type,
        "usePersonalQueue": "false",
    }
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(url, headers=headers, json=payload)
        resp.raise_for_status()
        data = resp.json()
    task_id = data.get("taskId", "")
    if not task_id:
        raise ValueError(f"分镜工作流返回无 taskId: {resp.text[:500]}")
    logger.info(f"Storyboard task submitted: taskId={task_id}")
    return task_id


async def submit_sparkvideo_task(api_key, prompt, image_urls, duration, resolution="720p", ratio="adaptive", real_person_mode=False):
    url = f"{RH_BASE_URL}{SPARKVIDEO_ENDPOINT}"
    headers = {"Content-Type": "application/json", "Authorization": f"Bearer {api_key}"}
    payload = {
        "prompt": prompt,
        "resolution": resolution,
        "duration": duration,
        "imageUrls": image_urls,
        "videoUrls": [],
        "audioUrls": [],
        "generateAudio": True,
        "ratio": ratio,
        "realPersonMode": real_person_mode,
        "conversionSlots": [],
        "returnLastFrame": False,
        "seed": -1,
    }
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(url, headers=headers, json=payload)
        resp.raise_for_status()
        data = resp.json()
    task_id = data.get("taskId", "")
    if not task_id:
        raise ValueError(f"SparkVideo 返回无 taskId: {resp.text[:500]}")
    logger.info(f"SparkVideo task submitted: taskId={task_id}")
    return task_id


async def query_runninghub_task(api_key, task_id):
    url = f"{RH_BASE_URL}/query"
    headers = {"Content-Type": "application/json", "Authorization": f"Bearer {api_key}"}
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(url, headers=headers, json={"taskId": task_id})
        resp.raise_for_status()
        return resp.json()


async def wait_for_runninghub_task(api_key, task_id, max_wait=600, poll_interval=5):
    start = time.time()
    while True:
        elapsed = time.time() - start
        if elapsed > max_wait:
            raise TimeoutError(f"RH task {task_id} timed out ({max_wait}s)")
        result = await query_runninghub_task(api_key, task_id)
        status = result.get("status", "")
        if status == "SUCCESS":
            logger.info(f"RH task {task_id} completed in {elapsed:.0f}s")
            return result
        elif status == "FAILED":
            error_msg = result.get("errorMessage") or result.get("errorCode") or "未知错误"
            raise RuntimeError(f"RH task {task_id} failed: {error_msg}")
        await asyncio.sleep(poll_interval)


async def upload_to_runninghub(api_key, file_path):
    url = f"{RH_BASE_URL}/media/upload/binary"
    headers = {"Authorization": f"Bearer {api_key}"}
    async with httpx.AsyncClient(timeout=120.0) as client:
        with open(file_path, "rb") as f:
            resp = await client.post(url, headers=headers, files={"file": (os.path.basename(file_path), f)})
            resp.raise_for_status()
            data = resp.json()
    data_payload = data.get("data") or {}
    download_url = (data_payload.get("download_url") or "").strip()
    if not download_url:
        raise ValueError(f"RH 上传返回无 download_url: {resp.text[:500]}")
    logger.info(f"File uploaded to RH: {file_path} -> {download_url[:80]}")
    return download_url


async def download_file(url, output_dir, filename=""):
    os.makedirs(output_dir, exist_ok=True)
    if not filename:
        filename = f"download_{int(time.time()*1000)}_{abs(hash(url))%10000}.png"
    filepath = os.path.join(output_dir, filename)
    async with httpx.AsyncClient(timeout=120.0) as client:
        resp = await client.get(url)
        resp.raise_for_status()
        with open(filepath, "wb") as f:
            f.write(resp.content)
    logger.info(f"Downloaded: {url[:60]} -> {filepath}")
    return filepath


def crop_storyboard_grid(image_data, grid_cols, grid_rows, output_dir):
    img = Image.open(io.BytesIO(image_data))
    width, height = img.size
    frame_w = width // grid_cols
    frame_h = height // grid_rows
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


PROMO_VIDEO_COST_PER_15S = 800


def calculate_promo_video_cost(duration):
    segments = max(1, (duration + 14) // 15)
    return segments * PROMO_VIDEO_COST_PER_15S
