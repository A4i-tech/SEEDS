"""
E2E tests for mute/unmute operations.

Requires the ConferenceV2 service running on localhost:9210 with a test MongoDB
instance on localhost:27017 (database: conference_test).

asyncio_mode = "auto" is set in pyproject.toml so async test functions run
automatically without an explicit @pytest.mark.asyncio decorator.

Starting state note: students are created with is_muted=True (see conference_call.py).
Tests that verify muting therefore first unmute to establish a known False state
before testing the mute transition.
"""

from tests.e2e.conftest import (
    TEACHER_PHONE,
    STUDENT_PHONE,
    wait_for_state,
)


# ---------------------------------------------------------------------------
# 1. Mute a single participant
# ---------------------------------------------------------------------------


async def test_mute_participant(started_conference_id, api_client, mongo_db):
    """
    PUT /conference/muteparticipant sets participants[STUDENT_PHONE].is_muted=True.

    Students start muted, so we first unmute to establish is_muted=False, then
    call muteparticipant and verify the flag flips back to True.
    """
    conf_id = started_conference_id

    # Unmute first so the mute operation produces a visible state change.
    resp = await api_client.put(
        f"/conference/unmuteparticipant/{conf_id}",
        params={"phone_number": STUDENT_PHONE},
    )
    assert resp.status_code == 200

    await wait_for_state(
        mongo_db,
        conf_id,
        lambda d: d.get("participants", {}).get(STUDENT_PHONE, {}).get("is_muted") is False,
        timeout=10.0,
    )

    # Now mute the student.
    resp = await api_client.put(
        f"/conference/muteparticipant/{conf_id}",
        params={"phone_number": STUDENT_PHONE},
    )
    assert resp.status_code == 200

    doc = await wait_for_state(
        mongo_db,
        conf_id,
        lambda d: d.get("participants", {}).get(STUDENT_PHONE, {}).get("is_muted") is True,
        timeout=10.0,
    )
    assert doc["participants"][STUDENT_PHONE]["is_muted"] is True


# ---------------------------------------------------------------------------
# 2. Unmute a single participant
# ---------------------------------------------------------------------------


async def test_unmute_participant(started_conference_id, api_client, mongo_db):
    """
    PUT /conference/unmuteparticipant sets participants[STUDENT_PHONE].is_muted=False.

    Students start muted by default, so we can call unmuteparticipant directly
    and verify the flag transitions to False.
    """
    conf_id = started_conference_id

    resp = await api_client.put(
        f"/conference/unmuteparticipant/{conf_id}",
        params={"phone_number": STUDENT_PHONE},
    )
    assert resp.status_code == 200

    doc = await wait_for_state(
        mongo_db,
        conf_id,
        lambda d: d.get("participants", {}).get(STUDENT_PHONE, {}).get("is_muted") is False,
        timeout=10.0,
    )
    assert doc["participants"][STUDENT_PHONE]["is_muted"] is False


# ---------------------------------------------------------------------------
# 3. Mute all skips teacher
# ---------------------------------------------------------------------------


async def test_mute_all_skips_teacher(started_conference_id, api_client, mongo_db):
    """
    PUT /conference/muteall mutes all students but leaves the teacher unmuted.

    Students start muted. We first unmute STUDENT_PHONE so muteall produces a
    visible state change, then verify STUDENT_PHONE becomes muted again while
    TEACHER_PHONE remains unmuted.
    """
    conf_id = started_conference_id

    # Unmute the student so muteall has a meaningful effect.
    resp = await api_client.put(
        f"/conference/unmuteparticipant/{conf_id}",
        params={"phone_number": STUDENT_PHONE},
    )
    assert resp.status_code == 200

    await wait_for_state(
        mongo_db,
        conf_id,
        lambda d: d.get("participants", {}).get(STUDENT_PHONE, {}).get("is_muted") is False,
        timeout=10.0,
    )

    # Mute all participants (should only affect students).
    resp = await api_client.put(f"/conference/muteall/{conf_id}")
    assert resp.status_code == 200

    doc = await wait_for_state(
        mongo_db,
        conf_id,
        lambda d: d.get("participants", {}).get(STUDENT_PHONE, {}).get("is_muted") is True,
        timeout=10.0,
    )

    # Student should be muted.
    assert doc["participants"][STUDENT_PHONE]["is_muted"] is True

    # Teacher must NOT have been muted by muteall.
    assert doc["participants"][TEACHER_PHONE]["is_muted"] is False


# ---------------------------------------------------------------------------
# 4. Unmute all
# ---------------------------------------------------------------------------


async def test_unmute_all(started_conference_id, api_client, mongo_db):
    """
    PUT /conference/unmuteall sets is_muted=False for all student participants.

    Students start muted by default, so we can call unmuteall directly and
    verify STUDENT_PHONE transitions to is_muted=False.
    """
    conf_id = started_conference_id

    resp = await api_client.put(f"/conference/unmuteall/{conf_id}")
    assert resp.status_code == 200

    doc = await wait_for_state(
        mongo_db,
        conf_id,
        lambda d: d.get("participants", {}).get(STUDENT_PHONE, {}).get("is_muted") is False,
        timeout=10.0,
    )
    assert doc["participants"][STUDENT_PHONE]["is_muted"] is False
