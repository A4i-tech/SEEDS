# config.py

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    VONAGE_API_KEY: str
    VONAGE_API_SECRET: str
    COSMOS_ENDPOINT: str = ""
    COSMOS_KEY: str = ""
    COSMOS_DATABASE: str = ""
    COSMOS_CONTAINER: str = ""

    # Storage backend: "memory" | "cosmos" | "mongodb". Default "memory".
    STORAGE_BACKEND: str = "memory"

    # MongoDB (used when STORAGE_BACKEND=mongodb). DB name is parsed from connection string path.
    MONGO_DB_CONNECTION_STRING: str = ""
    MONGO_COLLECTION_NAME: str = "conferenceState"
    MONGO_MAX_POOL_SIZE: int = 50

def get_settings():
    return Settings()
