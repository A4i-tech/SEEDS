"""
Integration tests for the analytics endpoints (IVR + conference).

Ported from backend-server/tests/integration/analyticsIvr.test.js and
analyticsConference.test.js. Verifies role guards, tenant/school scoping,
date-range validation, and the camelCase response contract consumed by
ContentWebApp.
"""

from __future__ import annotations

import os

os.environ.setdefault("SECRET_KEY", "test-secret-key-for-integration-tests-32ch")
os.environ.setdefault("APP_MODE", "api")
os.environ.setdefault("ENV", "development")

from datetime import datetime

import pytest
import pytest_asyncio
from bson import ObjectId
from httpx import ASGITransport, AsyncClient
from mongomock_motor import AsyncMongoMockClient

from app.main import app
from app.models.user import UserRole
from app.platform.auth.dependencies import get_db
from app.platform.auth.jwt import create_access_token
from app.repositories.conference_repository import ConferenceRepository
from app.repositories.ivr_repository import IVRRepository

CONF_COLLECTION = ConferenceRepository.COLLECTION
IVR_COLLECTION = IVRRepository.LOG_COLLECTION

# tenant_id / school_id are stored as ObjectId in the real collections (schools,
# users). Seed them that way so the repo queries are exercised against the real
# stored type, not a string that masks type-mismatch bugs.
TENANT_OID = ObjectId()
TENANT_ID = str(TENANT_OID)
SCHOOL_OID = ObjectId()
SCHOOL_ID = str(SCHOOL_OID)
TEACHER_OID = ObjectId()
TEACHER_ID = str(TEACHER_OID)
TEACHER_PHONE = "+919876543210"
STUDENT_PHONE = "+919812345678"

START = "2026-06-01T00:00:00"
END = "2026-06-30T23:59:59"


@pytest_asyncio.fixture
async def mock_db():
    client = AsyncMongoMockClient()
    db = client["seeds_test_analytics"]
    await _seed(db)
    yield db
    client.close()


@pytest_asyncio.fixture
async def client(mock_db):
    async def _override_db():
        yield mock_db

    app.dependency_overrides[get_db] = _override_db
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            yield ac
    finally:
        # Guarantee override cleanup even if setup/body raises, so a failed test
        # can't leak stale overrides into later tests.
        app.dependency_overrides.clear()


async def _seed(db):
    await db["schools"].insert_one(
        {
            "_id": SCHOOL_OID,
            "tenantId": TENANT_OID,  # stored as ObjectId, as in real data
            "name": "Test School",
            "email": "school@test.com",
            "isActive": True,
        }
    )
    await db["users"].insert_many(
        [
            {
                "_id": TEACHER_OID,
                "role": UserRole.TEACHER.value,
                "name": "Mr Teacher",
                "phone": TEACHER_PHONE,
                "tenant_id": TENANT_OID,  # ObjectId, not string
                "school_id": SCHOOL_OID,
                "is_active": True,
            },
            {
                "_id": ObjectId(),
                "role": UserRole.STUDENT.value,
                "name": "Student One",
                "phone": STUDENT_PHONE,
                "tenant_id": TENANT_OID,
                "school_id": SCHOOL_OID,
                "is_active": True,
            },
        ]
    )
    # Two IVR logs: one completed (by student), one failed (by teacher).
    # created_at/stopped_at seeded as BSON datetimes (real stored type) so the
    # datetime-bounded query is exercised — string bounds would silently miss.
    await db[IVR_COLLECTION].insert_many(
        [
            {
                "tenant_id": TENANT_ID,
                "phone_number": STUDENT_PHONE,
                "created_at": datetime(2026, 6, 10, 10, 0, 0),
                "stopped_at": datetime(2026, 6, 10, 10, 2, 0),
                "duration": "120",
                "stream_playback": [
                    {"play_id": "p1", "stream_url": "https://cdn/lesson1.mp3", "done_at": "2026-06-10T10:01:50"}
                ],
                "call_status_updates": {
                    "2026-06-10T10:00:00": "started",
                    "2026-06-10T10:02:00": "completed",
                },
            },
            {
                "tenant_id": TENANT_ID,
                "phone_number": TEACHER_PHONE,
                "created_at": datetime(2026, 6, 11, 9, 0, 0),
                "stopped_at": datetime(2026, 6, 11, 9, 0, 5),
                "duration": "0",
                "stream_playback": [],
                "call_status_updates": {"2026-06-11T09:00:00": "busy"},
            },
        ]
    )
    # One completed conference run by the teacher with 1 student + 1 raised hand.
    await db[CONF_COLLECTION].insert_one(
        {
            "_id": "conf-1",
            "tenant_id": TENANT_ID,
            "teacher_phone_number": TEACHER_PHONE,
            "is_running": False,
            "participants": {
                TEACHER_PHONE: {"role": "Teacher", "name": "Mr Teacher", "phone_number": TEACHER_PHONE},
                STUDENT_PHONE: {"role": "Student", "name": "Student One", "phone_number": STUDENT_PHONE},
            },
            "action_history": [
                {"action_type": "Conference-Start", "timestamp": "2026-06-12T10:00:00", "metadata": {}, "owner": TEACHER_PHONE},
                {
                    "action_type": "Student-RaiseHandStateChange",
                    "timestamp": "2026-06-12T10:05:00",
                    "metadata": {"raised_hand": True},
                    "owner": STUDENT_PHONE,
                },
                {"action_type": "Conference-End", "timestamp": "2026-06-12T10:20:00", "metadata": {}, "owner": TEACHER_PHONE},
            ],
        }
    )


def _tenant_token():
    return create_access_token({"sub": "tenant-uid", "role": "tenant", "tenant_id": TENANT_ID})


def _school_admin_token():
    return create_access_token(
        {"sub": "sa-uid", "role": "school_admin", "tenant_id": TENANT_ID, "school_id": SCHOOL_ID}
    )


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


# ---------------------------------------------------------------------------
# Auth / validation
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_ivr_requires_tenant_role(client):
    resp = await client.get(
        "/tenant/analytics/ivr",
        params={"startDate": START, "endDate": END},
        headers=_auth(_school_admin_token()),
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_missing_dates_returns_422(client):
    # Required datetime query params — FastAPI raises 422 when absent.
    resp = await client.get("/tenant/analytics/ivr", headers=_auth(_tenant_token()))
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_invalid_date_returns_422(client):
    resp = await client.get(
        "/tenant/analytics/ivr",
        params={"startDate": "garbage", "endDate": END},
        headers=_auth(_tenant_token()),
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_teacher_not_in_scope_returns_404(client):
    resp = await client.get(
        "/tenant/analytics/ivr",
        params={"startDate": START, "endDate": END, "teacherId": str(ObjectId())},
        headers=_auth(_tenant_token()),
    )
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# IVR analytics
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_tenant_ivr_analytics_totals(client):
    resp = await client.get(
        "/tenant/analytics/ivr",
        params={"startDate": START, "endDate": END},
        headers=_auth(_tenant_token()),
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["totals"]["totalCalls"] == 2
    assert body["totals"]["completedCalls"] == 1
    assert body["totals"]["failedCalls"] == 1
    # contract: camelCase top-level keys
    for key in ("sessionLength", "statusBreakdown", "bySchool", "byTeacher", "contentUsage", "calls"):
        assert key in body
    # content usage picked up the played lesson
    assert any(u["streamUrl"] == "https://cdn/lesson1.mp3" for u in body["contentUsage"])


@pytest.mark.asyncio
async def test_tenant_ivr_teacher_attribution(client):
    resp = await client.get(
        "/tenant/analytics/ivr",
        params={"startDate": START, "endDate": END},
        headers=_auth(_tenant_token()),
    )
    body = resp.json()
    teacher_rows = [t for t in body["byTeacher"] if t["teacherId"] == TEACHER_ID]
    assert len(teacher_rows) == 1
    assert teacher_rows[0]["totalCalls"] == 1


# ---------------------------------------------------------------------------
# Conference analytics
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_tenant_conference_analytics(client):
    resp = await client.get(
        "/tenant/analytics/conference",
        params={"startDate": START, "endDate": END},
        headers=_auth(_tenant_token()),
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["totals"]["totalConferences"] == 1
    assert body["totals"]["completedConferences"] == 1
    assert body["duration"]["totalSeconds"] == 1200.0
    assert body["classSize"]["average"] == 1
    assert body["raisedHands"]["totalEvents"] == 1
    assert len(body["conferences"]) == 1


# ---------------------------------------------------------------------------
# School-admin scoping
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_school_admin_ivr_scoped_to_own_school(client):
    resp = await client.get(
        "/school/analytics/ivr",
        params={"startDate": START, "endDate": END},
        headers=_auth(_school_admin_token()),
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["filters"]["schoolId"] == SCHOOL_ID
    assert body["totals"]["totalCalls"] == 2


@pytest.mark.asyncio
async def test_school_admin_cannot_use_tenant_route(client):
    resp = await client.get(
        "/tenant/analytics/conference",
        params={"startDate": START, "endDate": END},
        headers=_auth(_school_admin_token()),
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_school_admin_without_school_id_is_denied(client):
    # A school_admin token lacking school_id (as produced on the Firebase auth
    # path) must be rejected, not silently widened to tenant-wide data.
    token = create_access_token({"sub": "sa-uid", "role": "school_admin", "tenant_id": TENANT_ID})
    resp = await client.get(
        "/school/analytics/ivr",
        params={"startDate": START, "endDate": END},
        headers=_auth(token),
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_conference_ignores_legacy_teacher_phone_only_doc(mock_db, client):
    # Deliberate contract: conferenceState is queried on `teacher_phone_number`
    # only (staging canonical field). A doc carrying just the legacy
    # `teacher_phone` must NOT be counted — guards against re-introducing the
    # dual-field ($or) match. Baseline seed has exactly 1 real conference.
    await mock_db[CONF_COLLECTION].insert_one(
        {
            "_id": "conf-legacy-only",
            "tenant_id": TENANT_ID,
            "teacher_phone": TEACHER_PHONE,  # legacy field only, no teacher_phone_number
            "is_running": False,
            "participants": {
                STUDENT_PHONE: {"role": "Student", "name": "Student One"},
            },
            "action_history": [
                {"action_type": "Conference-Start", "timestamp": "2026-06-13T10:00:00", "metadata": {}},
                {"action_type": "Conference-End", "timestamp": "2026-06-13T10:10:00", "metadata": {}},
            ],
        }
    )
    resp = await client.get(
        "/tenant/analytics/conference",
        params={"startDate": START, "endDate": END},
        headers=_auth(_tenant_token()),
    )
    assert resp.status_code == 200
    assert resp.json()["totals"]["totalConferences"] == 1
