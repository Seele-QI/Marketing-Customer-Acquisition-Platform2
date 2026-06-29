"""Ed25519 signing for central activation responses."""

from __future__ import annotations

import base64
import json
import logging
import os
from typing import Any, Optional

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.serialization import (
    Encoding,
    NoEncryption,
    PrivateFormat,
    PublicFormat,
    load_pem_private_key,
)

logger = logging.getLogger(__name__)


def canonical_activate_payload(
    *,
    plan: str,
    expires_at: float,
    keys: dict[str, str],
    server_time: float,
) -> str:
    """Deterministic JSON bytes for signing (must match Electron verifier)."""
    payload = {
        "expires_at": float(expires_at),
        "keys": {k: str(v) for k, v in sorted(keys.items())},
        "plan": str(plan),
        "server_time": float(server_time),
    }
    return json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def load_signing_key() -> Optional[Ed25519PrivateKey]:
    raw = (os.getenv("CENTRAL_SIGNING_PRIVATE_KEY") or "").strip()
    if not raw:
        return None
    try:
        if raw.startswith("-----"):
            key = load_pem_private_key(raw.encode("utf-8"), password=None)
            if not isinstance(key, Ed25519PrivateKey):
                raise ValueError("CENTRAL_SIGNING_PRIVATE_KEY must be Ed25519")
            return key
        seed = base64.b64decode(raw)
        return Ed25519PrivateKey.from_private_bytes(seed)
    except Exception:
        logger.exception("Failed to load CENTRAL_SIGNING_PRIVATE_KEY")
        return None


def get_public_key_pem() -> str:
    key = load_signing_key()
    if not key:
        return ""
    pub = key.public_key()
    return pub.public_bytes(Encoding.PEM, PublicFormat.SubjectPublicKeyInfo).decode("ascii")


def sign_activate_response(
    *,
    plan: str,
    expires_at: float,
    keys: dict[str, str],
    server_time: float,
) -> tuple[str, str]:
    """Return (base64 signature, key_id). Empty signature if key not configured."""
    key_id = (os.getenv("CENTRAL_SIGNING_KEY_ID") or "v1").strip() or "v1"
    private = load_signing_key()
    if not private:
        logger.warning("CENTRAL_SIGNING_PRIVATE_KEY not set; activate response unsigned")
        return "", key_id

    message = canonical_activate_payload(
        plan=plan,
        expires_at=expires_at,
        keys=keys,
        server_time=server_time,
    ).encode("utf-8")
    signature = base64.b64encode(private.sign(message)).decode("ascii")
    return signature, key_id


def verify_activate_response(
    *,
    plan: str,
    expires_at: float,
    keys: dict[str, str],
    server_time: float,
    signature_b64: str,
    public_key_pem: str,
) -> bool:
    """Server-side test helper mirroring Electron verify."""
    from cryptography.hazmat.primitives.serialization import load_pem_public_key

    if not signature_b64 or not public_key_pem:
        return False
    try:
        pub = load_pem_public_key(public_key_pem.encode("utf-8"))
        message = canonical_activate_payload(
            plan=plan,
            expires_at=expires_at,
            keys=keys,
            server_time=server_time,
        ).encode("utf-8")
        sig = base64.b64decode(signature_b64)
        pub.verify(sig, message)
        return True
    except Exception:
        return False
