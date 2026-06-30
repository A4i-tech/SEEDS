import logging
from pathlib import Path
import sys
from dotenv import load_dotenv
from datetime import datetime
import pytz
from config import get_settings
from app.application_logger.azure_app_insights import AppInsightsLogHandler

load_dotenv()

class ConferenceLogger:
    def __init__(self, version="1"):
        # Create a logger instance
        self.logger = logging.getLogger("ConferenceLogger")
        self.logger.setLevel(logging.DEBUG)  # Capture all log levels
        self.logger.propagate = False
        
        # Version number to be included in logs
        self.version = version
        settings = get_settings()
        environment = settings.ENVIRONMENT
        log_to_file = settings.LOG_TO_FILE
        log_file_path = settings.LOG_FILE_PATH

        # Prevent duplicate handlers when module reloads.
        if self.logger.handlers:
            self.logger.handlers.clear()
        
        # Check if the app is running locally or in production
        if environment == 'production':
            # In production, send logs to Azure App Insights
            app_insights_conn_str = settings.APPLICATIONINSIGHTS_CONNECTION_STRING
            if self.add_app_insights_handler(app_insights_conn_str) is False:
                # Fall back to console logging when App Insights config is unavailable/invalid.
                self.add_console_handler()
        else:
            # Locally, print logs to both stdout and stderr
            self.add_console_handler()

        if log_to_file:
            self.add_file_handler(log_file_path)

    def add_app_insights_handler(self, connection_string):
        if not connection_string:
            return False

        try:
            if not any(isinstance(h, AppInsightsLogHandler) for h in self.logger.handlers):
                self.logger.addHandler(AppInsightsLogHandler())
            return True
        except Exception:
            return False

    def add_console_handler(self):
        # Handler to log to stdout (normal log output)
        stdout_handler = logging.StreamHandler(sys.stdout)
        stdout_handler.setLevel(logging.DEBUG)
        
        # Handler to log to stderr (for errors)
        stderr_handler = logging.StreamHandler(sys.stderr)
        stderr_handler.setLevel(logging.ERROR)

        self.logger.addHandler(stdout_handler)
        self.logger.addHandler(stderr_handler)

    def add_file_handler(self, file_path: str):
        # Optional file logging for local diagnostics
        file_handler = logging.FileHandler(file_path)
        file_handler.setLevel(logging.DEBUG)
        self.logger.addHandler(file_handler)

    def _format_message(self, *args):
        # Prepend timestamp in IST and version number to each log
        ist_timezone = pytz.timezone('Asia/Kolkata')
        timestamp = datetime.now(ist_timezone).strftime('%Y-%m-%d %H:%M:%S')
        message = ' '.join(map(str, args))  # Concatenate all arguments into a single string
        return f"[{timestamp}] [Version: {self.version}] {message}"

    # Log level methods
    def debug(self, *args, **kwargs):
        self.logger.debug(self._format_message(*args), **kwargs)

    def info(self, *args, **kwargs):
        self.logger.info(self._format_message(*args), **kwargs)

    def warning(self, *args, **kwargs):
        self.logger.warning(self._format_message(*args), **kwargs)

    def error(self, *args, **kwargs):
        self.logger.error(self._format_message(*args), **kwargs)

    def critical(self, *args, **kwargs):
        self.logger.critical(self._format_message(*args), **kwargs)

    def exception(self, *args, **kwargs):
        self.logger.exception(self._format_message(*args), **kwargs)


# Read the version from the version file or use "Unknown" if not found
version_file = Path("version.txt")
if version_file.exists():
    app_version = version_file.read_text().strip()
else:
    app_version = "Unknown"
    
# Create the logger instance with the version from the file
logger_instance = ConferenceLogger(version=app_version)
