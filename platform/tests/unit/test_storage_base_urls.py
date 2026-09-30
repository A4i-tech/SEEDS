"""IVR menu, IVR content, FSM error-audio, and conference audio URLs follow STORAGE_BACKEND."""

from __future__ import annotations

import pytest

WRONG_OPTION_PATH = "chosenWrongOptionDialog/kannada/Sorry,%20you%20have%20chosen%20the%20wrong%20option/1.0.mp3"


@pytest.fixture(params=["s3", "azure"])
def storage(request, monkeypatch):
    if request.param == "azure":
        pytest.importorskip("azure.storage.blob")
        monkeypatch.setenv("AZURE_STORAGE_ACCOUNT_NAME", "acct")
        monkeypatch.setenv("AZURE_STORAGE_ACCOUNT_KEY", "dGVzdGtleQ==")
        monkeypatch.setenv("STORAGE_BACKEND", "azure")
        return "https://acct.blob.core.windows.net"
    for name in ("AZURE_STORAGE_ACCOUNT_NAME", "AZURE_STORAGE_ACCOUNT_KEY", "AZURE_STORAGE_CONNECTION_STRING"):
        monkeypatch.delenv(name, raising=False)
    monkeypatch.setenv("STORAGE_BACKEND", "s3")
    monkeypatch.setenv("S3_ENDPOINT_URL", "http://minio.test:9000")
    return "http://minio.test:9000"


def test_builders_derive_urls_from_the_selected_backend(storage) -> None:
    from app.models.system_audio_messages import SystemAudioMessages
    from app.services.fsm.fsm import FSM
    from app.services.fsm.instantiation.ivr_constants import get_content_url, get_pull_menu_main_url

    fsm = FSM("fsm-1")

    assert get_pull_menu_main_url() == f"{storage}/pull-model-menus/"
    assert get_content_url() == f"{storage}/output-container/"
    assert fsm.invalid_input_error_actions[0].url == f"{storage}/pull-model-menus/{WRONG_OPTION_PATH}"
    assert (
        SystemAudioMessages.WELCOME_TEACHER.url
        == f"{storage}/conference/conferenceMessagesWav/english/teacher_welcome_message.wav"
    )
