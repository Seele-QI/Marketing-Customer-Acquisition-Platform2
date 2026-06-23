"""
视频文案提取 + 语音识别 — 核心逻辑

功能：
  1. yt-dlp 解析视频链接，优先提取已有字幕（B站等）
  2. 若无字幕 → 下载音频并提取为 16kHz mono WAV
  3. 阿里云 NLS 录音文件识别极速版（FlashRecognizer）→ 语音转文字
     - 纯文本模式：用于文案提取
     - 词级时间戳模式：用于自动字幕生成（同步返回，无需轮询）
  4. 返回提取的纯文本文案 / 带时间戳的句子序列
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import logging
import os
import tempfile
import time
import uuid
from dataclasses import dataclass, field
from typing import Any

import httpx
import yt_dlp  # type: ignore

logger = logging.getLogger(__name__)

# ── 阿里云 NLS 配置 ──────────────────────────────────────────────
NLS_TOKEN_URL = "https://nls-meta.cn-shanghai.aliyuncs.com/pop/2018-05-18/tokens"
NLS_FLASH_ENDPOINT = "https://nls-gateway-cn-shanghai.aliyuncs.com/stream/v1/FlashRecognizer"
NLS_TOKEN_REFRESH_SEC = 7200  # Token 提前 2 小时刷新（有效期 24h）

# ── 数据结构 ──────────────────────────────────────────────────────

@dataclass
class TimedWord:
    """单个识别词及其时间戳（FlashRecognizer 词级结果）"""
    text: str           # 词文本
    start_ms: int       # 起始时间（毫秒）
    end_ms: int         # 结束时间（毫秒）
    punc: str = ""      # 词尾标点


@dataclass
class TimedSentence:
    """FlashRecognizer 直接返回的句子"""
    text: str
    start_ms: int
    end_ms: int
    words: list[TimedWord] = field(default_factory=list)


@dataclass
class TimedTranscriptionResult:
    """带时间戳的完整识别结果"""
    text: str                                    # 完整纯文本
    sentences: list[TimedSentence] = field(default_factory=list)  # 句子级时间轴
    duration_ms: int = 0                         # 总时长（毫秒）
    latency_ms: int = 0                          # 服务端处理耗时


# ── 工具函数 ──────────────────────────────────────────────────────

def _get_nls_config() -> tuple[str, str, str]:
    """读取阿里云 NLS 配置，缺失时抛出 ValueError"""
    access_key_id = (os.getenv("ALIYUN_ACCESS_KEY_ID") or "").strip()
    access_key_secret = (os.getenv("ALIYUN_ACCESS_KEY_SECRET") or "").strip()
    app_key = (os.getenv("ALIYUN_ASR_APP_KEY") or "").strip()
    if not access_key_id or not access_key_secret or not app_key:
        raise ValueError(
            "未配置阿里云 NLS 语音识别：请在 .env 中设置 "
            "ALIYUN_ACCESS_KEY_ID / ALIYUN_ACCESS_KEY_SECRET / ALIYUN_ASR_APP_KEY"
        )
    return access_key_id, access_key_secret, app_key


async def _async_sleep(seconds: float) -> None:
    """可被 event loop 中断的 sleep"""
    import asyncio
    try:
        await asyncio.sleep(seconds)
    except RuntimeError:
        time.sleep(seconds)


# ── 阿里云 NLS Token 管理 ───────────────────────────────────────

_nls_token_cache: dict[str, Any] = {}


def _get_nls_token() -> str:
    """
    获取阿里云 NLS Token（有效期 24h，自动缓存刷新）。

    使用 HMAC-SHA1 签名调用 NLS Token 接口。
    """
    access_key_id, access_key_secret, app_key = _get_nls_config()

    cache_key = f"{access_key_id}:{app_key}"
    cached = _nls_token_cache.get(cache_key)
    if cached and cached.get("expire_time", 0) > time.time() + NLS_TOKEN_REFRESH_SEC:
        return cached["token"]

    import datetime as _dt

    date_str = _dt.datetime.utcnow().strftime("%a, %d %b %Y %H:%M:%S GMT")
    accept = "application/json"
    content_type = "application/json"
    body_md5 = base64.b64encode(hashlib.md5(b"{}").digest()).decode()
    # 签名需包含 URL 路径（阿里云要求）
    string_to_sign = (
        f"POST\n{accept}\n{body_md5}\n{content_type}\n{date_str}\n"
        f"/pop/2018-05-18/tokens"
    )

    signature = base64.b64encode(
        hmac.new(
            access_key_secret.encode("utf-8"),
            string_to_sign.encode("utf-8"),
            hashlib.sha1,
        ).digest()
    ).decode()
    auth_header = f"Dataplus {access_key_id}:{signature}"

    headers = {
        "Authorization": auth_header,
        "Content-Type": content_type,
        "Accept": accept,
        "Date": date_str,
    }

    try:
        resp = httpx.post(NLS_TOKEN_URL, headers=headers, json={}, timeout=15.0)
        resp.raise_for_status()
        data = resp.json()
        # Token 接口返回大写字段名
        tok_obj = data.get("Token", {})
        token = tok_obj.get("Id", "")
        expire = tok_obj.get("ExpireTime", 0)
        if not token:
            raise RuntimeError(f"获取 NLS Token 失败: {data}")
        _nls_token_cache[cache_key] = {"token": token, "expire_time": expire}
        logger.info(f"NLS Token 已获取，过期时间: {expire}")
        return token
    except httpx.HTTPStatusError as e:
        raise RuntimeError(f"获取 NLS Token HTTP 错误: {e.response.status_code} {e.response.text}") from e


# ── 阿里云 NLS 录音文件识别极速版（FlashRecognizer）──────────────

async def _aliyun_nls_transcribe_internal(
    audio_path: str,
    *,
    enable_words: bool = False,
    enable_timestamp: bool = False,
    sentence_max_length: int | None = None,
) -> dict[str, Any]:
    """
    阿里云 NLS 录音文件识别极速版 — 同步返回结果，无需轮询。

    参数：
        audio_path: 16kHz mono WAV 文件路径
        enable_words: 是否返回词级识别结果
        enable_timestamp: 是否返回词级时间戳
        sentence_max_length: 每句最多字数（4-50），用于字幕场景控制行宽

    返回：NLS 完整 JSON 响应（含 flash_result）
    """
    app_key = _get_nls_config()[2]
    token = _get_nls_token()

    with open(audio_path, "rb") as f:
        audio_bytes = f.read()

    if not audio_bytes:
        raise RuntimeError("音频文件为空")

    # 构造 URL query 参数
    params: dict[str, str] = {
        "appkey": app_key,
        "token": token,
        "format": "wav",
        "sample_rate": "16000",
        "enable_inverse_text_normalization": "true",
    }
    if enable_words:
        params["enable_word_level_result"] = "true"
    if enable_timestamp:
        params["enable_timestamp_alignment"] = "true"
    if sentence_max_length is not None:
        params["sentence_max_length"] = str(sentence_max_length)

    query_string = "&".join(f"{k}={v}" for k, v in params.items())
    url = f"{NLS_FLASH_ENDPOINT}?{query_string}"

    headers = {
        "Content-Type": "application/octet-stream",
        "Content-Length": str(len(audio_bytes)),
        "Host": "nls-gateway-cn-shanghai.aliyuncs.com",
    }

    logger.info(
        f"NLS FlashRecognizer: words={enable_words}, ts={enable_timestamp}, "
        f"audio={len(audio_bytes)} bytes"
    )

    async with httpx.AsyncClient(timeout=120.0) as client:
        resp = await client.post(url, headers=headers, content=audio_bytes)
        resp.raise_for_status()
        result = resp.json()

    status = result.get("status", -1)
    if status != 20000000:
        message = result.get("message", "未知错误")
        task_id = result.get("task_id", "")
        raise RuntimeError(
            f"NLS FlashRecognizer 失败 (status={status}, task_id={task_id}): {message}"
        )

    flash = result.get("flash_result", {})
    if not flash or not flash.get("sentences"):
        raise RuntimeError("NLS 返回成功但未包含识别结果")

    logger.info(
        f"NLS FlashRecognizer 完成: duration={flash.get('duration', 0)}ms, "
        f"latency={flash.get('latency', 0)}ms, "
        f"sentences={len(flash.get('sentences', []))}"
    )

    return result


async def _aliyun_nls_transcribe(audio_path: str) -> str:
    """纯文本模式：仅返回转写文本（兼容旧接口）"""
    result = await _aliyun_nls_transcribe_internal(audio_path)
    flash = result.get("flash_result", {})
    sentences = flash.get("sentences", [])
    full_text = "".join(s.get("text", "") for s in sentences)
    if not full_text:
        raise RuntimeError("NLS 返回空文本")
    return full_text.strip()


async def transcribe_audio_with_timestamps(
    audio_path: str,
    sentence_max_length: int = 22,
) -> TimedTranscriptionResult:
    """
    带句子级时间戳的语音识别（FlashRecognizer 极速版，同步返回）。

    参数：
        audio_path: 16kHz mono WAV 文件路径
        sentence_max_length: 每句最多字数（默认 22，适合中文字幕单行）

    返回：TimedTranscriptionResult（完整纯文本 + 句子级时间轴 + 词级时间戳）

    FlashRecognizer 已自动完成句子分段和词对齐，无需本地做 merge_words_to_sentences。
    """
    raw = await _aliyun_nls_transcribe_internal(
        audio_path,
        enable_words=True,
        enable_timestamp=True,
        sentence_max_length=sentence_max_length,
    )

    flash = raw.get("flash_result", {})
    duration_ms = flash.get("duration", 0)
    latency_ms = flash.get("latency", 0)
    sentences_raw: list[dict[str, Any]] = flash.get("sentences", [])

    sentences: list[TimedSentence] = []
    full_text_parts: list[str] = []

    for s in sentences_raw:
        text = (s.get("text") or "").strip()
        if not text:
            continue

        words: list[TimedWord] = []
        for w in s.get("words", []):
            w_text = (w.get("text") or "").strip()
            if not w_text:
                continue
            words.append(TimedWord(
                text=w_text,
                start_ms=int(w.get("begin_time", 0)),
                end_ms=int(w.get("end_time", 0)),
                punc=(w.get("punc") or ""),
            ))

        sentences.append(TimedSentence(
            text=text,
            start_ms=s.get("begin_time", 0),
            end_ms=s.get("end_time", 0),
            words=words,
        ))
        full_text_parts.append(text)

    full_text = "".join(full_text_parts)

    if not sentences:
        logger.warning("NLS FlashRecognizer 未返回句子级结果")

    return TimedTranscriptionResult(
        text=full_text,
        sentences=sentences,
        duration_ms=duration_ms,
        latency_ms=latency_ms,
    )


# ── 平台识别 ──────────────────────────────────────────────────────

# 平台域名映射
_PLATFORM_DOMAINS: dict[str, list[str]] = {
    "douyin": ["douyin.com", "v.douyin.com", "iesdouyin.com"],
    "kuaishou": ["kuaishou.com", "v.kuaishou.com", "gifshow.com"],
    "shipinhao": ["channels.weixin.qq.com", "weixin.qq.com"],
    "xiaohongshu": ["xiaohongshu.com", "xhslink.com"],
    "bilibili": ["bilibili.com", "b23.tv"],
    "youtube": ["youtube.com", "youtu.be"],
}

# 需要第三方 API 的平台（yt-dlp 无法直接下载）
_API_REQUIRED_PLATFORMS: set[str] = {"douyin", "kuaishou", "shipinhao"}


def _classify_platform(url: str) -> str:
    """根据 URL 域名返回平台标识"""
    from urllib.parse import urlparse

    host = ""
    if "://" in url:
        parsed = urlparse(url)
        host = (parsed.netloc or "").lower()
    else:
        # 处理短链接格式（如 v.douyin.com/xxx）
        host = url.split("/")[0].lower()

    for platform, domains in _PLATFORM_DOMAINS.items():
        for domain in domains:
            if domain in host:
                return platform
    return "unknown"


# ── 第三方 API 下载（抖音/快手/小红书 等需登录态平台）────────────

# API 用量控制
_api_call_counts: dict[str, int] = {}
_api_call_date: str = ""

# URL 下载缓存（30 分钟内不重复请求同一 URL）
_url_download_cache: dict[str, tuple[str, dict, float]] = {}
_URL_CACHE_TTL_SEC: int = 1800


def _get_media_parser_base_url() -> str:
    """获取 media-parser 服务地址"""
    base = (os.getenv("MEDIA_PARSER_BASE_URL") or "").strip().rstrip("/")
    if not base:
        raise RuntimeError(
            "未配置 media-parser 地址。请在 .env 中设置 MEDIA_PARSER_BASE_URL=http://localhost:8051"
        )
    return base


def _check_daily_limit() -> None:
    """检查是否超过每日 API 调用上限（media-parser 自部署免费，默认大额度）"""
    from datetime import date

    global _api_call_counts, _api_call_date
    today = str(date.today())
    if _api_call_date != today:
        _api_call_counts = {}
        _api_call_date = today
    limit = int(os.getenv("VIDEO_EXTRACT_DAILY_LIMIT", "200"))
    count = sum(_api_call_counts.values())
    if count >= limit:
        raise RuntimeError(
            f"今日视频提取已达上限（{limit} 次），请明天再试。"
            "如需提高限额请联系管理员调整 VIDEO_EXTRACT_DAILY_LIMIT。"
        )


def _record_api_call(platform: str) -> None:
    """记录一次 API 调用"""
    _api_call_counts[platform] = _api_call_counts.get(platform, 0) + 1
    count = sum(_api_call_counts.values())
    limit = int(os.getenv("VIDEO_EXTRACT_DAILY_LIMIT", "200"))
    logger.info(f"[api] 今日调用: {count}/{limit} (平台: {platform})")


def _download_via_api(url: str, output_dir: str) -> tuple[str, dict]:
    """通过 media-parser 解析视频链接 → 下载视频 → 提取 16kHz mono WAV。返回 (wav_path, info_dict)

    media-parser 是自部署的开源解析服务，支持抖音/快手/视频号等 26 个平台。
    https://github.com/ucmao/media-parser
    """
    import subprocess

    platform = _classify_platform(url)
    _check_daily_limit()

    # 检查缓存
    cache_key = url.strip()
    cached = _url_download_cache.get(cache_key)
    if cached:
        cached_wav, cached_info, cached_time = cached
        if time.time() - cached_time < _URL_CACHE_TTL_SEC and os.path.isfile(cached_wav):
            logger.info(f"[api:{platform}] 使用缓存: {url}")
            return cached_wav, cached_info

    base_url = _get_media_parser_base_url()
    api_url = f"{base_url}/api/parse"

    logger.info(f"[api:{platform}] 请求 media-parser 解析: {url}")

    # 1) 调用 media-parser 解析视频链接
    resp = httpx.post(api_url, json={"text": url}, timeout=30.0)
    resp.raise_for_status()
    data = resp.json()

    _record_api_call(platform)

    # 2) 解析响应
    if not data.get("succ") and data.get("code") != 200:
        msg = data.get("msg", "解析失败")
        raise RuntimeError(f"media-parser 解析失败: {msg}")

    result = data.get("data") or {}
    download_url = (result.get("video_url") or "").strip()
    title = (result.get("title") or "").strip()
    author_info = result.get("author") or {}
    author_name = (author_info.get("nickname") or "").strip()

    if not download_url:
        raise RuntimeError(
            f"media-parser 未返回视频下载地址。平台={platform}，响应: "
            f"{json.dumps(data, ensure_ascii=False)[:300]}"
        )

    logger.info(f"[api:{platform}] 下载视频: {download_url[:80]}...")

    # 3) 下载视频文件
    video_ext = ".mp4"
    video_path = os.path.join(output_dir, f"api_video_{uuid.uuid4().hex[:8]}{video_ext}")

    with httpx.stream("GET", download_url, timeout=180.0, follow_redirects=True) as stream:
        stream.raise_for_status()
        with open(video_path, "wb") as f:
            for chunk in stream.iter_bytes(chunk_size=8192):
                f.write(chunk)

    file_size = os.path.getsize(video_path)
    logger.info(f"[api:{platform}] 视频下载完成: {file_size} bytes")

    # 4) 用 ffmpeg 提取 16kHz mono WAV
    ffmpeg_exe = _resolve_ffmpeg()
    wav_path = os.path.join(output_dir, f"api_audio_{uuid.uuid4().hex[:8]}.wav")

    cmd = [
        ffmpeg_exe, "-y",
        "-i", video_path,
        "-vn",
        "-ac", "1",
        "-ar", "16000",
        "-sample_fmt", "s16",
        wav_path,
    ]
    try:
        subprocess.run(cmd, check=True, capture_output=True, text=True, timeout=300)
    except subprocess.CalledProcessError as e:
        raise RuntimeError(f"从视频提取音频失败: {e.stderr}") from e

    if not os.path.isfile(wav_path) or os.path.getsize(wav_path) == 0:
        raise RuntimeError("从视频提取音频失败：输出文件为空")

    # 5) 清理临时视频文件
    try:
        os.remove(video_path)
    except OSError:
        pass

    # 6) 组装返回信息
    display_title = title or author_name or f"{platform} 视频"
    result_info: dict = {"title": display_title, "duration": 0}
    _url_download_cache[cache_key] = (wav_path, result_info, time.time())

    logger.info(f"[api:{platform}] 音频提取完成: {os.path.getsize(wav_path)} bytes")
    return wav_path, result_info


# ── yt-dlp 视频处理 ─────────────────────────────────────────────

@dataclass
class ExtractResult:
    text: str = ""
    title: str = ""
    duration: float = 0.0
    source: str = ""  # "subtitles" | "asr"


def _build_ydl_opts(output_dir: str, extract_audio: bool = False) -> dict[str, Any]:
    """构建 yt-dlp 选项"""
    opts: dict[str, Any] = {
        "quiet": True,
        "no_warnings": True,
        "ignoreerrors": True,
        "retries": 3,
        "outtmpl": os.path.join(output_dir, "%(title).80s_%(id)s.%(ext)s"),
    }
    if extract_audio:
        opts.update({
            "format": "bestaudio/best",
            "postprocessors": [{
                "key": "FFmpegExtractAudio",
                "preferredcodec": "wav",
                "preferredquality": "0",
            }],
            "postprocessor_args": ["-ac", "1", "-ar", "16000"],
        })
    else:
        opts["format"] = "best[height<=1080]"
    return opts


def _normalize_outtmpl(outtmpl: object) -> str:
    """yt-dlp 可能在 extract_info 后将 outtmpl 从 str 转为 dict[default/chapter]，统一还原为 str"""
    if isinstance(outtmpl, dict):
        return str(outtmpl.get("default", ""))
    if isinstance(outtmpl, str):
        return outtmpl
    return ""


def _find_output_wav(info: dict, opts: dict) -> str | None:
    """根据 yt-dlp info 推测输出的 WAV 文件路径"""
    import glob as _glob
    import fnmatch as _fnmatch
    outtmpl = _normalize_outtmpl(opts.get("outtmpl", ""))
    if outtmpl:
        base = outtmpl.rsplit(".", 1)[0] if "." in outtmpl else outtmpl
        wav_pattern = base + ".wav"
        matches = _glob.glob(wav_pattern)
        if matches:
            return matches[0]
    out_dir = os.path.dirname(outtmpl) if outtmpl else tempfile.gettempdir()
    for f in os.listdir(out_dir):
        if _fnmatch.fnmatch(f, "*.wav"):
            path = os.path.join(out_dir, f)
            if os.path.getmtime(path) > time.time() - 120:
                return path
    return None


def extract_video_info(url: str) -> dict[str, Any]:
    """仅获取视频元信息（不下载）"""
    ydl_opts = {
        "quiet": True,
        "no_warnings": True,
        "skip_download": True,
        "noplaylist": True,
    }
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(url, download=False)
    return {
        "title": info.get("title", ""),
        "duration": info.get("duration") or 0,
        "extractor": info.get("extractor", ""),
        "subtitles": list(info.get("subtitles", {}).keys()),
        "automatic_captions": list(info.get("automatic_captions", {}).keys()),
    }


def extract_subtitles_sync(url: str) -> str | None:
    """
    同步提取已有字幕（B站等平台），返回纯文本或 None。
    优先手动字幕，其次自动生成字幕。
    """
    lang_order = ["zh-Hans", "zh-CN", "zh", "zh-TW", "en"]
    ydl_opts = {
        "quiet": True,
        "no_warnings": True,
        "skip_download": True,
        "writesubtitles": True,
        "writeautomaticsub": True,
        "subtitlesformat": "srt",
        "subtitleslangs": lang_order,
        "outtmpl": os.path.join(tempfile.gettempdir(), "sub_%(id)s.%(ext)s"),
    }
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=True)
    except Exception:
        return None

    subs = info.get("subtitles") or {}
    auto_subs = info.get("automatic_captions") or {}

    for lang in lang_order:
        entries = subs.get(lang) or auto_subs.get(lang)
        if not entries:
            continue
        for entry in entries:
            sub_url = entry.get("url")
            if not sub_url:
                continue
            try:
                resp = httpx.get(sub_url, timeout=30.0)
                resp.raise_for_status()
                text = _parse_subtitle_raw(resp.text, entry.get("ext", ""))
                if text and len(text.strip()) > 10:
                    return text.strip()
            except Exception:
                continue

    import glob as _glob
    outtmpl = _normalize_outtmpl(ydl_opts.get("outtmpl", ""))
    if outtmpl:
        base = outtmpl.rsplit(".", 1)[0]
        for ext in ["srt", "vtt"]:
            for f in _glob.glob(base + f".*.{ext}"):
                try:
                    with open(f, "r", encoding="utf-8") as fp:
                        text = _parse_subtitle_raw(fp.read(), ext)
                    if text and len(text.strip()) > 10:
                        return text.strip()
                except Exception:
                    pass
    return None


def _parse_subtitle_raw(raw: str, ext: str) -> str:
    """从字幕原始文本中提取纯文本"""
    import re
    ext_lower = (ext or "").lower()
    if "json" in ext_lower or raw.strip().startswith("{"):
        try:
            data = json.loads(raw)
            events = data.get("events", [])
            lines: list[str] = []
            for ev in events:
                segs = ev.get("segs") or []
                for seg in segs:
                    txt = (seg.get("utf8") or "").strip()
                    if txt and txt != "\n":
                        lines.append(txt)
            return "\n".join(lines)
        except (json.JSONDecodeError, TypeError):
            pass

    cleaned: list[str] = []
    for line in raw.split("\n"):
        line = line.strip()
        if (not line
            or re.match(r"^\d+$", line)
            or re.match(r"^\d{2}:\d{2}:", line)
            or line.startswith("WEBVTT")
            or line.startswith("NOTE")
            or re.match(r"^<[^>]+>$", line)):
            continue
        line = re.sub(r"<[^>]+>", "", line)
        line = line.strip()
        if line:
            cleaned.append(line)
    return "\n".join(cleaned)


def download_audio_sync(url: str, output_dir: str) -> tuple[str, dict]:
    """下载视频并提取音频为 16kHz mono WAV。返回 (wav_path, info_dict)

    优先使用 yt-dlp（免费），对需登录态的平台自动 fallback 到第三方 API。
    """
    platform = _classify_platform(url)

    # 对需要登录态的平台，优先尝试 media-parser（如果已配置）
    if platform in _API_REQUIRED_PLATFORMS:
        mp_base = (os.getenv("MEDIA_PARSER_BASE_URL") or "").strip()
        if mp_base:
            try:
                return _download_via_api(url, output_dir)
            except Exception as api_err:
                logger.warning(f"[{platform}] media-parser 下载失败，回退 yt-dlp: {api_err}")
        else:
            logger.info(f"[{platform}] 未配置 MEDIA_PARSER_BASE_URL，尝试 yt-dlp")

    # 原有 yt-dlp 路径
    opts = _build_ydl_opts(output_dir, extract_audio=True)
    with yt_dlp.YoutubeDL(opts) as ydl:
        info = ydl.extract_info(url, download=True)

    wav_path = _find_output_wav(info, opts)
    if not wav_path:
        # 常见原因：抖音/B站等平台需要浏览器 Cookie；视频已删除/私密；ffmpeg 未安装
        extractor = info.get("extractor_key", "") if isinstance(info, dict) else ""
        if "douyin" in extractor.lower() or "tiktok" in extractor.lower():
            raise RuntimeError(
                "抖音视频下载失败：平台要求登录态才能下载。"
                "请配置 MEDIA_PARSER_BASE_URL 启用 media-parser 解析下载，"
                "或尝试从已登录设备复制分享链接重试。"
            )
        if platform in _API_REQUIRED_PLATFORMS:
            raise RuntimeError(
                f"该平台（{platform}）需要 media-parser 才能下载视频。"
                "请配置 MEDIA_PARSER_BASE_URL 后重试。"
            )
        raise RuntimeError(
            "未能下载视频音频。可能原因：1) 平台需要登录/Cookie；2) 视频已删除或设为私密；"
            "3) ffmpeg 未正确安装。请检查后重试。"
        )

    return wav_path, {
        "title": info.get("title", ""),
        "duration": info.get("duration") or 0,
    }


def extract_audio_from_local_video(video_path: str, output_dir: str) -> str:
    """从本地视频文件提取音频为 16kHz mono WAV。返回 WAV 文件路径"""
    import subprocess

    os.makedirs(output_dir, exist_ok=True)
    basename = os.path.splitext(os.path.basename(video_path))[0]
    wav_path = os.path.join(output_dir, f"{basename}_16k.wav")
    ffmpeg_exe = _resolve_ffmpeg()

    cmd = [
        ffmpeg_exe, "-y",
        "-i", video_path,
        "-vn",
        "-ac", "1",
        "-ar", "16000",
        "-sample_fmt", "s16",
        wav_path,
    ]
    try:
        subprocess.run(cmd, check=True, capture_output=True, text=True, timeout=300)
    except subprocess.CalledProcessError as e:
        raise RuntimeError(f"音频提取失败: {e.stderr}") from e

    if not os.path.isfile(wav_path) or os.path.getsize(wav_path) == 0:
        raise RuntimeError("音频提取失败：输出文件为空")

    return wav_path


def _resolve_ffmpeg() -> str:
    """查找 ffmpeg 可执行文件路径"""
    import shutil
    import sys

    project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    if sys.platform == "win32":
        candidates = [os.path.join(project_root, "tools", "ffmpeg", "bin", "ffmpeg.exe")]
    else:
        candidates = [os.path.join(project_root, "tools", "ffmpeg", "bin", "ffmpeg")]

    for c in candidates:
        if os.path.isfile(c):
            return c

    system_ffmpeg = shutil.which("ffmpeg")
    if system_ffmpeg:
        return system_ffmpeg

    raise RuntimeError("未找到 ffmpeg：请将 ffmpeg 放入 tools/ffmpeg/bin/ 或添加到系统 PATH")


# ── 文案提取任务流程 ────────────────────────────────────────────

@dataclass
class ExtractionTask:
    task_id: str = field(default_factory=lambda: f"extract_{int(time.time()*1000)}_{uuid.uuid4().hex[:6]}")
    status: str = "queued"
    step: str = "准备中"
    progress: int = 0
    text: str = ""
    title: str = ""
    duration: float = 0.0
    source: str = ""
    error: str = ""


_extract_tasks: dict[str, ExtractionTask] = {}


def get_extract_task(task_id: str) -> ExtractionTask | None:
    return _extract_tasks.get(task_id)


# ── 智凌 API 文案提取（抖音/快手/视频号，含视频解析+语音转文字）──

_ZHILING_BASE = "https://api.17zhiling.com/api/asr"
_ZHILING_POLL_INTERVAL = 3     # 轮询间隔（秒）
_ZHILING_POLL_TIMEOUT = 180    # 最长等待（秒）


def _get_zhiling_key() -> str | None:
    """获取智凌 API Key，未配置时返回 None"""
    key = (os.getenv("ZHILING_API_KEY") or "").strip()
    return key if key else None


def _submit_zhiling_asr(url: str) -> str:
    """提交视频链接到智凌 ASR 服务，返回 taskId"""
    key = _get_zhiling_key()
    if not key:
        raise RuntimeError("未配置 ZHILING_API_KEY")

    api_url = f"{_ZHILING_BASE}/parse-video-url-time?key={key}"
    resp = httpx.post(
        api_url,
        data={"videoUrl": url},
        headers={"Content-Type": "application/x-www-form-urlencoded; charset=utf-8"},
        timeout=30.0,
    )
    resp.raise_for_status()
    result = resp.json()

    if result.get("code") != 200:
        raise RuntimeError(f"智凌 API 提交失败: {result.get('msg', '未知错误')}")

    task_id = result.get("data")
    if not task_id:
        raise RuntimeError(f"智凌 API 未返回任务ID: {json.dumps(result, ensure_ascii=False)[:300]}")

    logger.info(f"[zhiling] 任务提交成功: {task_id}")
    return str(task_id)


async def _poll_zhiling_result(task_id: str) -> str:
    """轮询智凌 ASR 任务结果，返回识别文本"""
    key = _get_zhiling_key()
    if not key:
        raise RuntimeError("未配置 ZHILING_API_KEY")

    import asyncio

    api_url = f"{_ZHILING_BASE}/task-status"
    deadline = time.time() + _ZHILING_POLL_TIMEOUT

    while time.time() < deadline:
        resp = httpx.get(api_url, params={"key": key, "taskId": task_id}, timeout=15.0)
        resp.raise_for_status()
        result = resp.json()

        if result.get("code") != 200:
            raise RuntimeError(f"智凌 API 查询失败: {result.get('msg', '未知错误')}")

        data = result.get("data") or {}
        schedule = (data.get("schedule") or "").upper()

        if schedule == "SUCCESS":
            content = (data.get("content") or "").strip()
            if content:
                logger.info(f"[zhiling] 识别成功: {len(content)} 字")
                return content
            raise RuntimeError("智凌 API 返回成功但内容为空")

        if schedule == "FAIL":
            raise RuntimeError("智凌 API 识别失败")

        # WAIT_HANDLE / ING → 继续轮询
        await asyncio.sleep(_ZHILING_POLL_INTERVAL)

    raise RuntimeError(f"智凌 API 轮询超时（{_ZHILING_POLL_TIMEOUT}s）")


async def run_extraction(task_id: str, url: str) -> None:
    """异步执行文案提取：字幕优先 → 智凌 ASR（抖音等） → 音频下载 + NLS → 完成"""
    task = _extract_tasks.get(task_id)
    if not task:
        return

    try:
        task.status = "downloading"
        task.step = "下载中"
        task.progress = 10

        logger.info(f"[extract:{task_id}] 尝试提取字幕: {url}")
        subtitle_text = extract_subtitles_sync(url)
        if subtitle_text:
            task.text = subtitle_text
            task.source = "subtitles"
            try:
                info = extract_video_info(url)
                task.title = info.get("title", "")
                task.duration = info.get("duration", 0)
            except Exception:
                pass
            task.status = "completed"
            task.step = "完成"
            task.progress = 100
            logger.info(f"[extract:{task_id}] 字幕提取成功 ({len(subtitle_text)} 字)")
            return

        task.progress = 20

        # 对抖音/快手/视频号等平台，优先使用智凌 ASR API（视频解析 + 语音转文字一步到位）
        platform = _classify_platform(url)
        zhiling_key = _get_zhiling_key()
        if platform in _API_REQUIRED_PLATFORMS and zhiling_key:
            logger.info(f"[extract:{task_id}] 使用智凌 ASR API: {platform}")
            task.status = "transcribing"
            task.step = "识别中"
            task.progress = 30

            zhiling_task_id = _submit_zhiling_asr(url)
            task.progress = 40
            logger.info(f"[extract:{task_id}] 智凌 ASR 任务已提交: {zhiling_task_id}")

            text = await _poll_zhiling_result(zhiling_task_id)
            task.text = text
            task.source = "asr"
            task.status = "completed"
            task.step = "完成"
            task.progress = 100
            logger.info(f"[extract:{task_id}] 智凌 ASR 完成 ({len(text)} 字)")
            return

        # 兜底：yt-dlp 下载视频 → 阿里云 NLS 语音识别
        logger.info(f"[extract:{task_id}] 无字幕，下载音频…")

        with tempfile.TemporaryDirectory(prefix="video_extract_") as tmpdir:
            wav_path, info = download_audio_sync(url, tmpdir)
            task.title = info.get("title", "")
            task.duration = info.get("duration", 0)
            task.progress = 60

            task.status = "transcribing"
            task.step = "识别中"
            task.progress = 70

            logger.info(f"[extract:{task_id}] FlashRecognizer 识别中（{task.duration:.0f}s）")
            text = await _aliyun_nls_transcribe(wav_path)
            task.text = text
            task.source = "asr"
            task.status = "completed"
            task.step = "完成"
            task.progress = 100
            logger.info(f"[extract:{task_id}] 识别成功 ({len(text)} 字)")

    except Exception as e:
        task.status = "failed"
        task.step = "失败"
        task.error = str(e)
        logger.error(f"[extract:{task_id}] 提取失败: {e}")


def create_extract_task(url: str) -> ExtractionTask:
    """创建提取任务并存入内存"""
    task = ExtractionTask()
    task.status = "queued"
    task.step = "准备中"
    _extract_tasks[task.task_id] = task
    return task
