"""Playback endpoints — ownership, URL/argument validation, and the event actually queued."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.platform.auth.dependencies import get_db
from app.platform.auth.jwt import create_access_token
from app.repositories.conference_repository import ConferenceOwnershipRepository
from app.services.confevents.pause_content_event import PauseContentEvent
from app.services.confevents.play_content_event import PlayContentEvent
from app.services.confevents.resume_content_event import ResumeContentEvent
from app.services.confevents.seek_content_event import SeekContentEvent
from app.services.confevents.set_playback_speed_event import SetPlaybackSpeedEvent
from tests.support.mongomock_async import AsyncMongoMockClient

CONF_ID = "conf-1"
OWNER_ID = "user-1"
TENANT_ID = "tenant-1"
AUDIO_URL = "https://blob.test/output-container/c1/1.0.mp3"


@pytest_asyncio.fixture
async def mock_db():
    client = AsyncMongoMockClient()
    db = client["seeds_test_playback_ctrl"]
    await ConferenceOwnershipRepository(db).create(
        CONF_ID, created_by=OWNER_ID, tenant_id=TENANT_ID, teacher_phone="+911111111111"
    )
    yield db
    await client.close()


@pytest.fixture
def conf():
    conf = MagicMock()
    conf.queue_event = AsyncMock()
    return conf


@pytest_asyncio.fixture
async def client(mock_db, conf):
    async def _override_db():
        yield mock_db

    app.dependency_overrides[get_db] = _override_db
    manager = MagicMock()
    manager.get_conference.return_value = conf
    transport = ASGITransport(app=app)
    with patch("app.platform.lifespan.get_conference_manager", return_value=manager):
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            ac.manager = manager
            yield ac
    app.dependency_overrides.clear()


def _headers(user_id=OWNER_ID, tenant_id=TENANT_ID):
    token = create_access_token({"sub": user_id, "role": "teacher", "tenant_id": tenant_id})
    return {"Authorization": f"Bearer {token}"}


class TestOwnership:
    @pytest.mark.asyncio
    @pytest.mark.parametrize(
        ("path", "params"),
        [
            (f"/conference/playaudio/{CONF_ID}", {"url": AUDIO_URL}),
            (f"/conference/pauseaudio/{CONF_ID}", None),
            (f"/conference/resumeaudio/{CONF_ID}", None),
            (f"/conference/seekaudio/{CONF_ID}", {"delta_seconds": 10}),
            (f"/conference/setplaybackspeed/{CONF_ID}", {"speed": 1.5}),
        ],
    )
    async def test_every_endpoint_requires_authentication(self, client, path, params) -> None:
        assert (await client.put(path, params=params)).status_code == 401

    @pytest.mark.asyncio
    async def test_a_non_owner_is_forbidden(self, client, conf) -> None:
        resp = await client.put(
            f"/conference/pauseaudio/{CONF_ID}", headers=_headers(user_id="someone-else")
        )
        assert resp.status_code == 403
        conf.queue_event.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_an_owner_from_another_tenant_is_forbidden(self, client, conf) -> None:
        resp = await client.put(
            f"/conference/pauseaudio/{CONF_ID}", headers=_headers(tenant_id="tenant-2")
        )
        assert resp.status_code == 403
        conf.queue_event.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_an_unknown_conference_is_404(self, client) -> None:
        resp = await client.put("/conference/pauseaudio/nope", headers=_headers())
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_a_conference_that_is_owned_but_no_longer_live_is_404(self, client) -> None:
        client.manager.get_conference.return_value = None
        resp = await client.put(f"/conference/pauseaudio/{CONF_ID}", headers=_headers())
        assert resp.status_code == 404


class TestPlayAudio:
    @pytest.mark.asyncio
    async def test_queues_a_play_event_with_the_url(self, client, conf) -> None:
        resp = await client.put(
            f"/conference/playaudio/{CONF_ID}", params={"url": AUDIO_URL}, headers=_headers()
        )
        assert resp.status_code == 200
        assert resp.json() == {"message": "Event Queued for execution"}
        queued = conf.queue_event.await_args.args[0]
        assert isinstance(queued, PlayContentEvent)
        assert queued.url == AUDIO_URL

    @pytest.mark.asyncio
    @pytest.mark.parametrize("url", ["http://blob.test/a.mp3", "ftp://blob.test/a.mp3", "a.mp3"])
    async def test_rejects_a_non_https_url(self, client, conf, url) -> None:
        resp = await client.put(
            f"/conference/playaudio/{CONF_ID}", params={"url": url}, headers=_headers()
        )
        assert resp.status_code == 400
        assert resp.json()["detail"] == "Audio URL must use HTTPS"
        conf.queue_event.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_the_url_is_required(self, client) -> None:
        resp = await client.put(f"/conference/playaudio/{CONF_ID}", headers=_headers())
        assert resp.status_code == 422


class TestPauseResume:
    @pytest.mark.asyncio
    async def test_pause_queues_a_pause_event(self, client, conf) -> None:
        resp = await client.put(f"/conference/pauseaudio/{CONF_ID}", headers=_headers())
        assert resp.status_code == 200
        assert isinstance(conf.queue_event.await_args.args[0], PauseContentEvent)

    @pytest.mark.asyncio
    async def test_resume_queues_a_resume_event(self, client, conf) -> None:
        resp = await client.put(f"/conference/resumeaudio/{CONF_ID}", headers=_headers())
        assert resp.status_code == 200
        assert isinstance(conf.queue_event.await_args.args[0], ResumeContentEvent)


class TestSeekAudio:
    @pytest.mark.asyncio
    async def test_a_relative_seek_queues_a_delta(self, client, conf) -> None:
        resp = await client.put(
            f"/conference/seekaudio/{CONF_ID}", params={"delta_seconds": -15}, headers=_headers()
        )
        assert resp.status_code == 200
        queued = conf.queue_event.await_args.args[0]
        assert isinstance(queued, SeekContentEvent)
        assert (queued.delta_seconds, queued.position_seconds) == (-15, None)

    @pytest.mark.asyncio
    async def test_an_absolute_seek_queues_a_position(self, client, conf) -> None:
        resp = await client.put(
            f"/conference/seekaudio/{CONF_ID}",
            params={"position_seconds": 42.5},
            headers=_headers(),
        )
        assert resp.status_code == 200
        queued = conf.queue_event.await_args.args[0]
        assert (queued.delta_seconds, queued.position_seconds) == (None, 42.5)

    @pytest.mark.asyncio
    @pytest.mark.parametrize(
        "params", [None, {"delta_seconds": 10, "position_seconds": 42.5}], ids=["neither", "both"]
    )
    async def test_exactly_one_seek_argument_is_required(self, client, conf, params) -> None:
        resp = await client.put(
            f"/conference/seekaudio/{CONF_ID}", params=params, headers=_headers()
        )
        assert resp.status_code == 400
        assert "Exactly one of delta_seconds or position_seconds" in resp.json()["detail"]
        conf.queue_event.assert_not_awaited()


class TestSetPlaybackSpeed:
    @pytest.mark.asyncio
    async def test_queues_a_speed_event(self, client, conf) -> None:
        resp = await client.put(
            f"/conference/setplaybackspeed/{CONF_ID}", params={"speed": 1.5}, headers=_headers()
        )
        assert resp.status_code == 200
        queued = conf.queue_event.await_args.args[0]
        assert isinstance(queued, SetPlaybackSpeedEvent)
        assert queued.speed == 1.5

    @pytest.mark.asyncio
    @pytest.mark.parametrize("speed", [0.4, 2.1])
    async def test_a_speed_outside_the_supported_range_is_rejected(
        self, client, conf, speed
    ) -> None:
        resp = await client.put(
            f"/conference/setplaybackspeed/{CONF_ID}", params={"speed": speed}, headers=_headers()
        )
        assert resp.status_code == 422
        conf.queue_event.assert_not_awaited()
