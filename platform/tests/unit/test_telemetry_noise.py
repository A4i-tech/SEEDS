from __future__ import annotations

import logging
from unittest.mock import patch

import app.platform.telemetry as tel_mod
from app.platform.settings import Settings

_CONNECTION_STRING = (
    "InstrumentationKey=00000000-0000-0000-0000-000000000000;"
    "IngestionEndpoint=https://fake.example.com/"
)


def test_configure_telemetry_silences_exporter_and_azure_sdk_spans(monkeypatch):
    monkeypatch.setattr(tel_mod, "_telemetry_configured", False)
    monkeypatch.setattr(tel_mod, "_metrics", {})
    for name in tel_mod._QUIET_LOGGERS:
        monkeypatch.setattr(logging.getLogger(name), "level", logging.NOTSET)

    with patch.object(tel_mod, "configure_azure_monitor") as configure:
        tel_mod.configure_telemetry(
            Settings(applicationinsights_connection_string=_CONNECTION_STRING)
        )

    options = configure.call_args.kwargs["instrumentation_options"]
    assert options["azure_sdk"] == {"enabled": False}
    for name in tel_mod._QUIET_LOGGERS:
        assert logging.getLogger(name).level == logging.WARNING
