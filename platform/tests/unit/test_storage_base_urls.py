"""IVR menu, IVR content, FSM error-audio, and conference audio URLs follow STORAGE_BACKEND."""

from __future__ import annotations

import pytest

WRONG_OPTION_PATH = "chosenWrongOptionDialog/kannada/Sorry,%20you%20have%20chosen%20the%20wrong%20option/1.0.mp3"


@pytest.fixture(params=["object-store", "azure"])
def storage(request, monkeypatch):
    if request.param == "azure":
        pytest.importorskip("azure.storage.blob")
        monkeypatch.setenv(
            "AZURE_STORAGE_CONNECTION_STRING",
            "DefaultEndpointsProtocol=https;AccountName=acct;AccountKey=dGVzdGtleQ==;EndpointSuffix=core.windows.net",
        )
        monkeypatch.setenv("STORAGE_BACKEND", "azure")
        return "https://acct.blob.core.windows.net"
    for name in ("AZURE_STORAGE_ACCOUNT_NAME", "AZURE_STORAGE_ACCOUNT_KEY", "AZURE_STORAGE_CONNECTION_STRING"):
        monkeypatch.delenv(name, raising=False)
    monkeypatch.setenv("STORAGE_BACKEND", "object-store")
    monkeypatch.setenv("OBJECT_STORE_ENDPOINT_URL", "http://minio.test:9000")
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


async def test_presigned_link_uses_public_endpoint_when_set(monkeypatch):
    from app.platform.settings import get_settings
    from app.providers.object_store_blob_storage import ObjectStoreBlobStorageProvider

    monkeypatch.setenv("OBJECT_STORE_ENDPOINT_URL", "http://internal-store:9000")
    monkeypatch.setenv("OBJECT_STORE_PUBLIC_ENDPOINT_URL", "https://files.example.com")
    get_settings.cache_clear()
    url = await ObjectStoreBlobStorageProvider().generate_sas_url("bucket", "a.mp3")
    assert url.startswith("https://files.example.com/bucket/a.mp3?")

    monkeypatch.delenv("OBJECT_STORE_PUBLIC_ENDPOINT_URL")
    get_settings.cache_clear()
    url = await ObjectStoreBlobStorageProvider().generate_sas_url("bucket", "a.mp3")
    assert url.startswith("http://internal-store:9000/bucket/a.mp3?")


def test_blob_and_container_urls_use_public_endpoint_when_set(monkeypatch):
    from app.platform.settings import get_settings
    from app.providers.object_store_blob_storage import ObjectStoreBlobStorageProvider

    monkeypatch.setenv("OBJECT_STORE_ENDPOINT_URL", "http://internal-store:9000")
    monkeypatch.setenv("OBJECT_STORE_PUBLIC_ENDPOINT_URL", "https://files.example.com")
    get_settings.cache_clear()
    provider = ObjectStoreBlobStorageProvider()

    assert provider.container_url("bucket") == "https://files.example.com/bucket/"
    assert provider.blob_url("bucket", "a b.mp3") == "https://files.example.com/bucket/a%20b.mp3"
