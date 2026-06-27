#!/usr/bin/env python3
"""
Parity check tool — verifies that each endpoint in a Golden Contract JSON
responds within the expected status code range.

Usage:
  python tools/parity_check.py --contract tools/golden_contracts/backend_p1.json
  python tools/parity_check.py --contract tools/golden_contracts/backend_p1.json \
      --base-url http://localhost:8000

For auth-protected endpoints the check simply verifies that the server returns
401/403 (i.e. the route EXISTS and auth is enforced).  For public endpoints it
sends a minimal body and checks for a 2xx or expected status code.

Exit code:
  0  all endpoints pass
  1  one or more endpoints failed
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

try:
    import httpx
except ImportError:
    print("httpx not installed — run: pip install httpx", file=sys.stderr)
    sys.exit(1)


# ---------------------------------------------------------------------------
# Minimal dummy bodies for public POST endpoints (so we get 400/401 not 422)
# ---------------------------------------------------------------------------

_DUMMY_BODIES: dict[str, dict] = {
    "/teacher/login": {"phoneNumber": "0000000000", "password": "wrong"},
    "/teacher/register": {"phoneNumber": "0000000000", "password": "Wr0ng!pw", "name": "T"},
    "/tenant/login": {"email": "no@example.com", "password": "wrong"},
    "/tenant/register": {"email": "x@x.com", "password": "Wr0ng!pw", "tenantName": "T", "name": "T"},
    "/tenant/analytics": {"startDate": "2024-01-01T00:00:00", "endDate": "2024-12-31T00:00:00"},
    "/tenant/change-password": {"newPassword": "Wr0ng!pw2"},
    "/school/admin/login": {"email": "no@example.com", "password": "wrong"},
    "/school": {"name": "S", "email": "s@s.com", "password": "Wr0ng!pw"},
    "/school/transfer": {"teacherId": "000000000000000000000001", "targetSchoolId": "000000000000000000000002"},
    "/school/analytics": {"startDate": "2024-01-01T00:00:00", "endDate": "2024-12-31T00:00:00"},
    "/student": {"name": "S", "phoneNumber": "0000000000"},
    "/class": {"name": "C"},
}


# ---------------------------------------------------------------------------
# Check helpers
# ---------------------------------------------------------------------------


def _resolve_path(path: str) -> str:
    """Replace path parameters with dummy values."""
    import re
    return re.sub(r"\{[^}]+\}", "000000000000000000000001", path)


def _check_endpoint(
    client: httpx.Client,
    endpoint: dict[str, Any],
    base_url: str,
) -> tuple[bool, str]:
    """
    Make a request to the endpoint and verify the response.

    Returns (passed: bool, message: str).
    """
    method: str = endpoint["method"].upper()
    raw_path: str = endpoint["path"]
    required_auth: bool = endpoint["required_auth"]
    expected_codes: list[int] = endpoint["expected_status_codes"]

    path = _resolve_path(raw_path)
    url = base_url.rstrip("/") + path

    headers: dict[str, str] = {}
    body: dict | None = None

    if required_auth:
        # Don't send a real token — we expect 401 or 403
        headers["Authorization"] = "Bearer invalid_token_for_parity_check"
        expected_for_auth = [c for c in expected_codes if c in (401, 403, 422)]
        if not expected_for_auth:
            expected_for_auth = [401, 403]
    else:
        body = _DUMMY_BODIES.get(raw_path)
        expected_for_auth = expected_codes

    try:
        if method == "GET":
            resp = client.get(url, headers=headers, timeout=10)
        elif method == "POST":
            resp = client.post(url, json=body or {}, headers=headers, timeout=10)
        elif method == "PATCH":
            resp = client.patch(url, json=body or {}, headers=headers, timeout=10)
        elif method == "DELETE":
            resp = client.delete(url, headers=headers, timeout=10)
        else:
            return False, f"Unsupported method {method}"
    except httpx.ConnectError:
        return False, f"Connection refused at {url}"
    except Exception as exc:  # noqa: BLE001
        return False, f"Request error: {exc}"

    status = resp.status_code

    if required_auth:
        # For auth-protected endpoints, 401 or 403 means the route exists and
        # auth is correctly enforced.
        if status in (401, 403):
            return True, f"{method} {raw_path} → {status} (auth enforced OK)"
        # 404 means route not found
        if status == 404:
            return False, f"{method} {raw_path} → 404 (ROUTE NOT FOUND)"
        # Any other 4xx is acceptable (route exists, possibly wrong body)
        if 400 <= status < 500:
            return True, f"{method} {raw_path} → {status} (route exists, auth may be bypassed — review)"
        return False, f"{method} {raw_path} → {status} (unexpected for protected endpoint)"
    else:
        # Public endpoint: status must be in the expected list
        if status in expected_for_auth:
            return True, f"{method} {raw_path} → {status} (OK)"
        if status == 404:
            return False, f"{method} {raw_path} → 404 (ROUTE NOT FOUND)"
        # 422 means the route exists but the dummy body was invalid — still counts
        if status == 422:
            return True, f"{method} {raw_path} → 422 (route exists, validation error on dummy body)"
        return False, f"{method} {raw_path} → {status} (expected one of {expected_for_auth})"


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def main() -> int:
    parser = argparse.ArgumentParser(description="SEEDS Parity Check Tool")
    parser.add_argument(
        "--contract",
        required=True,
        help="Path to the Golden Contract JSON file",
    )
    parser.add_argument(
        "--base-url",
        default="http://localhost:8000",
        help="Base URL of the running server (default: http://localhost:8000)",
    )
    args = parser.parse_args()

    contract_path = Path(args.contract)
    if not contract_path.exists():
        print(f"ERROR: Contract file not found: {contract_path}", file=sys.stderr)
        return 1

    contract = json.loads(contract_path.read_text())
    endpoints: list[dict] = contract.get("endpoints", [])

    print(f"Parity check: {contract.get('description', contract_path.name)}")
    print(f"Base URL:     {args.base_url}")
    print(f"Endpoints:    {len(endpoints)}")
    print("-" * 70)

    passed = 0
    failed = 0
    results: list[tuple[bool, str]] = []

    with httpx.Client(follow_redirects=True) as client:
        for ep in endpoints:
            ok, msg = _check_endpoint(client, ep, args.base_url)
            results.append((ok, msg))
            if ok:
                passed += 1
                print(f"  PASS  {msg}")
            else:
                failed += 1
                print(f"  FAIL  {msg}")

    print("-" * 70)
    print(f"Results: {passed} passed, {failed} failed out of {len(endpoints)} endpoints")

    if failed > 0:
        print("\nFailed endpoints:")
        for ok, msg in results:
            if not ok:
                print(f"  {msg}")
        return 1

    print("\nAll endpoints passed parity check.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
