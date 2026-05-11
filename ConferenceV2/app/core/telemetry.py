import logging
from opentelemetry import trace
from opentelemetry.trace import Tracer, get_tracer_provider
from azure.monitor.opentelemetry import configure_azure_monitor
from config import get_settings

_telemetry_configured = False


def configure_telemetry() -> None:
    """Configure Azure Monitor telemetry once for the entire application. Idempotent."""
    global _telemetry_configured

    if _telemetry_configured:
        return

    settings = get_settings()
    connection_string = settings.APPLICATIONINSIGHTS_CONNECTION_STRING

    if not connection_string:
        raise RuntimeError(
            "APPLICATIONINSIGHTS_CONNECTION_STRING is not set — telemetry is required"
        )

    configure_azure_monitor(connection_string=connection_string)
    _telemetry_configured = True
    logging.info("Azure Monitor telemetry configured successfully")


def get_tracer(module_name: str) -> Tracer:
    return trace.get_tracer(module_name, tracer_provider=get_tracer_provider())


def is_telemetry_configured() -> bool:
    return _telemetry_configured
