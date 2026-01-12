"""Application Insights and OpenTelemetry configuration."""

import logging
from typing import Optional
from contextlib import contextmanager

from azure.monitor.opentelemetry import configure_azure_monitor
from opentelemetry import trace, metrics
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from opentelemetry.instrumentation.pymongo import PymongoInstrumentor
from opentelemetry.instrumentation.requests import RequestsInstrumentor
from opentelemetry.instrumentation.logging import LoggingInstrumentor
from opentelemetry.trace import Status, StatusCode

from app.settings import settings

logger = logging.getLogger(__name__)

# Global telemetry state
_telemetry_initialized = False
_tracer: Optional[trace.Tracer] = None
_meter: Optional[metrics.Meter] = None
_metrics_instruments = {}


def initialize_telemetry() -> bool:
    """Initialize Azure Application Insights with OpenTelemetry."""
    global _telemetry_initialized, _tracer, _meter

    if _telemetry_initialized:
        logger.info("Telemetry already initialized")
        return True

    if not settings.enable_application_insights:
        logger.info("Application Insights is disabled")
        return False

    if not settings.applicationinsights_connection_string:
        logger.warning("Application Insights connection string not configured")
        return False

    try:
        logger.info("Initializing Azure Application Insights...")

        # Configure Azure Monitor
        configure_azure_monitor(
            connection_string=settings.applicationinsights_connection_string,
            enable_live_metrics=True,
        )

        # Get tracer and meter for custom instrumentation
        _tracer = trace.get_tracer(__name__, "1.0.0")
        _meter = metrics.get_meter(__name__, "1.0.0")

        # Initialize custom metrics instruments
        _initialize_custom_metrics()

        # Auto-instrument libraries
        _auto_instrument()

        _telemetry_initialized = True
        logger.info("✓ Telemetry initialized successfully")
        return True

    except Exception as e:
        logger.error(f"Failed to initialize Application Insights: {e}", exc_info=True)
        return False


def _initialize_custom_metrics():
    """Initialize custom metric instruments."""
    global _metrics_instruments

    # Call metrics
    _metrics_instruments['call_started'] = _meter.create_counter(
        name="ivrv2.calls.started",
        description="Number of IVR calls started",
        unit="1"
    )
    _metrics_instruments['call_completed'] = _meter.create_counter(
        name="ivrv2.calls.completed",
        description="Number of IVR calls completed",
        unit="1"
    )
    _metrics_instruments['call_duration'] = _meter.create_histogram(
        name="ivrv2.calls.duration",
        description="Duration of IVR calls in seconds",
        unit="s"
    )

    # FSM metrics
    _metrics_instruments['fsm_state_transition'] = _meter.create_counter(
        name="ivrv2.fsm.state_transitions",
        description="Number of FSM state transitions",
        unit="1"
    )
    _metrics_instruments['fsm_dtmf_input'] = _meter.create_counter(
        name="ivrv2.fsm.dtmf_inputs",
        description="Number of DTMF inputs received",
        unit="1"
    )
    _metrics_instruments['fsm_instantiation_duration'] = _meter.create_histogram(
        name="ivrv2.fsm.instantiation_duration",
        description="Time taken to instantiate FSM in seconds",
        unit="s"
    )

    # Queue metrics
    _metrics_instruments['queue_message_processed'] = _meter.create_counter(
        name="ivrv2.queue.messages_processed",
        description="Number of queue messages processed",
        unit="1"
    )
    _metrics_instruments['queue_processing_duration'] = _meter.create_histogram(
        name="ivrv2.queue.processing_duration",
        description="Time taken to process queue message in seconds",
        unit="s"
    )
    _metrics_instruments['queue_error'] = _meter.create_counter(
        name="ivrv2.queue.errors",
        description="Number of queue processing errors",
        unit="1"
    )

    # Database metrics
    _metrics_instruments['db_operation_duration'] = _meter.create_histogram(
        name="ivrv2.database.operation_duration",
        description="Duration of database operations in seconds",
        unit="s"
    )

    # Vonage API metrics
    _metrics_instruments['vonage_api_call'] = _meter.create_counter(
        name="ivrv2.vonage.api_calls",
        description="Number of Vonage API calls",
        unit="1"
    )
    _metrics_instruments['vonage_api_duration'] = _meter.create_histogram(
        name="ivrv2.vonage.api_duration",
        description="Duration of Vonage API calls in seconds",
        unit="s"
    )

    logger.info("✓ Custom metrics instruments initialized")


def _auto_instrument():
    """Configure auto-instrumentation for common libraries."""
    try:
        # Instrument logging
        LoggingInstrumentor().instrument(
            set_logging_format=False,
            log_level=getattr(logging, settings.appinsights_log_level, logging.INFO)
        )

        # Instrument HTTP requests (Vonage SDK)
        RequestsInstrumentor().instrument()

        # Instrument PyMongo (Motor uses PyMongo internally)
        PymongoInstrumentor().instrument()

        logger.info("✓ Auto-instrumentation configured")

    except Exception as e:
        logger.warning(f"Failed to configure auto-instrumentation: {e}")


def instrument_fastapi(app):
    """Instrument a FastAPI application for distributed tracing."""
    if not _telemetry_initialized:
        return

    try:
        FastAPIInstrumentor.instrument_app(app)
        logger.info("✓ FastAPI instrumented")
    except Exception as e:
        logger.warning(f"Failed to instrument FastAPI: {e}")


def shutdown_telemetry():
    """Shutdown telemetry and flush pending data."""
    global _telemetry_initialized

    if not _telemetry_initialized:
        return

    try:
        logger.info("Shutting down telemetry...")

        # Flush trace and meter providers
        trace_provider = trace.get_tracer_provider()
        if hasattr(trace_provider, 'force_flush'):
            trace_provider.force_flush(timeout_millis=5000)

        meter_provider = metrics.get_meter_provider()
        if hasattr(meter_provider, 'force_flush'):
            meter_provider.force_flush(timeout_millis=5000)

        _telemetry_initialized = False
        logger.info("✓ Telemetry shutdown complete")

    except Exception as e:
        logger.error(f"Error during telemetry shutdown: {e}")


def get_tracer() -> Optional[trace.Tracer]:
    """Get the global tracer for manual instrumentation."""
    return _tracer


def get_meter() -> Optional[metrics.Meter]:
    """Get the global meter for custom metrics."""
    return _meter


def get_metric_instrument(name: str):
    """Get a specific metric instrument by name."""
    return _metrics_instruments.get(name)


@contextmanager
def trace_operation(operation_name: str, attributes: dict = None):
    """
    Context manager for tracing custom operations.

    Usage:
        with trace_operation("process_dtmf", {"conversation_uuid": uuid}):
            # Your code here
            pass
    """
    if not _tracer:
        yield None
        return

    with _tracer.start_as_current_span(operation_name) as span:
        if attributes:
            for key, value in attributes.items():
                span.set_attribute(key, str(value))

        try:
            yield span
        except Exception as e:
            span.set_status(Status(StatusCode.ERROR, str(e)))
            span.record_exception(e)
            raise


def track_metric(metric_name: str, value: float, attributes: dict = None):
    """Track a custom metric value."""
    instrument = _metrics_instruments.get(metric_name)
    if not instrument:
        return

    try:
        if hasattr(instrument, 'add'):  # Counter
            instrument.add(value, attributes or {})
        elif hasattr(instrument, 'record'):  # Histogram
            instrument.record(value, attributes or {})
    except Exception as e:
        logger.warning(f"Failed to track metric '{metric_name}': {e}")
