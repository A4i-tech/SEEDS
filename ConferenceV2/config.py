# config.py

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    VONAGE_API_KEY: str = ""
    VONAGE_API_SECRET: str = ""
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

    # AUTO-END CONFIGURATION
    AUTO_END_TIMEOUT_MINUTES: int = 15
    AUTO_END_ENABLED: bool = True

    # AUTO-END CONFIGURATION
    AUTO_END_TIMEOUT_MINUTES: int = 15
    AUTO_END_ENABLED: bool = True
    # Existing deployment/runtime env keys used by the service ecosystem.
    APPLICATIONINSIGHTS_CONNECTION_STRING: str = ""
    ENVIRONMENT: str = "development"
    EVENTS_WEBHOOK_EP: str = ""
    INTERNAL_WS_EP: str = ""
    STORAGE_ACCOUNT_NAME: str = ""
    VONAGE_APPLICATION_ID: str = ""
    VONAGE_NUMBER: str = ""
    VONAGE_APPLICATION_PRIVATE_KEY64: str = ""
    WS_SERVER_EP: str = ""
    SERVICE_BUS_CONNECTION_STRING: str = ""
    ACCOUNTKEY: str = ""
    AZURE_STORAGE_ENABLED: bool = False
    AZURE_STORAGE_ACCOUNT_NAME: str = ""
    AZURE_STORAGE_ACCOUNT_KEY: str = ""
    AZURE_STORAGE_CONNECTION_STRING: str = ""
    BASE_URL: str = ""
    MY_NUMBER: str = ""
    FEATURE_PH: str = ""
    SERVICE_BUS_NS_NAME: str = ""
    SERVICE_BUS_TOPIC_NAME: str = ""
    OPENAI_API_KEY: str = ""
    OPENAI_ORG_ID: str = ""
    AUDIO_ANALYSIS_ENABLED: bool = True
    AUDIO_CAPTURE_ENABLED: bool = False
    AUDIO_CAPTURE_UPLOAD_TO_AZURE: bool = False
    AUDIO_CAPTURE_CONTAINER: str = "seedsstagingblob"
    AUDIO_CAPTURE_BLOB_PREFIX: str = "audio-recording"
    AUDIO_CAPTURE_FORMAT: str = "wav"
    AUDIO_CAPTURE_DELETE_LOCAL_AFTER_UPLOAD: bool = False
    LOG_TO_FILE: bool = False
    LOG_FILE_PATH: str = "runtime.log"
    AUDIO_SILENCE_THRESHOLD: int = 300
    AUDIO_WEBRTC_VAD_AGGRESSIVENESS: int = 2
    AUDIO_VAD_FRAME_MS: int = 20
    AUDIO_VAD_START_SPEECH_FRAMES: int = 2
    AUDIO_VAD_PRE_SPEECH_MS: int = 120
    AUDIO_VAD_MIN_SPEECH_MS: int = 200
    AUDIO_VAD_SILENCE_FLUSH_MS: int = 400
    AUDIO_VAD_OVERLAP_MS: int = 120
    AUDIO_VAD_MAX_SEGMENT_SEC: float = 12
    AUDIO_VAD_METRICS_LOG_EVERY_SEGMENTS: int = 20
    AUDIO_HOLD_SIMILARITY_THRESHOLD: float = 0.82
    AUDIO_HOLD_MIN_TEXT_CHARS: int = 6
    AUDIO_TRANSCRIPT_LOGGING_ENABLED: bool = False
    AUDIO_RELAY_MAX_QUEUE: int = 500
    AUDIO_API_TIMEOUT_SECONDS: float = 8.0
    AUDIO_BLOB_UPLOAD_TIMEOUT_SECONDS: float = 30.0
    AUDIO_BLOB_UPLOAD_MAX_RETRIES: int = 3
    AUDIO_ANALYSIS_DB_LOGGING_ENABLED: bool = False
    AUDIO_CAPTURE_DIR: str = "/tmp/conference-audio-capture"
    AUDIO_CAPTURE_MAX_BYTES: int = 104857600
    AUDIO_CAPTURE_FLUSH_EVERY_BYTES: int = 32768
    AUDIO_CAPTURE_SAMPLE_RATE_HZ: int = 8000
    AUDIO_CAPTURE_CHANNELS: int = 1
    AUDIO_CAPTURE_SAMPLE_WIDTH_BYTES: int = 2

    class Config:
        env_file = ".env"

def get_settings():
    return Settings()
