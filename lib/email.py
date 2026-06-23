"""Resend 邮件包装。DEV_EMAIL_MODE=1 时链接打到日志，不真发。"""
import logging
import os

log = logging.getLogger("email")

DEV_MODE = os.getenv("DEV_EMAIL_MODE", "0") == "1"


def send_login_link(email: str, link: str) -> bool:
    """发送登录链接邮件。dev 模式下返回 True 不真发。"""
    if DEV_MODE:
        log.warning("[DEV-EMAIL] to=%s link=%s (DEV_EMAIL_MODE=1, not sent)", email, link)
        return True

    api_key = os.getenv("RESEND_API_KEY", "")
    from_addr = os.getenv("RESEND_FROM", "AgentHub <onboarding@resend.dev>")
    if not api_key:
        log.error("RESEND_API_KEY env var missing")
        return False

    try:
        import resend
        resend.api_key = api_key
        params = {
            "from": from_addr,
            "to": [email],
            "subject": "登录 AgentHub",
            "html": (
                '<div style="font-family:sans-serif;max-width:480px;margin:auto;padding:24px">'
                '<h2 style="color:#111;margin:0 0 16px">登录 AgentHub</h2>'
                '<p style="color:#444;line-height:1.6">点击下方按钮登录（15 分钟内有效）：</p>'
                f'<p style="margin:24px 0"><a href="{link}" style="background:#111;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block">登录 AgentHub</a></p>'
                '<p style="color:#888;font-size:13px">如果不是您本人操作，请忽略此邮件。</p>'
                '</div>'
            ),
        }
        resp = resend.Emails.send(params)
        log.info("email sent to %s resp=%s", email, resp)
        return True
    except Exception:
        log.exception("email send failed to=%s", email)
        return False