"""
E2E tests for the conference lifecycle.

Requires the ConferenceV2 service running on localhost:9210 with a test MongoDB
instance on localhost:27017 (database: conference_test).

asyncio_mode = "auto" is set in pyproject.toml so async test functions run
automatically without an explicit @pytest.mark.asyncio decorator.
"""

import asyncio

import pytest

from tests.e2e.conftest import (
    TEACHER_PHONE,
    STUDENT_PHONE,
    wait_for_state,
)


# ---------------------------------------------------------------------------
# 1. Create — returns a non-empty id
# ---------------------------------------------------------------------------


async def test_create_returns_id(conference_id):
    """The conference_id fixture creates the conference; assert the id is valid."""
    assert isinstance(conference_id, str)
    assert len(conference_id) > 0


# ---------------------------------------------------------------------------
# 2. Start — sets is_running=True in MongoDB
# ---------------------------------------------------------------------------


async def test_start_sets_running(conference_id, api_client, mongo_db):
    """POST /conference/start/{id} causes is_running to become True in MongoDB."""
    resp = await api_client.post(f"/conference/start/{conference_id}")
    assert resp.status_code == 200

    doc = await wait_for_state(
        mongo_db,
        conference_id,
        lambda d: d.get("is_running") is True,
        timeout=10.0,
    )
    assert doc["is_running"] is True


# ---------------------------------------------------------------------------
# 3. Webhook — participant connected updates call_status in MongoDB
# ---------------------------------------------------------------------------


async def test_webhook_participant_connected(started_conference_id, api_client, mongo_db):
    """
    Simulating a Vonage 'answered' webhook for TEACHER_PHONE causes
    participants[TEACHER_PHONE].call_status to become 'connected' in MongoDB.
    """
    conf_id = started_conference_id

    resp = await api_client.post(
        f"/webhooks/event/{conf_id}",
        json={"status": "answered", "to": TEACHER_PHONE},
    )
    assert resp.status_code == 200

    doc = await wait_for_state(
        mongo_db,
        conf_id,
        lambda d: (
            d.get("participants", {}).get(TEACHER_PHONE, {}).get("call_status")
            == "connected"
        ),
        timeout=10.0,
    )
    assert doc["participants"][TEACHER_PHONE]["call_status"] == "connected"


# ---------------------------------------------------------------------------
# 4. End — sets is_running=False in MongoDB
# ---------------------------------------------------------------------------


async def test_end_stops_conference(started_conference_id, api_client, mongo_db):
    """PUT /conference/end/{id} causes is_running to become False in MongoDB."""
    conf_id = started_conference_id

    resp = await api_client.put(f"/conference/end/{conf_id}")
    assert resp.status_code == 200

    doc = await wait_for_state(
        mongo_db,
        conf_id,
        lambda d: d.get("is_running") is False,
        timeout=10.0,
    )
    assert doc["is_running"] is False


# ---------------------------------------------------------------------------
# 5. Sink — removes conference from memory; subsequent end returns 404
# ---------------------------------------------------------------------------


async def test_sink_removes_conference(started_conference_id, api_client, mongo_db):
    """
    After end + sink, the conference is deleted from the manager's in-memory
    store, so a subsequent PUT /conference/end/{id} returns 404.
    """
    conf_id = started_conference_id

    # End the conference first so it is in a safe state for sink
    end_resp = await api_client.put(f"/conference/end/{conf_id}")
    assert end_resp.status_code == 200

    await wait_for_state(
        mongo_db,
        conf_id,
        lambda d: d.get("is_running") is False,
        timeout=10.0,
    )

    # Sink removes the conference from in-memory state
    sink_resp = await api_client.put(f"/conference/sink/{conf_id}")
    assert sink_resp.status_code == 200

    # Poll until the conference is removed from memory (sink processes async)
    deadline = asyncio.get_event_loop().time() + 5.0
    followup_resp = None
    while asyncio.get_event_loop().time() < deadline:
        followup_resp = await api_client.put(f"/conference/end/{conf_id}")
        if followup_resp.status_code == 404:
            break
        await asyncio.sleep(0.2)
    assert followup_resp is not None
    assert followup_resp.status_code == 404, "Conference not removed from memory within 5s after sink"
