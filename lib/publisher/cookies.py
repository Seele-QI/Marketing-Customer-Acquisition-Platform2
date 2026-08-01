"""解析账号绑定里保存的 Cookie JSON。"""
import json
from typing import Any, Dict, List


def parse_cookie_payload(raw: str) -> Dict[str, str]:
    text = (raw or "").strip()
    if not text:
        return {}
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        # name=value; name2=value2
        out: Dict[str, str] = {}
        for part in text.split(";"):
            part = part.strip()
            if not part or "=" not in part:
                continue
            k, v = part.split("=", 1)
            out[k.strip()] = v.strip()
        return out

    if isinstance(data, list):
        return playwright_list_to_dict(data)
    if isinstance(data, dict):
        if "cookies" in data and isinstance(data["cookies"], list):
            return playwright_list_to_dict(data["cookies"])
        return {str(k): str(v) for k, v in data.items() if v is not None}
    return {}


def playwright_list_to_dict(items: List[Any]) -> Dict[str, str]:
    out: Dict[str, str] = {}
    for item in items:
        if not isinstance(item, dict):
            continue
        name = str(item.get("name") or "").strip()
        value = str(item.get("value") or "").strip()
        if name:
            out[name] = value
    return out


def to_playwright_cookies(creds: Dict[str, str], domain: str) -> List[Dict[str, Any]]:
    return [
        {"name": k, "value": v, "domain": domain, "path": "/"}
        for k, v in creds.items()
        if k and v is not None
    ]


def playwright_cookies_from_storage(raw: str, fallback_creds: Dict[str, str], *, domain: str) -> List[Dict[str, Any]]:
    """优先使用浏览器登录保存的 Playwright Cookie 数组（含 domain/path）。"""
    text = (raw or "").strip()
    if text:
        try:
            data = json.loads(text)
            if isinstance(data, list):
                out: List[Dict[str, Any]] = []
                for item in data:
                    if not isinstance(item, dict):
                        continue
                    name = str(item.get("name") or "").strip()
                    if not name:
                        continue
                    out.append(
                        {
                            "name": name,
                            "value": str(item.get("value") or ""),
                            "domain": str(item.get("domain") or domain),
                            "path": str(item.get("path") or "/"),
                        }
                    )
                if out:
                    return out
        except json.JSONDecodeError:
            pass
    return to_playwright_cookies(fallback_creds, domain)
