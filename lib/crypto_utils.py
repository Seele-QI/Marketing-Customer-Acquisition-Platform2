"""
AES 加密/解密工具 — Cookie 安全存储（AES-256-GCM）

用法:
    encrypted, iv = encrypt_cookie(cookie_json_str)
    plaintext = decrypt_cookie(encrypted, iv)
"""

import os
import base64
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes


_GCM_TAG_SIZE = 16


def _get_key() -> bytes:
    """从环境变量获取 AES-256 密钥（必须至少 32 字节）。"""
    env_key = (os.getenv("COOKIE_ENCRYPTION_KEY") or "").strip()
    if len(env_key) >= 32:
        return env_key.encode()[:32]
    raise RuntimeError(
        "COOKIE_ENCRYPTION_KEY 未配置或长度不足（需要至少 32 个字符）。"
        "请在 .env 中设置一个强随机密钥后重启服务。"
    )


def encrypt_cookie(data: str) -> tuple[str, str]:
    """
    AES-256-GCM 加密 Cookie 字符串。

    返回: (base64_ciphertext_with_tag, base64_iv)
    其中 ciphertext 末尾会附带 GCM 认证标签，解密时需要一并拆出。
    """
    key = _get_key()
    iv = os.urandom(12)  # GCM 推荐 12 字节 nonce

    cipher = Cipher(algorithms.AES(key), modes.GCM(iv))
    encryptor = cipher.encryptor()
    ciphertext = encryptor.update(data.encode()) + encryptor.finalize()
    ciphertext_with_tag = ciphertext + encryptor.tag

    return base64.b64encode(ciphertext_with_tag).decode(), base64.b64encode(iv).decode()


def decrypt_cookie(encrypted: str, iv: str) -> str:
    """
    AES-256-GCM 解密 Cookie 字符串。

    输入的 encrypted 需包含密文 + 认证标签（tag）。
    校验失败时会抛出 cryptography.exceptions.InvalidTag。
    """
    key = _get_key()
    encrypted_bytes = base64.b64decode(encrypted)
    iv_bytes = base64.b64decode(iv)

    if len(encrypted_bytes) <= _GCM_TAG_SIZE:
        raise ValueError("加密数据长度非法，缺少 GCM 认证标签")

    ciphertext = encrypted_bytes[:-_GCM_TAG_SIZE]
    tag = encrypted_bytes[-_GCM_TAG_SIZE:]

    cipher = Cipher(algorithms.AES(key), modes.GCM(iv_bytes, tag))
    decryptor = cipher.decryptor()
    plaintext = decryptor.update(ciphertext) + decryptor.finalize()
    return plaintext.decode()
