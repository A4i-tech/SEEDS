from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    azure_cosmos_endpoint: str = ""
    azure_cosmos_key: str = ""
    azure_storage_connection_string: str = ""
    mongo_db_connection_string: str = ""
    vonage_api_key: str = ""
    vonage_api_secret: str = ""
    vonage_application_id: str = ""
    vonage_private_key_path: str = ""
    vonage_number: str = ""
    base_url: str = ""
    to_phone_number: str = ""
    storage_account_name: str = ""
    blob_store_conn_str: str = ""
    azure_storage_enabled: str = ""
    azure_storage_account_key: str = ""
    service_bus_connection_string: str = ""
    service_bus_queue_name: str = ""
    azure_service_bus_connection_string: str = ""
    azure_service_bus_queue_name: str = ""
    call_duration_limit: int = 0
    provider_type: str = ""

    class Config:
        env_file = ".env"

settings = Settings()