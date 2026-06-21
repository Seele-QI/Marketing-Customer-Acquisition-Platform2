"""邮件发送：SMTP（QQ邮箱/163/阿里云）→ Resend → dev 模式降级。"""
import logging
import os
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

log = logging.getLogger("email")


def _is_dev_mode() -> bool:
    """开发模式判断（延迟调用，确保 load_dotenv 已执行）。"""
    if os.getenv("DEV_EMAIL_MODE", "0") == "1":
        return True
    if os.getenv("SMTP_HOST") or os.getenv("RESEND_API_KEY"):
        return False
    return True  # 无任何发信配置 → dev 模式


def _render_code_html(code: str) -> str:
    """验证码邮件 HTML 模板。"""
    return (
        '<div style="font-family:sans-serif;max-width:480px;margin:auto;padding:24px">'
        '<h2 style="color:#111;margin:0 0 16px">登录 AgentHub</h2>'
        '<p style="color:#444;line-height:1.6">您的登录验证码是：</p>'
        f'<p style="font-size:32px;font-weight:bold;letter-spacing:6px;font-family:ui-monospace,Menlo,Consolas,monospace;color:#111;background:#f5f5f5;padding:16px 24px;border-radius:8px;display:inline-block;margin:16px 0">{code}</p>'
        '<p style="color:#444;line-height:1.6">5 分钟内有效。请勿将验证码告诉他人。</p>'
        '<p style="color:#888;font-size:13px;margin-top:24px">如果不是您本人操作，请忽略此邮件。</p>'
        '</div>'
    )


def _send_smtp(email: str, code: str) -> bool:
    """通过 SMTP 发送（QQ邮箱 / 163 / 阿里云等）。"""
    host = os.getenv("SMTP_HOST", "").strip()
    port = int(os.getenv("SMTP_PORT", "465"))
    user = os.getenv("SMTP_USER", "").strip()
    password = os.getenv("SMTP_PASSWORD", "").strip()
    from_addr = os.getenv("SMTP_FROM", f"AgentHub <{user}>").strip()

    log.info("[SMTP] host=%r port=%d user=%r from=%r", host, port, user, from_addr)

    if not host or not user or not password:
        log.warning("[SMTP] 缺少配置: host=%r user=%r password_set=%s", host, user, bool(password))
        return False

    msg = MIMEMultipart("alternative")
    msg["Subject"] = "登录 AgentHub"
    msg["From"] = from_addr
    msg["To"] = email

    msg.attach(MIMEText(_render_code_html(code), "html", "utf-8"))

    try:
        if port == 465:
            server = smtplib.SMTP_SSL(host, port, timeout=15)
        else:
            server = smtplib.SMTP(host, port, timeout=15)
            server.starttls()
        server.login(user, password)
        server.sendmail(from_addr, [email], msg.as_string())
        server.quit()
        log.info("SMTP code email sent to %s via %s:%s", email, host, port)
        return True
    except Exception:
        log.exception("SMTP send failed to=%s via %s", email, host)
        return False


def _send_resend(email: str, code: str) -> bool:
    """通过 Resend API 发送。"""
    api_key = os.getenv("RESEND_API_KEY", "").strip()
    from_addr = os.getenv("RESEND_FROM", "AgentHub <onboarding@resend.dev>").strip()
    if not api_key:
        return False
    try:
        import resend
        resend.api_key = api_key
        resp = resend.Emails.send({
            "from": from_addr,
            "to": [email],
            "subject": "登录 AgentHub",
            "html": _render_code_html(code),
        })
        log.info("Resend code email sent to %s resp=%s", email, resp)
        return True
    except ImportError:
        log.warning("resend package not installed")
        return False
    except Exception:
        log.exception("Resend send failed to=%s", email)
        return False


def send_login_code(email: str, code: str) -> bool:
    """
    发送登录验证码邮件。
    优先级：SMTP > Resend > dev 日志
    返回 True 表示发送成功（dev 模式视为成功），False 表示失败。
    """
    if _is_dev_mode():
        log.warning("[DEV-CODE] to=%s code=%s (DEV_EMAIL_MODE=1, not sent)", email, code)
        return True

    # 1) 优先 SMTP
    if os.getenv("SMTP_HOST"):
        return _send_smtp(email, code)

    # 2) 其次 Resend
    if os.getenv("RESEND_API_KEY"):
        if _send_resend(email, code):
            return True

    # 3) 都没有 → 自动 fallback 到 dev 日志
    log.warning("[DEV-CODE] to=%s code=%s (no SMTP or Resend configured, not sent)", email, code)
    return True
