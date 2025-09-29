from azure.identity import DefaultAzureCredential
from azure.storage.blob import BlobServiceClient, generate_blob_sas, BlobSasPermissions
from urllib.parse import urlparse, unquote
import datetime
import os
import logging

logger = logging.getLogger(__name__)

class SASGen:
    def __init__(self):
        self.credential = DefaultAzureCredential()
        self.blob_service_client = None
        self.user_delegation_key = None
        self.key_expiry_time = None
        self.azure_enabled = os.getenv('AZURE_STORAGE_ENABLED', 'true').lower() == 'true'

    def get_blob_service_client(self, url):
        if not self.blob_service_client:
            parsed_url = urlparse(url)
            self.blob_service_client = BlobServiceClient(
                account_url=f"{parsed_url.scheme}://{parsed_url.netloc}",
                credential=self.credential)
        return self.blob_service_client

    def get_user_delegation_key(self, blob_service_client):
        current_time = datetime.datetime.utcnow()
        if not self.user_delegation_key or (self.key_expiry_time and current_time >= self.key_expiry_time):
            self.key_expiry_time = current_time + datetime.timedelta(hours=1)
            self.user_delegation_key = blob_service_client.get_user_delegation_key(current_time, self.key_expiry_time)
        return self.user_delegation_key

    def get_url_with_sas(self, url: str) -> str:
        # If Azure is disabled or authentication fails, return the original URL
        if not self.azure_enabled:
            logger.warning("Azure Storage is disabled. Returning original URL.")
            return url
            
        try:
            decoded_url = unquote(url)
            parsed_url = urlparse(decoded_url)
            container_name = parsed_url.path.split('/')[1]
            blob_path = '/'.join(parsed_url.path.split('/')[2:])
            
            blob_service_client = self.get_blob_service_client(url)
            blob_client = blob_service_client.get_blob_client(container_name, blob_path)
            
            user_delegation_key = self.get_user_delegation_key(blob_service_client)
            
            # Generate SAS token using the user delegation key
            sas_token = generate_blob_sas(
                account_name=blob_service_client.account_name or "",
                container_name=container_name,
                blob_name=blob_path,
                permission=BlobSasPermissions(read=True),
                expiry=self.key_expiry_time or datetime.datetime.utcnow() + datetime.timedelta(hours=1),
                user_delegation_key=user_delegation_key,
            )
            return blob_client.url + "?" + sas_token
        except Exception as e:
            logger.error(f"Failed to generate SAS URL for {url}: {e}")
            logger.warning("Falling back to original URL without SAS token.")
            return url

sas_gen = SASGen()