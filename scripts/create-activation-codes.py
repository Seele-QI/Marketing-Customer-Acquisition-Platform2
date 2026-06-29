#!/usr/bin/env python3
"""Create central activation codes via POST /api/central/admin/codes."""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request


def main() -> int:
    parser = argparse.ArgumentParser(description="Create central activation codes")
    parser.add_argument(
        "--base-url",
        default=os.getenv("CENTRAL_SERVICE_URL", "http://127.0.0.1:8000"),
        help="Central FastAPI base URL",
    )
    parser.add_argument(
        "--admin-key",
        default=os.getenv("CREDIT_ADMIN_ACCESS_KEY", ""),
        help="CREDIT_ADMIN_ACCESS_KEY (X-Admin-Key header)",
    )
    parser.add_argument("--plan", default="standard", help="Plan name in CENTRAL_KEY_POOL_JSON")
    parser.add_argument("--count", type=int, default=1, help="Number of codes to create")
    parser.add_argument("--machine-limit", type=int, default=1, help="Max machines per code")
    parser.add_argument("--expires-in-days", type=int, default=365, help="Code validity in days")
    parser.add_argument("--note", default="", help="Optional note stored with codes")
    args = parser.parse_args()

    if not args.admin_key:
        print("ERROR: set CREDIT_ADMIN_ACCESS_KEY or pass --admin-key", file=sys.stderr)
        return 1

    url = args.base_url.rstrip("/") + "/api/central/admin/codes"
    payload = {
        "plan": args.plan,
        "machine_limit": args.machine_limit,
        "expires_in_days": args.expires_in_days,
        "count": args.count,
        "note": args.note,
    }
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "X-Admin-Key": args.admin_key,
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            body = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", errors="replace")
        print(f"HTTP {e.code}: {detail}", file=sys.stderr)
        return 1
    except urllib.error.URLError as e:
        print(f"Request failed: {e.reason}", file=sys.stderr)
        return 1

    created = body.get("created") or []
    print(json.dumps({"created": created}, ensure_ascii=False, indent=2))
    print(f"\nCreated {len(created)} activation code(s).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
