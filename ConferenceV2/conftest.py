import os

# Set required env vars before any test module is imported (conf_logger calls get_settings() at import time).
os.environ.setdefault("MONGO_DB_CONNECTION_STRING", "mongodb://localhost:27017/test")
os.environ.setdefault("STORAGE_ACCOUNT_NAME", "test")
os.environ.setdefault("ENVIRONMENT", "development")
os.environ.setdefault(
    "APPLICATIONINSIGHTS_CONNECTION_STRING",
    "InstrumentationKey=test-key;IngestionEndpoint=https://test.com/",
)
