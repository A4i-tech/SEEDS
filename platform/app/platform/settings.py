"""
Platform settings - merges env vars from backend-server, ConferenceV2, and IVRv2.

SECURITY: Sensitive fields are marked with repr=False to prevent accidental logging.
"""

from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # ---------------------------------------------------------------------------
    # Platform meta
    # ---------------------------------------------------------------------------
    app_mode: Literal["api", "consumer", "all"] = "all"
    env: Literal["development", "staging", "production"] = "development"
    version: str = "0.1.0"
    port: int = 8000

    # Explicit opt-in for the localization demo's admin/reviewer RBAC bypass.
    # Deliberately NOT derived from `env` alone: `env` defaults to
    # "development", so a deployment that forgets to set ENV explicitly would
    # otherwise silently open the bypass. Must be turned on by name.
    enable_local_demo_rbac_bypass: bool = False

    # Explicit opt-in: treat "localhost" and "127.0.0.1" as the same origin
    # hostname in _ensure_origin_matches, so a website registered under one
    # can be accessed from the other during local development. Same "must be
    # turned on by name" rule as the two flags above — never set in staging
    # or production, and scoped to exactly these two literal hostnames (not
    # a wildcard or subdomain match).
    enable_dev_localhost_origin_alias: bool = False

    # Comma-separated allowlist of first-party siteIds (e.g. ContentWebApp's own
    # UI site) whose AI translations are served at RUNTIME without human approval.
    # This is a serve-time-only exemption: DB status stays "pending" and the
    # reviewer/bulk-approve workflow is untouched. Partner sites are never in this
    # list, so their approval gate is unchanged. Safe empty default: with no
    # value set, NO site is first-party and every site keeps the approval gate.
    # Explicit opt-in by exact siteId only — never derived from domain/localhost/
    # route/role. Set via FIRST_PARTY_SITE_IDS.
    first_party_site_ids: str = ""

    # ---------------------------------------------------------------------------
    # MongoDB (backend-server uses DB_CONNECTION; IVR/Conference use MONGO_DB_*)
    # ---------------------------------------------------------------------------
    db_connection: str = Field(default="", repr=False)  # backend-server legacy name
    mongo_db_connection_string: str = Field(default="", repr=False)
    mongo_max_pool_size: int = 50

    # ---------------------------------------------------------------------------
    # Auth / Security  (backend-server)
    # ---------------------------------------------------------------------------
    secret_key: str = Field(default="", repr=False)
    auth_type: Literal["jwt", "firebase"] = "jwt"
    jwt_expires_in: str = "1d"
    password_salt_rounds: int = 10

    refresh_token_expires_in: str = "30d"

    content_aggregator_access_token_expires_in: str = "15m"
    content_aggregator_refresh_token_expires_in: str = "30d"

    # Firebase (only used when auth_type == "firebase")
    firebase_api_key: str = Field(default="", repr=False)
    firebase_service_account: str = Field(default="", repr=False)

    # ---------------------------------------------------------------------------
    # Vonage
    # ---------------------------------------------------------------------------
    vonage_api_key: str = Field(default="", repr=False)
    vonage_api_secret: str = Field(default="", repr=False)
    vonage_conference_application_id: str = ""
    vonage_ivr_application_id: str = ""
    vonage_conference_application_private_key64: str = Field(default="", repr=False)
    vonage_ivr_application_private_key64: str = Field(default="", repr=False)
    vonage_number: str = ""
    vonage_call_timeout_seconds: float = 30.0

    # ---------------------------------------------------------------------------
    # Azure Speech / TTS (ttsService.js)
    # ---------------------------------------------------------------------------
    azure_speech_key: str = Field(default="", repr=False)
    azure_speech_region: str = ""
    azure_speech_resource_id: str = ""
    # Legacy env names from JS (TTS_SUBSCRIPTION_KEY, TTS_REGION)
    tts_subscription_key: str = Field(default="", repr=False)
    tts_region: str = ""

    # ---------------------------------------------------------------------------
    # Azure Blob Storage
    # ---------------------------------------------------------------------------
    azure_blob_sas_enabled: bool = True
    azure_storage_account_name: str = ""
    azure_storage_account_key: str = Field(default="", repr=False)
    azure_storage_connection_string: str = Field(default="", repr=False)
    azure_storage_container: str = "seedsstagingblob"
    accountkey: str = Field(default="", repr=False)

    # Audio blob capture
    audio_capture_enabled: bool = False
    audio_capture_upload_to_azure: bool = False
    audio_capture_container: str = "seedsstagingblob"
    audio_capture_blob_prefix: str = "audio-recording"
    audio_capture_format: str = "wav"
    audio_capture_delete_local_after_upload: bool = False
    audio_capture_dir: str = "/tmp/conference-audio-capture"  # nosec B108 - configurable default, overridden via env
    audio_capture_max_bytes: int = 104_857_600  # 100 MB
    audio_capture_flush_every_bytes: int = 32_768
    audio_capture_sample_rate_hz: int = 8000
    audio_capture_channels: int = 1
    audio_capture_sample_width_bytes: int = 2

    # ---------------------------------------------------------------------------
    # Azure Service Bus
    # ---------------------------------------------------------------------------
    azure_service_bus_connection_string: str = Field(default="", repr=False)
    azure_service_bus_queue_name: str = ""
    azure_service_bus_max_retries: int = 3

    # ---------------------------------------------------------------------------
    # Application Insights / OpenTelemetry
    # ---------------------------------------------------------------------------
    applicationinsights_connection_string: str = Field(default="", repr=False)

    # ---------------------------------------------------------------------------
    # Redis
    # ---------------------------------------------------------------------------
    redis_url: str = Field(default="", repr=False)
    redis_conference_ttl_seconds: int = 7200

    # ---------------------------------------------------------------------------
    # OpenAI
    # ---------------------------------------------------------------------------
    openai_api_key: str = Field(default="", repr=False)
    openai_org_id: str = ""

    # ---------------------------------------------------------------------------
    # Groq (OpenAI-compatible Chat Completions — used as an alt translation vendor)
    # ---------------------------------------------------------------------------
    groq_api_key: str = Field(default="", repr=False)
    groq_model: str = "llama-3.3-70b-versatile"

    # ---------------------------------------------------------------------------
    # Azure AI Translator (dedicated MT — preferred for high-volume UI localization)
    # ---------------------------------------------------------------------------
    translator_key: str = Field(default="", repr=False)
    translator_region: str = ""
    translator_endpoint: str = "https://api.cognitive.microsofttranslator.com"

    # ---------------------------------------------------------------------------
    # Translation (Localize.js replacement — ticket #436)
    # ---------------------------------------------------------------------------
    translation_provider: str = "openai"
    # Origin that serves the SDK asset (/sdk.js) AND fronts the runtime APIs
    # (/translations, /languages) — the generated onboarding snippet points both
    # `src` and `data-api-base` at it. In local dev that is the Source app on
    # :3000 (see ContentWebApp/src/setupProxy.js), NOT the demo target on :4000.
    # Production deployments override via TRANSLATION_SDK_BASE_URL env var.
    translation_sdk_base_url: str = "http://localhost:3000"
    # A translation whose heuristic qualityScore is below this threshold is flagged
    # low-confidence for reviewer attention (ticket #436, AC6). Override via
    # LOW_CONFIDENCE_THRESHOLD; default matches quality_scorer.LOW_CONFIDENCE_THRESHOLD.
    low_confidence_threshold: float = 0.7

    # ---------------------------------------------------------------------------
    # Routing / URLs
    # ---------------------------------------------------------------------------
    base_url: str = ""
    ivr_server_url: str = ""
    conf_server_url: str = ""
    events_webhook_ep: str = ""
    websocket_service_url: str = ""

    # ---------------------------------------------------------------------------
    # IVR specific
    # ---------------------------------------------------------------------------
    my_number: str = ""
    call_duration_limit: int = 0
    ivr_daily_listening_limit_seconds: int = 7200
    default_welcome_language: str = "kn"

    # ---------------------------------------------------------------------------
    # Conference auto-end
    # ---------------------------------------------------------------------------
    auto_end_timeout_minutes: int = 15
    auto_end_enabled: bool = True

    # ---------------------------------------------------------------------------
    # Audio analysis & VAD
    # ---------------------------------------------------------------------------
    audio_analysis_enabled: bool = True
    audio_analysis_db_logging_enabled: bool = False
    audio_silence_threshold: int = 300
    audio_webrtc_vad_aggressiveness: int = 2
    audio_vad_frame_ms: int = 20
    audio_vad_start_speech_frames: int = 2
    audio_vad_pre_speech_ms: int = 120
    audio_vad_min_speech_ms: int = 200
    audio_vad_silence_flush_ms: int = 400
    audio_vad_overlap_ms: int = 120
    audio_vad_max_segment_sec: float = 12.0
    audio_vad_metrics_log_every_segments: int = 20
    audio_hold_similarity_threshold: float = 0.82
    audio_hold_min_text_chars: int = 6
    audio_transcript_logging_enabled: bool = False
    audio_relay_max_queue: int = 500
    audio_api_timeout_seconds: float = 8.0
    audio_blob_upload_timeout_seconds: float = 30.0
    audio_blob_upload_max_retries: int = 3

    # ---------------------------------------------------------------------------
    # Logging
    # ---------------------------------------------------------------------------
    log_level: str = "INFO"
    log_to_file: bool = False
    log_file_path: str = "runtime.log"

    # ---------------------------------------------------------------------------
    # CORS
    # ---------------------------------------------------------------------------
    # Comma-separated list of allowed origins for staging/production.
    # In development "*" is always used regardless of this value.
    cors_allowed_origins: str = ""

    # ---------------------------------------------------------------------------
    # WebSocket control secret (Phase 11 security hardening)
    # ---------------------------------------------------------------------------
    ws_control_secret: str = Field(default="", repr=False)

    # ---------------------------------------------------------------------------
    # Misc / ConferenceV2
    # ---------------------------------------------------------------------------
    feature_ph: str = ""

    # ---------------------------------------------------------------------------
    # Subodha LMS sync (ported from subodha/backend)
    # ---------------------------------------------------------------------------
    subodha_base_url: str = "https://subodha-lms.visionempowertrust.org"
    subodha_username: str = Field(default="", repr=False)
    subodha_password: str = Field(default="", repr=False)
    subodha_page_size: int = 100
    subodha_page_delay_ms: int = 300
    subodha_course_concurrency: int = 5
    subodha_course_delay_ms: int = 0
    subodha_session_refresh_every: int = 200
    subodha_xblock_concurrency: int = 10
    subodha_xblock_delay_ms: int = 30
    subodha_asset_concurrency: int = 10
    subodha_collection_name: str = "subodhaCourses"
    subodha_jobs_collection_name: str = "subodhaSyncJobs"
    subodha_asset_container: str = "subodha"

    # ---------------------------------------------------------------------------
    # Derived queue names (IVRv2 pattern)
    # ---------------------------------------------------------------------------
    @property
    def call_webhook_queue_name(self) -> str:
        return f"call_webhook_{self.azure_service_bus_queue_name}"

    @property
    def dtmf_input_queue_name(self) -> str:
        return f"dtmf_input_{self.azure_service_bus_queue_name}"

    @property
    def call_event_queue_name(self) -> str:
        return f"call_event_{self.azure_service_bus_queue_name}"

    @property
    def effective_mongo_connection_string(self) -> str:
        """Return the first non-empty MongoDB connection string available."""
        return self.mongo_db_connection_string or self.db_connection


@lru_cache
def get_settings() -> Settings:
    """Return a cached Settings instance. Cached to avoid re-reading .env repeatedly."""
    return Settings()
