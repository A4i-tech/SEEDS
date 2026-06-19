"""
Shared fixtures and helpers for E2E tests.

The asyncio_mode = "auto" is configured in pyproject.toml [tool.pytest.ini_options],
so all async test functions and fixtures are automatically treated as async.
"""

import asyncio
import time

import httpx
import pymongo
import pytest
import pytest_asyncio

TEACHER_PHONE = "+10000000001"
STUDENT_PHONE = "+10000000002"


# ---------------------------------------------------------------------------
# HTTP client
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture
async def api_client():
    async with httpx.AsyncClient(base_url="http://localhost:9210", timeout=30.0) as client:
        yield client


# ---------------------------------------------------------------------------
# MongoDB
# ---------------------------------------------------------------------------


@pytest.fixture(scope="session")
def mongo_db():
    """Session-scoped synchronous MongoDB client; yields the conference_test database."""
    client = pymongo.MongoClient("mongodb://localhost:27017")
    yield client["conference_test"]
    client.close()


# ---------------------------------------------------------------------------
# Helpers (importable by test modules)
# ---------------------------------------------------------------------------


async def wait_for_state(
    mongo_db,
    conf_id: str,
    condition,
    timeout: float = 5.0,
):
    """
    Poll MongoDB until ``condition(doc)`` returns True or *timeout* seconds elapse.

    Returns the matching document. Raises ``TimeoutError`` if the condition is
    not satisfied within the deadline.
    """
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        doc = mongo_db["conferenceState"].find_one({"_id": conf_id})
        if doc and condition(doc):
            return doc
        await asyncio.sleep(0.2)
    raise TimeoutError(
        f"State condition not met for conference {conf_id} within {timeout}s"
    )


# ---------------------------------------------------------------------------
# Conference fixtures
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture
async def conference_id(api_client, mongo_db):
    """
    Create a conference via POST /conference/create.

    Yields the conference_id string, then cleans up the MongoDB document.
    """
    resp = await api_client.post(
        "/conference/create",
        json={
            "teacher_phone": TEACHER_PHONE,
            "student_phones": [STUDENT_PHONE],
            "teacher_name": "Test Teacher",
            "student_names": ["Test Student"],
        },
    )
    resp.raise_for_status()
    conf_id = resp.json()["id"]
    yield conf_id
    # cleanup
    mongo_db["conferenceState"].delete_one({"_id": conf_id})


@pytest_asyncio.fixture
async def started_conference_id(api_client, mongo_db):
    """
    Create *and start* a conference; wait until ``is_running=True`` in MongoDB.

    Yields the conference_id string, then cleans up the MongoDB document.
    """
    # create
    resp = await api_client.post(
        "/conference/create",
        json={
            "teacher_phone": TEACHER_PHONE,
            "student_phones": [STUDENT_PHONE],
            "teacher_name": "Test Teacher",
            "student_names": ["Test Student"],
        },
    )
    resp.raise_for_status()
    conf_id = resp.json()["id"]

    # start
    start_resp = await api_client.post(f"/conference/start/{conf_id}")
    start_resp.raise_for_status()

    # wait for is_running
    await wait_for_state(mongo_db, conf_id, lambda doc: doc.get("is_running") is True)

    yield conf_id

    # cleanup
    mongo_db["conferenceState"].delete_one({"_id": conf_id})
