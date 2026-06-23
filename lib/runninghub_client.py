"""
RunningHub API 客户端封装

API 端点:
  - 文件上传: POST /openapi/v2/media/upload/binary
  - 音频克隆: POST /openapi/v2/run/ai-app/1965614643077070850
  - 视频生成: POST /openapi/v2/run/workflow/2040243235951484930
    · nodeId=221: 数字人形象图片 (image)
    · nodeId=238: 音频 (audio)
    · nodeId=254: 11 行动作描述提示词 (text) — 必须 11 行，每行对应一个视频分段
  - 任务查询: POST /openapi/v2/query

用法:
    client = RunningHubClient("your-api-key")
    motion = build_motion_prompt("female")
    video_task_id = await client.submit_video(image_url, audio_url, motion)
"""

import time
import logging
from typing import Optional

import httpx

logger = logging.getLogger("runninghub")

BASE_URL = "https://www.runninghub.cn/openapi/v2"

AUDIO_CLONE_APP_ID = "1965614643077070850"
VIDEO_WORKFLOW_ID = "2040243235951484930"

# 视频工作流节点 ID（对应 ComfyUI 工作流）
VIDEO_NODE_IMAGE = "221"   # LoadImage — 数字人形象
VIDEO_NODE_AUDIO = "238"   # LoadAudio — 音频
VIDEO_NODE_PROMPT = "254"  # TextInput_ — 11 行动作描述提示词

# 封面图 API
COVER_IMAGE_ENDPOINT = "/rhart-image-g-2/image-to-image"
COVER_UPLOAD_ENDPOINT = "/media/upload/binary"

# 轮询间隔（秒）
POLL_INTERVAL = 5
# 最大等待时间（秒）= 50 分钟
MAX_WAIT_SECONDS = 50 * 60
# 最大重试次数（任务查询失败时）
MAX_QUERY_RETRIES = 3
MOTION_PROMPT_LINE_COUNT = 11


def _default_motion_prompt(gender: str) -> str:
    pronoun = "她" if gender == "female" else "他"
    return (
        f"{pronoun}对着镜头说话。\n"
        f"{pronoun}对着镜头说话，手部自然摆动，轻微皱眉\n"
        f"{pronoun}对着镜头说话。\n"
        f"{pronoun}对着镜头说话，手部自然的摆动\n"
        f"{pronoun}对着镜头说话。\n"
        f"{pronoun}对着镜头说话，手部自然的摆动\n"
        f"{pronoun}对着镜头说话。\n"
        f"{pronoun}对着镜头说话，手部自然摆动，轻微皱眉\n"
        f"{pronoun}对着镜头说话。\n"
        f"{pronoun}对着镜头说话，手部自然的摆动\n"
        f"{pronoun}对着镜头说话。\n"
    )


def build_motion_prompt(gender: str, custom_prompt: str = "") -> str:
    """生成视频工作流节点 254 所需的 11 行动作描述提示词。

    每行对应一个视频分段的数字人动作描述，总行数必须为 11。
    根据数字人性别使用对应的代词。
    """
    if not custom_prompt or not custom_prompt.strip():
        return _default_motion_prompt(gender)

    lines = [
        line.strip()
        for line in custom_prompt.replace("\r\n", "\n").replace("\r", "\n").split("\n")
        if line.strip()
    ]
    if len(lines) != MOTION_PROMPT_LINE_COUNT:
        raise ValueError(
            f"video_prompt 必须是 {MOTION_PROMPT_LINE_COUNT} 行非空文本，当前为 {len(lines)} 行"
        )
    return "\n".join(lines)


def build_cover_prompt(gender: str) -> str:
    """生成封面图 prompt，根据性别使用对应代词。"""
    pronoun = "她" if gender == "female" else "他"
    return (
        f"{pronoun}面对镜头，专业自信的表情，柔和的工作室灯光，"
        f"干净的浅灰色背景，电影级画质，竖屏封面图，"
        f"高质量人像摄影，皮肤质感自然，眼神坚定温和"
    )


class RunningHubError(Exception):
    """RunningHub API 错误"""

    def __init__(self, message: str, status_code: Optional[int] = None, response_body: str = ""):
        super().__init__(message)
        self.status_code = status_code
        self.response_body = response_body


class RunningHubClient:
    """RunningHub API 客户端"""

    def __init__(self, api_key: str):
        if not api_key or not api_key.strip():
            raise ValueError("RUNNINGHUB_API_KEY 不能为空")
        self.api_key = api_key.strip()
        self._client: Optional[httpx.AsyncClient] = None

    async def _get_client(self) -> httpx.AsyncClient:
        if self._client is None:
            self._client = httpx.AsyncClient(
                timeout=httpx.Timeout(120.0),
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                },
            )
        return self._client

    async def close(self):
        if self._client:
            await self._client.aclose()
            self._client = None

    def _extract_error_message(self, resp: httpx.Response) -> str:
        """尽量透传 RunningHub 返回的业务错误信息。"""
        try:
            payload = resp.json()
        except Exception:
            return ""
        if not isinstance(payload, dict):
            return ""
        return str(payload.get("errorMessage") or payload.get("message") or "").strip()

    def _build_http_error(self, action: str, resp: httpx.Response) -> RunningHubError:
        error_message = self._extract_error_message(resp)
        message = f"{action}失败 (HTTP {resp.status_code})"
        if error_message:
            message = f"{message}: {error_message}"
        return RunningHubError(
            message,
            status_code=resp.status_code,
            response_body=(resp.text or "")[:1000],
        )

    # ── 文件上传 ──────────────────────────────────────────

    async def upload_file(self, file_path: str) -> str:
        """
        上传文件到 RunningHub，返回 download_url。

        Args:
            file_path: 本地文件路径

        Returns:
            download_url: 上传后的文件 URL（1 天有效）

        Raises:
            RunningHubError: 上传失败
        """
        client = await self._get_client()
        url = f"{BASE_URL}/media/upload/binary"

        try:
            with open(file_path, "rb") as f:
                files = {"file": (file_path.replace("\\", "/").split("/")[-1], f)}
                # multipart/form-data 不带 Content-Type header（让 httpx 自动设置）
                resp = await client.post(url, files=files)
        except httpx.RequestError as e:
            raise RunningHubError(f"文件上传网络错误: {e}") from e

        if not resp.is_success:
            raise self._build_http_error("文件上传", resp)

        data = resp.json()
        download_url = data.get("data", {}).get("download_url", "")
        if not download_url:
            raise RunningHubError(f"文件上传返回缺少 download_url: {resp.text[:500]}")

        logger.info(f"File uploaded: {file_path} → {download_url}")
        return download_url

    # ── 音频克隆 ──────────────────────────────────────────

    async def submit_audio_clone(
        self,
        main_audio_url: str,
        emotion_audio_url: str,
        text: str,
    ) -> str:
        """
        提交音频克隆任务。

        Args:
            main_audio_url: 需要模仿的声音文件 URL（nodeId=13）
            emotion_audio_url: 需要模仿的情感语气文件 URL（nodeId=15）
            text: 输入模仿的文字（nodeId=14）

        Returns:
            taskId: RunningHub 任务 ID

        Raises:
            RunningHubError: 提交失败
        """
        client = await self._get_client()
        url = f"{BASE_URL}/run/ai-app/{AUDIO_CLONE_APP_ID}"

        payload = {
            "nodeInfoList": [
                {
                    "nodeId": "13",
                    "fieldName": "audio",
                    "fieldValue": main_audio_url,
                    "description": "需要模仿的声音（主要）",
                },
                {
                    "nodeId": "15",
                    "fieldName": "audio",
                    "fieldValue": emotion_audio_url,
                    "description": "需要模仿的情感语气(次要）",
                },
                {
                    "nodeId": "14",
                    "fieldName": "value",
                    "fieldValue": text,
                    "description": "输入模仿的文字",
                },
            ],
            "instanceType": "default",
            "usePersonalQueue": "false",
        }

        try:
            resp = await client.post(url, json=payload)
        except httpx.RequestError as e:
            raise RunningHubError(f"音频克隆任务提交网络错误: {e}") from e

        if not resp.is_success:
            raise self._build_http_error("音频克隆任务提交", resp)

        data = resp.json()
        task_id = data.get("taskId", "")
        if not task_id:
            raise RunningHubError(f"音频克隆返回缺少 taskId: {resp.text[:500]}")

        logger.info(f"Audio clone task submitted: taskId={task_id}")
        return task_id

    # ── 视频生成 ──────────────────────────────────────────

    async def submit_video(
        self,
        image_url: str,
        audio_url: str,
        motion_prompt: str,
    ) -> str:
        """
        提交视频生成任务。

        Args:
            image_url: 数字人形象图片 URL → nodeId=221
            audio_url: 克隆后音频 URL → nodeId=238
            motion_prompt: 11 行动作描述提示词 → nodeId=254

        Returns:
            taskId: RunningHub 任务 ID

        Raises:
            RunningHubError: 提交失败
        """
        client = await self._get_client()
        url = f"{BASE_URL}/run/workflow/{VIDEO_WORKFLOW_ID}"

        payload = {
            "addMetadata": True,
            "nodeInfoList": [
                {
                    "nodeId": VIDEO_NODE_IMAGE,
                    "fieldName": "image",
                    "fieldValue": image_url,
                },
                {
                    "nodeId": VIDEO_NODE_AUDIO,
                    "fieldName": "audio",
                    "fieldValue": audio_url,
                },
                {
                    "nodeId": VIDEO_NODE_PROMPT,
                    "fieldName": "text",
                    "fieldValue": motion_prompt,
                },
            ],
            "instanceType": "default",
            "usePersonalQueue": "false",
        }

        try:
            resp = await client.post(url, json=payload)
        except httpx.RequestError as e:
            raise RunningHubError(f"视频生成任务提交网络错误: {e}") from e

        if not resp.is_success:
            raise self._build_http_error("视频生成任务提交", resp)

        data = resp.json()
        task_id = data.get("taskId", "")
        if not task_id:
            raise RunningHubError(f"视频生成返回缺少 taskId: {resp.text[:500]}")

        logger.info(f"Video generation task submitted: taskId={task_id}")
        return task_id

    # ── 封面图生成 ──────────────────────────────────────────

    async def submit_cover_image(
        self,
        prompt: str,
        image_urls: list[str],
        aspect_ratio: str = "3:4",
        resolution: str = "1k",
    ) -> str:
        """
        提交封面图生成任务（图生图）。

        Args:
            prompt: 封面图描述 prompt
            image_urls: 参考图片 URL 列表（数字人形象照）
            aspect_ratio: 比例，默认 3:4
            resolution: 分辨率，默认 1k

        Returns:
            taskId: RunningHub 任务 ID
        """
        client = await self._get_client()
        url = f"{BASE_URL}{COVER_IMAGE_ENDPOINT}"

        payload = {
            "prompt": prompt,
            "imageUrls": image_urls,
            "aspectRatio": aspect_ratio,
            "resolution": resolution,
        }

        try:
            resp = await client.post(url, json=payload)
        except httpx.RequestError as e:
            raise RunningHubError(f"封面图生成任务提交网络错误: {e}") from e

        if not resp.is_success:
            raise self._build_http_error("封面图生成任务提交", resp)

        data = resp.json()
        task_id = data.get("taskId", "")
        if not task_id:
            raise RunningHubError(f"封面图生成返回缺少 taskId: {resp.text[:500]}")

        logger.info(f"Cover image task submitted: taskId={task_id}")
        return task_id

    # ── 任务查询 ──────────────────────────────────────────

    async def query_task(self, task_id: str) -> dict:
        """
        查询任务状态。

        Returns:
            {
                "status": "QUEUED" | "RUNNING" | "SUCCESS" | "FAILED",
                "results": [{ "url": "...", "nodeId": "...", "outputType": "..." }] | null,
                "errorMessage": str,
                "errorCode": str,
                "usage": { ... },
            }

        Raises:
            RunningHubError: 查询失败（网络错误或 API 错误）
        """
        client = await self._get_client()
        url = f"{BASE_URL}/query"

        payload = {"taskId": task_id}

        try:
            resp = await client.post(url, json=payload)
        except httpx.RequestError as e:
            raise RunningHubError(f"任务查询网络错误: {e}") from e

        if not resp.is_success:
            raise RunningHubError(
                f"任务查询失败 (HTTP {resp.status_code})",
                status_code=resp.status_code,
                response_body=resp.text[:1000],
            )

        return resp.json()

    # ── 轮询等待完成 ─────────────────────────────────────

    async def wait_for_completion(
        self,
        task_id: str,
        max_wait: int = MAX_WAIT_SECONDS,
        poll_interval: int = POLL_INTERVAL,
    ) -> dict:
        """
        轮询等待任务完成，内置指数退避重试。

        Args:
            task_id: RunningHub 任务 ID
            max_wait: 最大等待时间（秒），默认 3000（50 分钟）
            poll_interval: 轮询间隔（秒），默认 5

        Returns:
            完整的任务结果 dict（status="SUCCESS" 时含 results）

        Raises:
            RunningHubError: 任务失败、超时、或达到最大重试次数
        """
        start_time = time.time()
        consecutive_failures = 0

        while True:
            elapsed = time.time() - start_time
            if elapsed > max_wait:
                raise RunningHubError(
                    f"任务超时：已等待 {max_wait // 60} 分钟，任务 {task_id} 仍未完成。"
                    f"请检查 RunningHub 控制台或重新提交。"
                )

            try:
                result = await self.query_task(task_id)
                consecutive_failures = 0  # reset on success
            except RunningHubError as e:
                consecutive_failures += 1
                if consecutive_failures > MAX_QUERY_RETRIES:
                    raise RunningHubError(
                        f"任务查询连续失败 {MAX_QUERY_RETRIES} 次，放弃轮询。"
                        f"最后错误: {e}"
                    ) from e
                # 指数退避: 1s → 2s → 4s
                backoff = min(2 ** (consecutive_failures - 1), 8)
                logger.warning(
                    f"Task query failed (attempt {consecutive_failures}/{MAX_QUERY_RETRIES}), "
                    f"retrying in {backoff}s... Error: {e}"
                )
                await _async_sleep(backoff)
                continue

            status = result.get("status", "")

            if status == "SUCCESS":
                results = result.get("results")
                if results and len(results) > 0:
                    logger.info(f"Task {task_id} completed successfully. "
                                f"Output: {results[0].get('url', 'N/A')[:80]}")
                else:
                    logger.warning(f"Task {task_id} marked SUCCESS but has no results.")
                return result

            if status == "FAILED":
                error_msg = result.get("errorMessage") or result.get("errorCode") or "未知错误"
                raise RunningHubError(
                    f"任务 {task_id} 执行失败: {error_msg}。"
                    f"请检查素材是否符合要求，然后重新提交。"
                )

            # QUEUED or RUNNING — continue polling
            logger.info(f"Task {task_id} status={status}, elapsed={elapsed:.0f}s")
            await _async_sleep(poll_interval)


async def _async_sleep(seconds: float):
    """异步 sleep（兼容不同事件循环）"""
    import asyncio
    await asyncio.sleep(seconds)
