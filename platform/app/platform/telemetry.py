"""
Azure Monitor / OpenTelemetry telemetry configuration for SEEDS Platform.

Usage in main.py:
    from app.platform.telemetry import configure_telemetry
    from app.platform.settings import get_settings
    configure_telemetry(get_settings())

Usage anywhere:
    from app.platform.telemetry import get_counter, get_histogram, get_updown_counter
    get_counter("auth.failures").add(1, {"reason": "invalid_token"})
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Any

from azure.monitor.opentelemetry import configure_azure_monitor
from opentelemetry import metrics as otel_metrics
from opentelemetry.instrumentation.httpx import HTTPXClientInstrumentor
from opentelemetry.instrumentation.logging.handler import LoggingHandler as _OTelLoggingHandler
from opentelemetry.instrumentation.pymongo import PymongoInstrumentor

from app.platform.logging import AppInsightsEventHandler

if TYPE_CHECKING:
    from app.platform.settings import Settings

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Module-level state
# ---------------------------------------------------------------------------

_telemetry_configured: bool = False
_metrics: dict[str, Any] = {}


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def configure_telemetry(settings: Settings) -> None:
    """Configure Azure Monitor telemetry and register custom metrics.

    This function is idempotent — subsequent calls are no-ops.

    Args:
        settings: Platform settings carrying the Application Insights
            connection string. Optional — if empty, telemetry is skipped
            and metric getters return no-op instruments.
    """
    global _telemetry_configured, _metrics  # noqa: PLW0603

    if _telemetry_configured:
        return

    if settings.applicationinsights_connection_string:
        configure_azure_monitor(
            connection_string=settings.applicationinsights_connection_string,
            instrumentation_options={"fastapi": {"enabled": False}},
        )

        root_logger = logging.getLogger()
        for handler in list(root_logger.handlers):
            if isinstance(handler, _OTelLoggingHandler):
                root_logger.removeHandler(handler)

        logging.getLogger("app").addHandler(AppInsightsEventHandler())

        PymongoInstrumentor().instrument()
        HTTPXClientInstrumentor().instrument()
    else:
        logger.warning("APPLICATIONINSIGHTS_CONNECTION_STRING not set — telemetry disabled")

    _metrics = _build_metrics()
    _telemetry_configured = True
    logger.info("Azure Monitor telemetry configured successfully")


def get_counter(name: str) -> Any:
    """Return the named Counter.

    Args:
        name: Registered counter name (see `_COUNTER_NAMES`).
    """
    return _metrics[name]


def get_histogram(name: str) -> Any:
    """Return the named Histogram.

    Args:
        name: Registered histogram name (see `_HISTOGRAM_NAMES_WITH_UNITS`).
    """
    return _metrics[name]


def get_updown_counter(name: str) -> Any:
    """Return the named UpDownCounter.

    Args:
        name: Registered up-down-counter name (see `_UPDOWN_COUNTER_NAMES`).
    """
    return _metrics[name]


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _build_metrics() -> dict[str, Any]:
    """Create OTel metric instruments backed by Azure Monitor."""
    meter = otel_metrics.get_meter("seeds.platform")
    result: dict[str, Any] = {}

    for name in _COUNTER_NAMES:
        result[name] = meter.create_counter(
            name=name,
            description=f"Counter: {name}",
        )

    for name, unit in _HISTOGRAM_NAMES_WITH_UNITS:
        result[name] = meter.create_histogram(
            name=name,
            unit=unit,
            description=f"Histogram: {name}",
        )

    for name in _UPDOWN_COUNTER_NAMES:
        result[name] = meter.create_up_down_counter(
            name=name,
            description=f"UpDownCounter: {name}",
        )

    return result


# ---------------------------------------------------------------------------
# Metric name registries
# ---------------------------------------------------------------------------

_COUNTER_NAMES: list[str] = [
    "conferences.created",
    "conferences.ended",
    "ivr.calls.started",
    "ivr.dtmf.processed",
    "jobs.content.completed",
    "jobs.content.failed",
    "auth.failures",
    "vonage.api.errors",
]

# (name, unit) pairs
_HISTOGRAM_NAMES_WITH_UNITS: list[tuple[str, str]] = [
    ("http.request.duration_ms", "ms"),
    ("conference.event.duration_ms", "ms"),
    ("blob.download.duration_ms", "ms"),
    ("job.processing.duration_ms", "ms"),
]

_UPDOWN_COUNTER_NAMES: list[str] = [
    "conferences.active",
    "ivr.calls.active",
    "ws.connections.active",
]
