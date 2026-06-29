#!/usr/bin/env python3
"""Generate Ed25519 key pair for central activation signing."""

from __future__ import annotations

import argparse
import base64
import sys

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.serialization import Encoding, NoEncryption, PrivateFormat, PublicFormat


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate CENTRAL_SIGNING_* key pair")
    parser.add_argument("--key-id", default="v1", help="CENTRAL_SIGNING_KEY_ID (default: v1)")
    args = parser.parse_args()

    private = Ed25519PrivateKey.generate()
    seed_b64 = base64.b64encode(private.private_bytes_raw()).decode("ascii")
    private_pem = private.private_bytes(Encoding.PEM, PrivateFormat.PKCS8, NoEncryption()).decode("ascii")
    public_pem = (
        private.public_key()
        .public_bytes(Encoding.PEM, PublicFormat.SubjectPublicKeyInfo)
        .decode("ascii")
    )

    print("# Add to central server .env")
    print(f"CENTRAL_SIGNING_KEY_ID={args.key_id}")
    print(f"CENTRAL_SIGNING_PRIVATE_KEY={seed_b64}")
    print()
    print("# Or PEM form (either works in lib/central_signing.py):")
    print(f"# CENTRAL_SIGNING_PRIVATE_KEY={private_pem.strip()!r}")
    print()
    print("# Add to Electron build env (.env.electron-build or CI secret)")
    print("CENTRAL_SIGNING_PUBLIC_KEY=" + public_pem.replace("\n", "\\n"))
    return 0


if __name__ == "__main__":
    sys.exit(main())
