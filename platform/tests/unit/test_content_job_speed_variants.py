from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest

from app.consumers.content_job_consumer import _variant_blob_name


class TestVariantBlobName:
    def test_base_speed_returns_unchanged(self) -> None:
        assert _variant_blob_name("content123/1.0.mp3", 1.0) == "content123/1.0.mp3"

    def test_inserts_suffix_before_extension(self) -> None:
        assert _variant_blob_name("content123/1.0.mp3", 1.5) == "content123/1.0__speed_1.5.mp3"

    def test_whole_number_speed_keeps_decimal(self) -> None:
        assert _variant_blob_name("content123/1.0.mp3", 2.0) == "content123/1.0__speed_2.0.mp3"

    def test_fractional_speed(self) -> None:
        assert _variant_blob_name("folder/subfolder/audio.wav", 0.75) == (
            "folder/subfolder/audio__speed_0.75.wav"
        )

    def test_no_extension(self) -> None:
        assert _variant_blob_name("content123/noext", 1.25) == "content123/noext__speed_1.25"


class TestApplyAtempo:
    @pytest.mark.asyncio
    async def test_runs_ffmpeg_with_atempo_filter_and_returns_bytes(self) -> None:
        from app.consumers.content_job_consumer import _apply_atempo

        def fake_run(cmd, **kwargs):
            output_path = cmd[-1]
            with open(output_path, "wb") as fh:
                fh.write(b"variant-bytes")
            assert "-filter:a" in cmd
            assert cmd[cmd.index("-filter:a") + 1] == "atempo=1.5"
            return AsyncMock(returncode=0)

        with patch("subprocess.run", side_effect=fake_run) as mock_run:
            result = await _apply_atempo(b"input-bytes", 1.5, "content-atempo-test", ".wav")

        assert result == b"variant-bytes"
        mock_run.assert_called_once()
        assert mock_run.call_args.kwargs["check"] is True


class TestGenerateSpeedVariants:
    @pytest.mark.asyncio
    async def test_generates_all_non_base_speeds(self) -> None:
        from app.consumers.content_job_consumer import _generate_speed_variants
        from app.services.fsm.instantiation.speed_control import SUPPORTED_SPEEDS

        async def fake_apply_atempo(input_bytes, speed, content_id, ext):
            return f"variant-{speed}".encode()

        with patch(
            "app.consumers.content_job_consumer._apply_atempo",
            side_effect=fake_apply_atempo,
        ):
            variants = await _generate_speed_variants(b"input-bytes", "content-x", ".wav")

        expected_speeds = {s for s in SUPPORTED_SPEEDS if s != 1.0}
        assert set(variants.keys()) == expected_speeds
        assert variants[1.5] == b"variant-1.5"

    @pytest.mark.asyncio
    async def test_excludes_base_speed(self) -> None:
        from app.consumers.content_job_consumer import _generate_speed_variants

        async def fake_apply_atempo(input_bytes, speed, content_id, ext):
            return b"x"

        with patch(
            "app.consumers.content_job_consumer._apply_atempo",
            side_effect=fake_apply_atempo,
        ):
            variants = await _generate_speed_variants(b"input-bytes", "content-x", ".wav")

        assert 1.0 not in variants

    @pytest.mark.asyncio
    async def test_one_failed_speed_does_not_fail_the_rest(self) -> None:
        from app.consumers.content_job_consumer import _generate_speed_variants

        async def fake_apply_atempo(input_bytes, speed, content_id, ext):
            if speed == 1.5:
                raise RuntimeError("ffmpeg exploded")
            return f"variant-{speed}".encode()

        with patch(
            "app.consumers.content_job_consumer._apply_atempo",
            side_effect=fake_apply_atempo,
        ):
            variants = await _generate_speed_variants(b"input-bytes", "content-x", ".wav")

        assert 1.5 not in variants
        assert variants[0.75] == b"variant-0.75"
        assert variants[2.0] == b"variant-2.0"


class TestProcessAudioItemUploadsVariants:
    @pytest.mark.asyncio
    async def test_uploads_base_and_all_speed_variants(self, tmp_path) -> None:
        from app.consumers.content_job_consumer import _process_audio_item

        blob_provider = AsyncMock()
        blob_provider.download_from_url = AsyncMock(return_value=b"raw-mp3-bytes")
        uploaded = []

        async def fake_upload_file(container, blob_name, data, content_type):
            uploaded.append((container, blob_name, content_type))
            return f"https://storage.example.com/{container}/{blob_name}"

        blob_provider.upload_file = AsyncMock(side_effect=fake_upload_file)

        async def fake_transcode(input_path, output_path):
            with open(output_path, "wb") as fh:
                fh.write(b"transcoded-wav-bytes")

        async def fake_generate_speed_variants(input_bytes, content_id, ext):
            return {0.75: b"v075", 1.25: b"v125", 1.5: b"v15", 2.0: b"v20"}

        with (
            patch("app.consumers.content_job_consumer._transcode_to_wav", side_effect=fake_transcode),
            patch("app.consumers.content_job_consumer._extract_duration", AsyncMock(return_value=5.0)),
            patch(
                "app.consumers.content_job_consumer._generate_speed_variants",
                side_effect=fake_generate_speed_variants,
            ),
        ):
            new_url, duration = await _process_audio_item(
                "https://storage.example.com/uploads/lesson/clip.mp3", "content-abc", blob_provider
            )

        assert duration == 5.0
        assert new_url == "https://storage.example.com/output-container/lesson/clip.wav"
        base_calls = [c for c in uploaded if c[1] == "lesson/clip.wav"]
        assert len(base_calls) == 1
        variant_names = {c[1] for c in uploaded if c[1] != "lesson/clip.wav"}
        assert variant_names == {
            "lesson/clip__speed_0.75.wav",
            "lesson/clip__speed_1.25.wav",
            "lesson/clip__speed_1.5.wav",
            "lesson/clip__speed_2.0.wav",
        }
        assert all(c[0] == "output-container" for c in uploaded)
        assert all(c[2] == "audio/wav" for c in uploaded)

