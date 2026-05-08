import logging
import sys
from azure.monitor.events.extension import track_event


class AppInsightsLogHandler(logging.Handler):
    """
    Attach to a logger to mirror logs to Azure App Insights. Supports structured logging.

    Example:
        from app.application_logger.azure_app_insights import AppInsightsLogHandler

        my_logger = AppInsightsLogHandler.getLogger("my_logger_name")
        my_logger.info("hello")
        my_logger.info("hello", extra={AppInsightsLogHandler.DETAILS: {
            "conference_id": "xyz",
            "participant": "91xx"
        }})
    """

    # Structured log fields in 'extra' map to customDimensions["details.*"]
    DETAILS = "Conference_v2_app_insights_log_handler_details_"

    @staticmethod
    def getLogger(name: str, level: int = logging.DEBUG) -> logging.Logger:
        logger = logging.getLogger(name)
        logger.setLevel(level)
        formatter = logging.Formatter("%(asctime)s %(name)s %(levelname)s: %(message)s")
        if not any(isinstance(h, logging.StreamHandler) and not isinstance(h, AppInsightsLogHandler) for h in logger.handlers):
            stream_handler = logging.StreamHandler(sys.stdout)
            stream_handler.setFormatter(formatter)
            logger.addHandler(stream_handler)
        if not any(isinstance(h, AppInsightsLogHandler) for h in logger.handlers):
            logger.addHandler(AppInsightsLogHandler())
        logger.propagate = False
        return logger

    def emit(self, record):
        details = {"details.level": record.levelname, "details.message": record.getMessage()}
        for k, v in getattr(record, AppInsightsLogHandler.DETAILS, {}).items():
            details["details." + k] = v
        track_event(record.name, details)
