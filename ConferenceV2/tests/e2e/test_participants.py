"""
E2E tests for participant management.

Requires the ConferenceV2 service running on localhost:9210 with a test MongoDB
instance on localhost:27017 (database: conference_test).

asyncio_mode = "auto" is set in pyproject.toml so async test functions run
automatically without an explicit @pytest.mark.asyncio decorator.
"""

from tests.e2e.conftest import (
    TEACHER_PHONE,
    STUDENT_PHONE,
    wait_for_state,
)


# ---------------------------------------------------------------------------
# 1. Teacher disconnect starts auto-end timer
# ---------------------------------------------------------------------------


async def test_teacher_disconnect_starts_timer(started_conference_id, api_client, mongo_db):
    """
    When the teacher disconnects, auto_end_state.is_active becomes True in MongoDB.

    VonageCallStatus.COMPLETED -> CallStatus.DISCONNECTED triggers
    StartTeacherDisconnectTimerEvent which sets auto_end_state.is_active = True.
    """
    conf_id = started_conference_id

    # Simulate teacher connecting
    resp = await api_client.post(
        f"/webhooks/event/{conf_id}",
        json={"status": "answered", "to": TEACHER_PHONE},
    )
    assert resp.status_code == 200

    # Simulate teacher disconnecting
    resp = await api_client.post(
        f"/webhooks/event/{conf_id}",
        json={"status": "completed", "to": TEACHER_PHONE},
    )
    assert resp.status_code == 200

    doc = await wait_for_state(
        mongo_db,
        conf_id,
        lambda d: d.get("auto_end_state", {}).get("is_active") is True,
        timeout=10.0,
    )
    assert doc["auto_end_state"]["is_active"] is True


# ---------------------------------------------------------------------------
# 2. Teacher reconnect cancels auto-end timer
# ---------------------------------------------------------------------------


async def test_teacher_reconnect_cancels_timer(started_conference_id, api_client, mongo_db):
    """
    When the teacher reconnects after the auto-end timer has started,
    auto_end_state.is_active becomes False in MongoDB.

    CancelTeacherDisconnectTimerEvent is only queued when teacher reconnects
    AND auto_end_state.is_active is True.
    """
    conf_id = started_conference_id

    # Simulate teacher connecting
    resp = await api_client.post(
        f"/webhooks/event/{conf_id}",
        json={"status": "answered", "to": TEACHER_PHONE},
    )
    assert resp.status_code == 200

    # Simulate teacher disconnecting
    resp = await api_client.post(
        f"/webhooks/event/{conf_id}",
        json={"status": "completed", "to": TEACHER_PHONE},
    )
    assert resp.status_code == 200

    # Wait for the timer to become active before reconnecting
    await wait_for_state(
        mongo_db,
        conf_id,
        lambda d: d.get("auto_end_state", {}).get("is_active") is True,
        timeout=10.0,
    )

    # Simulate teacher reconnecting
    resp = await api_client.post(
        f"/webhooks/event/{conf_id}",
        json={"status": "answered", "to": TEACHER_PHONE},
    )
    assert resp.status_code == 200

    doc = await wait_for_state(
        mongo_db,
        conf_id,
        lambda d: d.get("auto_end_state", {}).get("is_active") is False,
        timeout=10.0,
    )
    assert doc["auto_end_state"]["is_active"] is False


# ---------------------------------------------------------------------------
# 3. Add participant mid-call
# ---------------------------------------------------------------------------


async def test_add_participant_mid_call(started_conference_id, api_client, mongo_db):
    """
    PUT /conference/addparticipant/{id} adds the new phone number to the
    participants map in MongoDB.
    """
    conf_id = started_conference_id
    new_phone = "+10000000003"

    resp = await api_client.put(
        f"/conference/addparticipant/{conf_id}",
        params={"phone_number": new_phone, "name": "New Student"},
    )
    assert resp.status_code == 200

    doc = await wait_for_state(
        mongo_db,
        conf_id,
        lambda d: new_phone in d.get("participants", {}),
        timeout=10.0,
    )
    assert new_phone in doc["participants"]


# ---------------------------------------------------------------------------
# 4. Remove participant
# ---------------------------------------------------------------------------


async def test_remove_participant(started_conference_id, api_client, mongo_db):
    """
    PUT /conference/removeparticipant/{id} removes the phone number from the
    participants map in MongoDB.
    """
    conf_id = started_conference_id

    resp = await api_client.put(
        f"/conference/removeparticipant/{conf_id}",
        params={"phone_number": STUDENT_PHONE},
    )
    assert resp.status_code == 200

    doc = await wait_for_state(
        mongo_db,
        conf_id,
        lambda d: STUDENT_PHONE not in d.get("participants", {}),
        timeout=10.0,
    )
    assert STUDENT_PHONE not in doc["participants"]
