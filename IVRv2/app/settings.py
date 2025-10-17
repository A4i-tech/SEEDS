from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    azure_cosmos_endpoint: str = ""
    azure_cosmos_key: str = ""
    azure_storage_connection_string: str = ""
    mongodb_uri: str = ""
    mongo_db_connection_string: str = ""
    vonage_api_key: str = ""
    vonage_api_secret: str = ""
    vonage_application_id: str = ""
    vonage_private_key: str = ""
    base_url: str = ""
    to_phone_number: str = ""
    storage_account_name: str = ""
    blob_store_conn_str: str = ""
    
    class Config:
        env_file = ".env"

settings = Settings()