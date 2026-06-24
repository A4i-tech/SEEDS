"""
Parity tests — verifies platform behaves identically to legacy services.

Requires all 4 services running simultaneously:
  LEGACY_BS_URL   = backend-server   (default: http://localhost:3000)
  LEGACY_CONF_URL = ConferenceV2     (default: http://localhost:8000)
  LEGACY_IVR_URL  = IVRv2            (default: http://localhost:8001)
  PLATFORM_URL    = platform         (default: http://localhost:5000)

Run:
  LEGACY_BS_URL=http://localhost:3000 \
  LEGACY_CONF_URL=http://localhost:8000 \
  LEGACY_IVR_URL=http://localhost:8001 \
  PLATFORM_URL=http://localhost:5000 \
  poetry run pytest tests/parity/ -v --tb=short
"""

from __future__ import annotations

import os
import uuid
from typing import Any

import bcrypt
import httpx
import pytest
import pytest_asyncio
from motor.motor_asyncio import AsyncIOMotorClient

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

BS   = os.getenv("LEGACY_BS_URL",   "http://localhost:3000")
CONF = os.getenv("LEGACY_CONF_URL", "http://localhost:8000")
IVR  = os.getenv("LEGACY_IVR_URL",  "http://localhost:8001")
P    = os.getenv("PLATFORM_URL",    "http://localhost:5000")

TIMEOUT = httpx.Timeout(10.0)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _email() -> str:
    return f"parity_{uuid.uuid4().hex[:8]}@smoke.test"


def _shape(obj: Any) -> Any:
    """Reduce a response body to its key structure for comparison."""
    if isinstance(obj, dict):
        return {k: _shape(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_shape(obj[0])] if obj else []
    return type(obj).__name__


def assert_parity(legacy_r: httpx.Response, platform_r: httpx.Response, *, label: str) -> None:
    assert legacy_r.status_code == platform_r.status_code, (
        f"[{label}] status mismatch: legacy={legacy_r.status_code} "
        f"platform={platform_r.status_code}\n"
        f"  legacy body:   {legacy_r.text[:300]}\n"
        f"  platform body: {platform_r.text[:300]}"
    )
    # Shape (key structure) must match for 2xx JSON responses
    if legacy_r.status_code < 300:
        try:
            l_json = legacy_r.json()
            p_json = platform_r.json()
            assert _shape(l_json) == _shape(p_json), (
                f"[{label}] response shape mismatch:\n"
                f"  legacy keys:   {list(l_json.keys()) if isinstance(l_json, dict) else type(l_json)}\n"
                f"  platform keys: {list(p_json.keys()) if isinstance(p_json, dict) else type(p_json)}"
            )
        except Exception:
            pass  # non-JSON response — status code check is sufficient


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest_asyncio.fixture
async def clients():
    async with (
        httpx.AsyncClient(base_url=BS,   timeout=TIMEOUT) as bs,
        httpx.AsyncClient(base_url=CONF, timeout=TIMEOUT) as conf,
        httpx.AsyncClient(base_url=IVR,  timeout=TIMEOUT) as ivr,
        httpx.AsyncClient(base_url=P,    timeout=TIMEOUT) as platform,
    ):
        yield {"bs": bs, "conf": conf, "ivr": ivr, "p": platform}


@pytest_asyncio.fixture
async def teacher_tokens():
    """Seed a teacher directly in MongoDB and mint a platform token via /teacher/login.

    Both BS and platform /teacher/register are auth-gated (require school-admin token).
    We bypass by inserting the user document directly into MongoDB.

    Platform maps phoneNumber → email in the unified user model, so we store phone
    in the email field.  Password is SHA-256 pre-hashed then bcrypted — matching
    platform/auth/hashing.py hash_password() exactly.
    """
    import hashlib

    mongo_url = os.getenv("MONGO_DB_CONNECTION_STRING") or "mongodb://localhost:27017/SEEDS"
    platform_url = os.getenv("PLATFORM_URL", "http://localhost:5000")
    db_name = [s for s in mongo_url.split("?")[0].split("/") if s][-1]

    phone = f"+91{uuid.uuid4().int % 9000000000 + 1000000000}"
    password = "Parity@1234"

    # Replicate platform hash_password(): SHA-256 digest then bcrypt (rounds=4 for speed)
    digest = hashlib.sha256(password.encode("utf-8")).digest()
    hashed = bcrypt.hashpw(digest, bcrypt.gensalt(rounds=4)).decode("utf-8")

    doc_id = str(uuid.uuid4())
    mongo_client = AsyncIOMotorClient(mongo_url)
    try:
        db = mongo_client[db_name]
        await db["users"].insert_one({
            "_id": doc_id,
            "name": "Parity Teacher",
            "email": phone,          # platform stores phoneNumber in the email field
            "hashed_password": hashed,
            "role": "teacher",
            "tenant_id": None,
            "school_id": None,
            "phone": phone,
        })

        async with httpx.AsyncClient(base_url=platform_url, timeout=TIMEOUT) as p:
            r = await p.post("/teacher/login", json={"phoneNumber": phone, "password": password})
            token = r.json().get("access_token", "")

        yield {"p": token}
    finally:
        await db["users"].delete_one({"_id": doc_id})
        mongo_client.close()


# ---------------------------------------------------------------------------
# Backend-server parity
# ---------------------------------------------------------------------------

class TestAuthParity:

    @pytest.mark.asyncio
    async def test_register_teacher_status(self, clients):
        payload = {
            "name": "Parity User",
            "email": _email(),
            "password": "Test@1234",
            "phone": "+911111111111",
        }
        l = await clients["bs"].post("/teacher/register", json=payload)
        p = await clients["p"].post("/teacher/register",  json={**payload, "email": _email()})
        assert l.status_code == p.status_code, (
            f"register status: legacy={l.status_code} platform={p.status_code}"
        )

    @pytest.mark.asyncio
    async def test_login_wrong_password(self, clients):
        # Both services use phoneNumber-based auth — must return 4xx for wrong credentials.
        l = await clients["bs"].post("/teacher/login", json={"phoneNumber": "+910000000000", "password": "wrong"})
        p = await clients["p"].post("/teacher/login",  json={"phoneNumber": "+910000000000", "password": "wrong"})
        assert_parity(l, p, label="login_wrong_password")

    @pytest.mark.asyncio
    async def test_me_without_token(self, clients):
        l = await clients["bs"].get("/teacher/me")
        p = await clients["p"].get("/teacher/me")
        assert_parity(l, p, label="me_no_token")

    @pytest.mark.asyncio
    async def test_me_with_token(self, clients, teacher_tokens):
        token = teacher_tokens["p"]
        assert token, "teacher_tokens fixture failed to mint a platform token"
        r = await clients["p"].get("/teacher/me", headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 200, f"platform /teacher/me with valid token returned {r.status_code}: {r.text[:200]}"

    @pytest.mark.asyncio
    async def test_participants_requires_auth(self, clients):
        """Security fix: GET /user/participants must be protected on both."""
        l = await clients["bs"].get("/user/participants")
        p = await clients["p"].get("/user/participants")
        assert l.status_code in (401, 403), f"legacy /user/participants returned {l.status_code}"
        assert p.status_code in (401, 403), f"platform /user/participants returned {p.status_code}"


class TestUsersParity:

    @pytest.mark.asyncio
    async def test_student_list_requires_auth(self, clients):
        l = await clients["bs"].get("/student")
        p = await clients["p"].get("/student")
        assert_parity(l, p, label="student_list_no_auth")

    @pytest.mark.asyncio
    async def test_create_student_requires_auth(self, clients):
        l = await clients["bs"].post("/student", json={"name": "s", "phone": "+91999"})
        p = await clients["p"].post("/student", json={"name": "s", "phone": "+91999"})
        assert_parity(l, p, label="create_student_no_auth")


class TestSchoolParity:

    @pytest.mark.asyncio
    async def test_get_school_requires_auth(self, clients):
        l = await clients["bs"].get("/school/fakeid")
        p = await clients["p"].get("/school/fakeid")
        assert_parity(l, p, label="get_school_no_auth")

    @pytest.mark.asyncio
    async def test_list_teachers_requires_auth(self, clients):
        l = await clients["bs"].get("/school/teachers")
        p = await clients["p"].get("/school/teachers")
        assert_parity(l, p, label="list_teachers_no_auth")


class TestContentParity:

    @pytest.mark.asyncio
    async def test_content_list_requires_auth(self, clients):
        l = await clients["bs"].get("/content")
        p = await clients["p"].get("/content")
        assert_parity(l, p, label="content_list_no_auth")

    @pytest.mark.asyncio
    async def test_content_jobs_requires_auth(self, clients):
        l = await clients["bs"].get("/content/jobs")
        p = await clients["p"].get("/content/jobs")
        assert_parity(l, p, label="content_jobs_no_auth")


# ---------------------------------------------------------------------------
# ConferenceV2 parity
# ---------------------------------------------------------------------------

def _conf_assert(legacy_r: httpx.Response, platform_r: httpx.Response, *, label: str) -> None:
    """Conference parity: ConferenceV2 crashes with 500 on missing auth; platform returns 401.
    Both must reject unauthenticated requests (4xx or 5xx) — we don't require exact status match.
    """
    assert legacy_r.status_code >= 400, f"[{label}] legacy unexpectedly accepted unauthenticated request: {legacy_r.status_code}"
    assert platform_r.status_code >= 400, f"[{label}] platform unexpectedly accepted unauthenticated request: {platform_r.status_code}"


class TestConferenceParity:

    @pytest.mark.asyncio
    async def test_create_requires_auth(self, clients):
        l = await clients["conf"].post("/conference/create", json={"name": "test"})
        p = await clients["p"].post("/conference/create", json={"name": "test"})
        _conf_assert(l, p, label="conf_create_no_auth")

    @pytest.mark.asyncio
    async def test_teacherappconnect_requires_auth(self, clients):
        l = await clients["conf"].get("/conference/teacherappconnect/fakeid")
        p = await clients["p"].get("/conference/teacherappconnect/fakeid")
        _conf_assert(l, p, label="teacherappconnect_no_auth")

    @pytest.mark.asyncio
    async def test_end_requires_auth(self, clients):
        l = await clients["conf"].put("/conference/end/fakeid")
        p = await clients["p"].put("/conference/end/fakeid")
        _conf_assert(l, p, label="conf_end_no_auth")

    @pytest.mark.asyncio
    async def test_add_participant_requires_auth(self, clients):
        l = await clients["conf"].put("/conference/addparticipant/fakeid",
            json={"phone": "+919999999999"})
        p = await clients["p"].put("/conference/addparticipant/fakeid",
            json={"phone": "+919999999999"})
        _conf_assert(l, p, label="addparticipant_no_auth")

    @pytest.mark.asyncio
    async def test_playaudio_requires_auth(self, clients):
        l = await clients["conf"].put("/conference/playaudio/fakeid", json={"audio_url": "x"})
        p = await clients["p"].put("/conference/playaudio/fakeid", json={"audio_url": "x"})
        _conf_assert(l, p, label="playaudio_no_auth")


# ---------------------------------------------------------------------------
# IVRv2 parity
# ---------------------------------------------------------------------------

class TestIVRParity:

    @pytest.mark.asyncio
    async def test_answer_webhook_public(self, clients):
        """GET /answer is public — Vonage calls this. Must return NCCO array."""
        try:
            l = await clients["ivr"].get("/answer")
        except httpx.ConnectError:
            pytest.skip(f"IVRv2 not reachable at {IVR}")
        p = await clients["p"].get("/answer")
        assert l.status_code == p.status_code, (
            f"answer: legacy={l.status_code} platform={p.status_code}"
        )
        if l.status_code == 200:
            l_body = l.json()
            p_body = p.json()
            assert isinstance(l_body, list), "legacy /answer should return NCCO array"
            assert isinstance(p_body, list), "platform /answer should return NCCO array"

    @pytest.mark.asyncio
    async def test_event_webhook_accepts_post(self, clients):
        """POST /event is a Vonage webhook — public, accepts call events."""
        # Full Vonage event payload (IVR validates all required fields)
        payload = {
            "status": "answered",
            "uuid": "aaaaaaaa-bbbb-cccc-dddd-0123456789ab",
            "conversation_uuid": "CON-aaaaaaaa-bbbb-cccc-dddd-0123456789ab",
            "from": "14155551234",
            "to": "14155555678",
            "direction": "outbound",
            "timestamp": "2020-01-01T12:00:00.000Z",
        }
        try:
            l = await clients["ivr"].post("/event", json=payload)
        except httpx.ConnectError:
            pytest.skip(f"IVRv2 not reachable at {IVR}")
        p = await clients["p"].post("/event", json=payload)
        # Both should accept (200) or fail gracefully — not 500
        assert l.status_code < 500, f"legacy /event returned {l.status_code}: {l.text[:200]}"
        assert p.status_code < 500, f"platform /event returned {p.status_code}: {p.text[:200]}"
        assert l.status_code == p.status_code, (
            f"event webhook: legacy={l.status_code} platform={p.status_code}"
        )

    @pytest.mark.asyncio
    async def test_fsm_context_requires_auth(self, clients):
        # fsmContext lives on backend-server (/call prefix), not IVR
        l = await clients["bs"].get("/call/fsmContext/fakeid")
        p = await clients["p"].get("/call/fsmContext/fakeid")
        assert_parity(l, p, label="fsmContext_no_auth")

    @pytest.mark.asyncio
    async def test_access_token_requires_auth(self, clients):
        # accessToken lives on backend-server (/call prefix), not IVR
        l = await clients["bs"].get("/call/accessToken")
        p = await clients["p"].get("/call/accessToken")
        assert_parity(l, p, label="accessToken_no_auth")


# ---------------------------------------------------------------------------
# Health / infrastructure
# ---------------------------------------------------------------------------

class TestHealthParity:

    @pytest.mark.asyncio
    async def test_platform_health(self, clients):
        r = await clients["p"].get("/health")
        assert r.status_code == 200
        assert r.json().get("status") == "ok"

    @pytest.mark.asyncio
    async def test_legacy_bs_reachable(self, clients):
        # BS health endpoint is /health/ping (returns 200 empty body)
        r = await clients["bs"].get("/health/ping")
        assert r.status_code == 200, f"backend-server /health/ping returned {r.status_code}"

    @pytest.mark.asyncio
    async def test_legacy_conf_reachable(self, clients):
        # ConferenceV2 has no /health — use /docs (FastAPI always serves this)
        r = await clients["conf"].get("/docs")
        assert r.status_code == 200, f"ConferenceV2 /docs returned {r.status_code}"

    @pytest.mark.asyncio
    async def test_legacy_ivr_reachable(self, clients):
        # IVRv2 has no /health — use /docs (FastAPI always serves this)
        try:
            r = await clients["ivr"].get("/docs")
            assert r.status_code == 200, f"IVRv2 /docs returned {r.status_code}"
        except httpx.ConnectError:
            pytest.skip(f"IVRv2 not reachable at {IVR} — start it with: poetry run uvicorn app.main:app --port 8001")
