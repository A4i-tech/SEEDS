"""
Centralized telemetry configuration for the IVR application.

This module configures Azure Monitor OpenTelemetry once and provides
a utility function to get tracers for different modules.

Usage:
    In your main application entry point (e.g., main.py):

    ```python
    from app.core.telemetry import configure_telemetry, get_tracer

    # Configure telemetry once at application startup
    configure_telemetry()

    # Get a tracer for the module
    tracer = get_tracer(__name__)
    ```

    In other modules (e.g., services, workers, processors):

    ```python
    from app.core.telemetry import get_tracer

    # Get a tracer for this module
    tracer = get_tracer(__name__)

    # Use the tracer in your code
    def my_function():
        with tracer.start_as_current_span("my_operation"):
            # Your code here
            pass
    ```
"""

import logging
from typing import Optional
from opentelemetry import trace
from opentelemetry.trace import Tracer, TracerProvider, get_tracer_provider
from azure.monitor.opentelemetry import configure_azure_monitor
from app.settings import settings

# Flag to ensure Azure Monitor is configured only once
_telemetry_configured = False


def configure_telemetry() -> None:
    """
    Configure Azure Monitor telemetry once for the entire application.

    This function is idempotent - it can be called multiple times but will
    only configure telemetry once.
    """
    global _telemetry_configured

    if _telemetry_configured:
        return

    if settings.applicationinsights_connection_string:
        try:
            configure_azure_monitor(
                connection_string=settings.applicationinsights_connection_string,
            )
            _telemetry_configured = True
            logging.info("Azure Monitor telemetry configured successfully")
        except Exception as e:
            logging.error(f"Failed to configure Azure Monitor telemetry: {e}")
            # Don't set _telemetry_configured to True so it can be retried
    else:
        logging.warning(
            "Application Insights connection string not set - telemetry disabled"
        )
        _telemetry_configured = True  # Mark as configured to avoid repeated warnings


def get_tracer(module_name: str) -> Tracer:
    """
    Get a tracer for the specified module.

    Args:
        module_name: The name of the module requesting a tracer (typically __name__)

    Returns:
        A configured Tracer instance for the module
    """
    return trace.get_tracer(module_name, tracer_provider=get_tracer_provider())


def is_telemetry_configured() -> bool:
    """
    Check if telemetry has been configured.

    Returns:
        True if telemetry has been configured, False otherwise
    """
    return _telemetry_configured
