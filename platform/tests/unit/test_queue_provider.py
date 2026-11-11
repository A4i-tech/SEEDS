from __future__ import annotations

import sys
from unittest.mock import AsyncMock, patch

import pytest
from pydantic import ValidationError

from app.platform.settings import Settings, get_settings
from app.providers.service_bus import ServiceBusProvider

AZURE_MODULE = "app.providers.azure_service_bus_queue"


@pytest.fixture(autouse=True)
def fresh_settings_cache():
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


@pytest.fixture
def no_queue_env(monkeypatch):
    for name in ("QUEUE_PROVIDER", "AZURE_SERVICE_BUS_CONNECTION_STRING"):
        monkeypatch.delenv(name, raising=False)


def test_default_provider_is_nats_without_azure_settings(no_queue_env):
    s = Settings(_env_file=None)
    assert s.queue_provider == "nats"
    assert s.azure_service_bus_connection_string == ""


@pytest.mark.parametrize(
    ("raw", "expected"),
    [("nats", "nats"), (" NATS ", "nats"), ("azure_service_bus", "azure_service_bus")],
)
def test_valid_provider_values(no_queue_env, raw, expected):
    s = Settings(
        _env_file=None, queue_provider=raw, azure_service_bus_connection_string="Endpoint=sb://x"
    )
    assert s.queue_provider == expected


def test_azure_connection_string_without_provider_is_rejected(no_queue_env):
    with pytest.raises(ValidationError, match="QUEUE_PROVIDER is not"):
        Settings(_env_file=None, azure_service_bus_connection_string="Endpoint=sb://x")


def test_explicit_nats_with_azure_connection_string_is_accepted(no_queue_env):
    s = Settings(
        _env_file=None, queue_provider="nats", azure_service_bus_connection_string="Endpoint=sb://x"
    )
    assert s.queue_provider == "nats"


def test_invalid_provider_error_names_allowed_values(no_queue_env):
    with pytest.raises(ValidationError, match="'nats' or 'azure_service_bus'"):
        Settings(_env_file=None, queue_provider="kafka")


def test_azure_provider_requires_connection_string(no_queue_env):
    with pytest.raises(ValidationError, match="AZURE_SERVICE_BUS_CONNECTION_STRING is empty"):
        Settings(_env_file=None, queue_provider="azure_service_bus")


async def test_nats_is_chosen_by_default_and_azure_module_stays_unloaded(no_queue_env, monkeypatch):
    monkeypatch.setenv("QUEUE_PROVIDER", "nats")
    monkeypatch.delitem(sys.modules, AZURE_MODULE, raising=False)
    provider = ServiceBusProvider()

    with (
        patch("app.providers.nats_queue._NatsQueueHandle.initialize", new=AsyncMock()),
        patch("app.providers.nats_queue._NatsQueueHandle.close", new=AsyncMock()),
    ):
        await provider.initialize()

    from app.providers.nats_queue import _NatsQueueHandle

    handles = [
        provider.get_call_webhook_queue(),
        provider.get_dtmf_input_queue(),
        provider.get_call_event_queue(),
        provider.get_sync_jobs_queue(),
    ]
    assert all(isinstance(h, _NatsQueueHandle) for h in handles)
    assert AZURE_MODULE not in sys.modules


async def test_azure_provider_chooses_azure_handle(no_queue_env, monkeypatch):
    monkeypatch.setenv("QUEUE_PROVIDER", "azure_service_bus")
    monkeypatch.setenv("AZURE_SERVICE_BUS_CONNECTION_STRING", "Endpoint=sb://x")
    provider = ServiceBusProvider()

    with (
        patch(f"{AZURE_MODULE}._AzureQueueHandle.initialize", new=AsyncMock()),
        patch(f"{AZURE_MODULE}._AzureQueueHandle.close", new=AsyncMock()),
    ):
        await provider.initialize()

    from app.providers.azure_service_bus_queue import _AzureQueueHandle

    assert isinstance(provider.get_call_event_queue(), _AzureQueueHandle)
    assert provider.get_call_event_queue().connection_string == "Endpoint=sb://x"


async def test_azure_handle_without_package_names_the_extra(monkeypatch):
    from app.providers.azure_service_bus_queue import _AzureQueueHandle

    monkeypatch.setitem(sys.modules, "azure.servicebus.aio", None)
    with pytest.raises(RuntimeError, match="poetry install --extras azure"):
        await _AzureQueueHandle("Endpoint=sb://x", "q").initialize()
