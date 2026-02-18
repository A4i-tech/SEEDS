import logging
import os
from pathlib import Path
import sys
from dotenv import load_dotenv
from opencensus.ext.azure.log_exporter import AzureLogHandler
from datetime import datetime
import pytz  # For timezone handling

load_dotenv()

class ConferenceLogger:
    def __init__(self, version="1"):
        # Create a logger instance
        self.logger = logging.getLogger("ConferenceLogger")
        self.logger.setLevel(logging.DEBUG)  # Capture all log levels
        self.logger.propagate = False
        
        # Version number to be included in logs
        self.version = version
        
        environment = os.getenv('ENVIRONMENT', 'production')
        log_to_file = os.getenv("LOG_TO_FILE", "false").lower() == "true"
        log_file_path = os.getenv("LOG_FILE_PATH", "runtime.log")

        # Prevent duplicate handlers when module reloads.
        if self.logger.handlers:
            self.logger.handlers.clear()
        
        # Check if the app is running locally or in production
        if environment == 'production':
            # In production, send logs to Azure App Insights
            app_insights_conn_str = os.getenv('APPLICATIONINSIGHTS_CONNECTION_STRING')
            if self.add_app_insights_handler(app_insights_conn_str) is False:
                # Fall back to console logging when App Insights config is unavailable/invalid.
                self.add_console_handler()
        else:
            # Locally, print logs to both stdout and stderr
            self.add_console_handler()

        if log_to_file:
            self.add_file_handler(log_file_path)

    def add_app_insights_handler(self, connection_string):
        if not self._has_valid_app_insights_connection_string(connection_string):
            return False

        # Azure App Insights handler
        try:
            azure_handler = AzureLogHandler(connection_string=connection_string)
            azure_handler.setLevel(logging.DEBUG)  # Set log level for production
            self.logger.addHandler(azure_handler)
            return True
        except (ValueError, TypeError):
            return False

    def _has_valid_app_insights_connection_string(self, connection_string):
        if not connection_string or not connection_string.strip():
            return False

        parts = {}
        for item in connection_string.split(";"):
            if "=" not in item:
                continue
            key, value = item.split("=", 1)
            parts[key.strip().lower()] = value.strip()

        return bool(parts.get("instrumentationkey"))

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
    def debug(self, *args):
        self.logger.debug(self._format_message(*args))

    def info(self, *args):
        self.logger.info(self._format_message(*args))

    def warning(self, *args):
        self.logger.warning(self._format_message(*args))

    def error(self, *args):
        self.logger.error(self._format_message(*args))

    def critical(self, *args):
        self.logger.critical(self._format_message(*args))

    def exception(self, *args):
        self.logger.exception(self._format_message(*args))


# Read the version from the version file or use "Unknown" if not found
version_file = Path("version.txt")
if version_file.exists():
    app_version = version_file.read_text().strip()
else:
    app_version = "Unknown"
    
# Create the logger instance with the version from the file
logger_instance = ConferenceLogger(version=app_version)
