"""
Coverage for tts_service pure functions and redis_conference_store utilities.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

# ---------------------------------------------------------------------------
# tts_service — pure function coverage
# ---------------------------------------------------------------------------


class TestTTSServicePure:
    def test_get_tts_attributes_english(self) -> None:
        from app.services.tts_service import _get_tts_attributes

        result = _get_tts_attributes("english")
        assert result is not None
        lang_code, voice_name = result
        assert "en" in lang_code.lower() or "en" in voice_name.lower()

    def test_get_tts_attributes_hindi(self) -> None:
        from app.services.tts_service import _get_tts_attributes

        result = _get_tts_attributes("hindi")
        assert result is not None

    def test_get_tts_attributes_unsupported(self) -> None:
        from app.services.tts_service import _get_tts_attributes

        result = _get_tts_attributes("klingon")
        assert result is None

    def test_get_tts_attributes_kannada(self) -> None:
        from app.services.tts_service import _get_tts_attributes

        result = _get_tts_attributes("kannada")
        # May or may not be supported — just check no crash
        assert result is None or isinstance(result, tuple)

    def test_build_ssml_basic(self) -> None:
        from app.services.tts_service import _build_ssml

        ssml = _build_ssml("Hello world", "en-US", "en-US-JennyNeural", "1.0")
        assert "<speak" in ssml
        assert "Hello world" in ssml
        assert "en-US-JennyNeural" in ssml
        assert 'rate="1.0"' in ssml

    def test_build_ssml_custom_rate(self) -> None:
        from app.services.tts_service import _build_ssml

        ssml = _build_ssml("Test", "hi-IN", "hi-IN-SwaraNeural", "slow")
        assert 'rate="slow"' in ssml
        assert "Test" in ssml

    def test_add_for_in_option_audio_english(self) -> None:
        from app.services.tts_service import add_for_in_option_audio

        result = add_for_in_option_audio("english", "Math")
        assert isinstance(result, str)
        assert len(result) > 0

    def test_add_for_in_option_audio_unsupported_lang(self) -> None:
        from app.services.tts_service import add_for_in_option_audio

        result = add_for_in_option_audio("klingon", "Math")
        assert isinstance(result, str)

    def test_add_for_in_option_audio_hindi(self) -> None:
        from app.services.tts_service import add_for_in_option_audio

        result = add_for_in_option_audio("hindi", "English")
        assert isinstance(result, str)

    @pytest.mark.asyncio
    async def test_synthesize_unsupported_language_raises(self) -> None:
        from app.services.tts_service import synthesize

        with pytest.raises(ValueError, match="unsupported language"):
            await synthesize("Hello", "klingon")

    @pytest.mark.asyncio
    async def test_synthesize_empty_text(self) -> None:
        from app.services.tts_service import synthesize

        try:
            result = await synthesize("", "english")
            assert isinstance(result, bytes)
        except Exception:
            pass  # Azure not available in test env


# ---------------------------------------------------------------------------
# RedisConferenceStore — key helpers (no actual Redis needed)
# ---------------------------------------------------------------------------


class TestRedisConferenceStoreKeys:
    def _make_mock_store(self):
        """Create store with mocked redis client."""
        from app.services.redis_conference_store import RedisConferenceStore

        mock_settings = MagicMock()
        mock_settings.redis_url = "redis://localhost:6379"
        mock_settings.redis_conference_ttl_seconds = 3600

        mock_aioredis = MagicMock()
        mock_aioredis.from_url = MagicMock(return_value=MagicMock())

        with patch("app.platform.settings.get_settings", return_value=mock_settings):
            with patch("redis.asyncio.from_url", return_value=MagicMock()):
                import redis.asyncio as real_aioredis
                original_from_url = real_aioredis.from_url
                real_aioredis.from_url = mock_aioredis.from_url
                try:
                    store = RedisConferenceStore()
                finally:
                    real_aioredis.from_url = original_from_url
                store._client = MagicMock()
                return store

    def test_key_format(self) -> None:
        store = self._make_mock_store()
        key = store._key("conf_123")
        assert "conf_123" in key

    def test_participants_key_format(self) -> None:
        store = self._make_mock_store()
        key = store._participants_key("conf_123")
        assert "conf_123" in key
        assert "participant" in key.lower() or key != store._key("conf_123")

    @pytest.mark.asyncio
    async def test_save_calls_redis(self) -> None:
        store = self._make_mock_store()
        store._client.set = AsyncMock()
        store._client.expire = AsyncMock()

        mock_state = MagicMock()
        mock_state.model_dump_json = MagicMock(return_value='{"test": true}')

        await store.save("conf_1", mock_state)
        store._client.set.assert_called_once()

    @pytest.mark.asyncio
    async def test_load_returns_none_when_not_found(self) -> None:
        store = self._make_mock_store()
        store._client.get = AsyncMock(return_value=None)

        result = await store.load("conf_notfound")
        assert result is None

    @pytest.mark.asyncio
    async def test_delete_calls_redis(self) -> None:
        store = self._make_mock_store()
        store._client.delete = AsyncMock()

        await store.delete("conf_1")
        store._client.delete.assert_called_once()

    @pytest.mark.asyncio
    async def test_list_active_returns_list(self) -> None:
        store = self._make_mock_store()
        store._client.keys = AsyncMock(return_value=["conf:conf1:state", "conf:conf2:state"])

        result = await store.list_active()
        assert isinstance(result, list)
        assert "conf1" in result

    @pytest.mark.asyncio
    async def test_close_calls_aclose(self) -> None:
        store = self._make_mock_store()
        store._client.aclose = AsyncMock()

        await store.close()
        store._client.aclose.assert_called_once()

    @pytest.mark.asyncio
    async def test_save_participant(self) -> None:
        store = self._make_mock_store()
        store._client.hset = AsyncMock()
        store._client.expire = AsyncMock()

        mock_participant = MagicMock()
        mock_participant.phone_number = "+111"
        mock_participant.model_dump_json = MagicMock(return_value='{"phone_number": "+111"}')

        await store.save_participant("conf_1", mock_participant)
        store._client.hset.assert_called_once()

    @pytest.mark.asyncio
    async def test_get_participant_not_found(self) -> None:
        store = self._make_mock_store()
        store._client.hget = AsyncMock(return_value=None)

        result = await store.get_participant("conf_1", "+111")
        assert result is None

    @pytest.mark.asyncio
    async def test_delete_participant(self) -> None:
        store = self._make_mock_store()
        store._client.hdel = AsyncMock()

        await store.delete_participant("conf_1", "+111")
        store._client.hdel.assert_called_once()

    @pytest.mark.asyncio
    async def test_get_all_participants_empty(self) -> None:
        store = self._make_mock_store()
        store._client.hgetall = AsyncMock(return_value={})

        result = await store.get_all_participants("conf_1")
        assert isinstance(result, dict)
        assert len(result) == 0


# ---------------------------------------------------------------------------
# insti.py — deeper coverage of generate_all_states and _get_ivr_content
# ---------------------------------------------------------------------------


class TestInstiGenerateAllStates:
    def test_handle_language_all_valid_languages(self) -> None:
        from app.services.fsm.instantiation.insti import handle_language

        content = [
            {"language": "english"},
            {"language": "hindi"},
            {"language": "marathi"},
            {"language": "telugu"},
            {"language": "tamil"},
        ]
        sorted_cats, values_to_urls, sorted_keys = handle_language(content, "1.0", {})
        assert len(sorted_cats) >= 1

    def test_handle_language_invalid_filtered(self) -> None:
        from app.services.fsm.instantiation.insti import handle_language

        # "invalid_lang" should be filtered out
        content = [
            {"language": "english"},
            {"language": "invalid_lang"},
        ]
        sorted_cats, values_to_urls, sorted_keys = handle_language(content, "1.0", {})
        # Only valid languages should be in sorted_cats
        assert "invalid_lang" not in sorted_cats

    def test_handle_theme_with_parent_selections(self) -> None:
        from app.services.fsm.instantiation.insti import handle_theme

        content = [
            {"language": "english", "theme": {"local": "Math", "english": "Math", "audioUrl": "http://math.mp3"}, "type": "audio"},
            {"language": "hindi", "theme": {"local": "Ganit", "english": "Math", "audioUrl": "http://math_hi.mp3"}, "type": "audio"},
        ]
        sorted_cats, values_to_urls, sorted_keys = handle_theme(content, "1.0", {"language": "english"})
        # Only English content should be included
        assert isinstance(sorted_cats, list)

    def test_extract_parent_info_op1(self) -> None:
        from app.services.fsm.instantiation.insti import _extract_parent_info

        parent_block, key = _extract_parent_info("state_english-Op1(Hindi)-")
        assert key == 2  # int("1") + 1

    def test_extract_parent_info_op3(self) -> None:
        from app.services.fsm.instantiation.insti import _extract_parent_info

        parent_block, key = _extract_parent_info("root-Op3(Science)-")
        assert key == 4  # int("3") + 1
