#!/usr/bin/env python3
"""
Run parity check against the in-process FastAPI app using httpx.ASGITransport.

This avoids needing a running server — it drives the app directly.
"""
from __future__ import annotations

import asyncio
import json
import os
import re
import sys
from pathlib import Path

os.environ.setdefault("SECRET_KEY", "parity-test-secret-key-32-chars!!")
os.environ.setdefault("APP_MODE", "api")
os.environ.setdefault("ENV", "development")
os.environ.setdefault("MONGO_DB_CONNECTION_STRING", "")
os.environ.setdefault("DB_CONNECTION", "")

import httpx
from mongomock_motor import AsyncMongoMockClient

# Patch the database module to use mongomock
import app.platform.database as _db_mod

_mock_client = AsyncMongoMockClient()
_mock_db = _mock_client["seeds_parity"]
_db_mod._database = _mock_db  # type: ignore[assignment]

from app.main import app  # noqa: E402
from app.platform.auth.dependencies import get_db  # noqa: E402


async def _override_db():
    yield _mock_db


app.dependency_overrides[get_db] = _override_db

# ---------------------------------------------------------------------------
# Minimal dummy bodies
# ---------------------------------------------------------------------------
_DUMMY_BODIES = {
    "/teacher/login": {"phoneNumber": "0000000000", "password": "wrong"},
    "/teacher/register": {"phoneNumber": "0000000000", "password": "Wr0ng!pw", "name": "T"},
    "/tenant/login": {"email": "no@example.com", "password": "wrong"},
    "/tenant/register": {"email": "parity@x.com", "password": "Wr0ng!pw", "tenantName": "T", "name": "T"},
    "/tenant/analytics": {"startDate": "2024-01-01T00:00:00", "endDate": "2024-12-31T00:00:00"},
    "/tenant/change-password": {"newPassword": "Wr0ng!pw2"},
    "/school/admin/login": {"email": "no@example.com", "password": "wrong"},
    "/school": {"name": "S", "email": "s@parity.com", "password": "Wr0ng!pw"},
    "/school/transfer": {"teacherId": "000000000000000000000001", "targetSchoolId": "000000000000000000000002"},
    "/school/analytics": {"startDate": "2024-01-01T00:00:00", "endDate": "2024-12-31T00:00:00"},
    "/student": {"name": "S", "phoneNumber": "0000000000"},
    "/class": {"name": "C"},
}


def _resolve_path(path: str) -> str:
    return re.sub(r"\{[^}]+\}", "000000000000000000000001", path)


async def run() -> int:
    contract_path = Path(__file__).parent / "golden_contracts" / "backend_p1.json"
    contract = json.loads(contract_path.read_text())
    endpoints = contract.get("endpoints", [])

    print(f"Parity check: {contract.get('description', 'backend_p1')}")
    print("Transport:    in-process ASGITransport (mongomock-motor)")
    print(f"Endpoints:    {len(endpoints)}")
    print("-" * 70)

    passed = 0
    failed = 0
    failures = []

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        for ep in endpoints:
            method = ep["method"].upper()
            raw_path = ep["path"]
            required_auth = ep["required_auth"]
            path = _resolve_path(raw_path)

            headers = {}
            body = None

            if required_auth:
                headers["Authorization"] = "Bearer invalid_token_for_parity"
            else:
                body = _DUMMY_BODIES.get(raw_path)

            try:
                if method == "GET":
                    r = await client.get(path, headers=headers)
                elif method == "POST":
                    r = await client.post(path, json=body or {}, headers=headers)
                elif method == "PATCH":
                    r = await client.patch(path, json=body or {}, headers=headers)
                elif method == "DELETE":
                    r = await client.delete(path, headers=headers)
                else:
                    print(f"  SKIP  {method} {raw_path} (unsupported method)")
                    continue
            except Exception as exc:
                msg = f"{method} {raw_path} → ERROR: {exc}"
                print(f"  FAIL  {msg}")
                failed += 1
                failures.append(msg)
                continue

            status = r.status_code

            if required_auth:
                if status in (401, 403):
                    msg = f"{method} {raw_path} → {status} (auth enforced OK)"
                    print(f"  PASS  {msg}")
                    passed += 1
                elif status == 404:
                    msg = f"{method} {raw_path} → 404 (ROUTE NOT FOUND)"
                    print(f"  FAIL  {msg}")
                    failed += 1
                    failures.append(msg)
                elif 400 <= status < 500:
                    msg = f"{method} {raw_path} → {status} (route exists)"
                    print(f"  PASS  {msg}")
                    passed += 1
                else:
                    msg = f"{method} {raw_path} → {status} (unexpected)"
                    print(f"  FAIL  {msg}")
                    failed += 1
                    failures.append(msg)
            else:
                expected = ep["expected_status_codes"]
                if status in expected or status == 422:
                    msg = f"{method} {raw_path} → {status} (OK)"
                    print(f"  PASS  {msg}")
                    passed += 1
                elif status == 404:
                    msg = f"{method} {raw_path} → 404 (ROUTE NOT FOUND)"
                    print(f"  FAIL  {msg}")
                    failed += 1
                    failures.append(msg)
                else:
                    msg = f"{method} {raw_path} → {status} (expected {expected})"
                    print(f"  FAIL  {msg}")
                    failed += 1
                    failures.append(msg)

    print("-" * 70)
    print(f"Results: {passed} passed, {failed} failed out of {len(endpoints)} endpoints")

    if failures:
        print("\nFailed:")
        for f in failures:
            print(f"  {f}")
        return 1

    print("\nAll endpoints passed parity check.")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(run()))
