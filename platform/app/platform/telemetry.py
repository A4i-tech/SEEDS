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

if TYPE_CHECKING:
    from app.platform.settings import Settings

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Module-level state
# ---------------------------------------------------------------------------

_telemetry_configured: bool = False
_metrics: dict[str, Any] = {}


# ---------------------------------------------------------------------------
# No-op instruments (used when telemetry is disabled)
# ---------------------------------------------------------------------------


class _NoopCounter:
    def add(self, amount: float, attributes: dict | None = None) -> None:
        pass


class _NoopHistogram:
    def record(self, amount: float, attributes: dict | None = None) -> None:
        pass


class _NoopUpDownCounter:
    def add(self, amount: float, attributes: dict | None = None) -> None:
        pass


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def configure_telemetry(settings: "Settings") -> None:
    """
    Configure Azure Monitor telemetry and register custom metrics.

    This function is idempotent — subsequent calls are no-ops.

    If *settings.applicationinsights_connection_string* is empty/None the
    function registers no-op instruments so callers never have to branch.
    """
    global _telemetry_configured, _metrics  # noqa: PLW0603

    if _telemetry_configured:
        return

    conn_str: str = settings.applicationinsights_connection_string or ""

    if conn_str:
        try:
            from azure.monitor.opentelemetry import configure_azure_monitor  # noqa: PLC0415
            from opentelemetry.instrumentation.fastapi import (  # noqa: PLC0415
                FastAPIInstrumentor,
            )
            from opentelemetry.instrumentation.pymongo import (  # noqa: PLC0415
                PymongoInstrumentor,
            )
            from opentelemetry.instrumentation.httpx import (  # noqa: PLC0415
                HTTPXClientInstrumentor,
            )
            from opentelemetry.instrumentation.logging import (  # noqa: PLC0415
                LoggingInstrumentor,
            )

            configure_azure_monitor(connection_string=conn_str)

            FastAPIInstrumentor().instrument()
            PymongoInstrumentor().instrument()
            HTTPXClientInstrumentor().instrument()
            LoggingInstrumentor().instrument()

            _metrics = _build_real_metrics()
            _telemetry_configured = True
            logger.info("Azure Monitor telemetry configured successfully")
        except Exception as exc:  # noqa: BLE001
            logger.error("Failed to configure Azure Monitor telemetry: %s", exc)
            # Leave _telemetry_configured=False so it can be retried
    else:
        logger.warning(
            "Application Insights connection string not set — telemetry disabled (no-op instruments registered)"
        )
        _metrics = _build_noop_metrics()
        _telemetry_configured = True


def get_counter(name: str) -> Any:
    """Return the named Counter, or a no-op Counter if telemetry is not active."""
    return _metrics.get(name, _NoopCounter())


def get_histogram(name: str) -> Any:
    """Return the named Histogram, or a no-op Histogram if telemetry is not active."""
    return _metrics.get(name, _NoopHistogram())


def get_updown_counter(name: str) -> Any:
    """Return the named UpDownCounter, or a no-op UpDownCounter if telemetry is not active."""
    return _metrics.get(name, _NoopUpDownCounter())


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _build_noop_metrics() -> dict[str, Any]:
    """Return a dict of no-op metric instruments keyed by name."""
    metrics: dict[str, Any] = {}
    for name in _COUNTER_NAMES:
        metrics[name] = _NoopCounter()
    for name in _HISTOGRAM_NAMES:
        metrics[name] = _NoopHistogram()
    for name in _UPDOWN_COUNTER_NAMES:
        metrics[name] = _NoopUpDownCounter()
    return metrics


def _build_real_metrics() -> dict[str, Any]:
    """Create real OTel metric instruments backed by Azure Monitor."""
    from opentelemetry import metrics as otel_metrics  # noqa: PLC0415

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

_HISTOGRAM_NAMES: list[str] = [name for name, _ in _HISTOGRAM_NAMES_WITH_UNITS]

_UPDOWN_COUNTER_NAMES: list[str] = [
    "conferences.active",
    "ivr.calls.active",
    "ws.connections.active",
]
