from azure.identity import DefaultAzureCredential
from azure.storage.blob import BlobServiceClient, generate_blob_sas, BlobSasPermissions
from urllib.parse import urlparse, unquote
import datetime
import os
import logging

logger = logging.getLogger(__name__)

class SASGen:
    def __init__(self):
        self.account_name = os.getenv('AZURE_STORAGE_ACCOUNT_NAME')
        self.account_key = os.getenv('AZURE_STORAGE_ACCOUNT_KEY')
        self.sas_expiry_hours = int(os.getenv('SAS_EXPIRY_HOURS', '1'))
        if self.account_name and self.account_key:
            self.use_account_key = True
            logger.info("Using Account Key for Azure Blob Storage authentication.")
        else:
            self.use_account_key = False
            self.credential = DefaultAzureCredential()
            logger.info("Using DefaultAzureCredential for Azure Blob Storage authentication.")
        self.blob_service_client = None
        self.user_delegation_key = None
        self.key_expiry_time = None
        self.azure_enabled = os.getenv('AZURE_STORAGE_ENABLED', 'true').lower() == 'true'

    def get_blob_service_client(self, url):
        if not self.blob_service_client:
            parsed_url = urlparse(url)
            if self.use_account_key:
                self.blob_service_client = BlobServiceClient(
                    account_url=f"{parsed_url.scheme}://{parsed_url.netloc}",
                    credential=self.account_key)
            else:
                self.blob_service_client = BlobServiceClient(
                    account_url=f"{parsed_url.scheme}://{parsed_url.netloc}",
                    credential=self.credential)
        return self.blob_service_client

    def get_user_delegation_key(self, blob_service_client):
        if self.use_account_key:
            return None  # No user delegation key needed when using account key
        current_time = datetime.datetime.utcnow()
        if not self.user_delegation_key or (self.key_expiry_time and current_time >= self.key_expiry_time):
            self.key_expiry_time = current_time + self.sas_expiry_hours
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
            
            expiry_time = datetime.datetime.utcnow() + datetime.timedelta(hours=self.sas_expiry_hours)

            if self.use_account_key:
                # Generate SAS token using the account key
                sas_token = generate_blob_sas(
                    account_name=blob_service_client.account_name,
                    container_name=container_name,
                    blob_name=blob_path,
                    account_key=self.account_key,
                    permission=BlobSasPermissions(read=True),
                    expiry=expiry_time,
                )
            else:
                user_delegation_key = self.get_user_delegation_key(blob_service_client)
                # Generate SAS token using the user delegation key
                sas_token = generate_blob_sas(
                    account_name=blob_service_client.account_name,
                    container_name=container_name,
                    blob_name=blob_path,
                    permission=BlobSasPermissions(read=True),
                    expiry=self.key_expiry_time or datetime.datetime.utcnow() + self.sas_expiry_hours,
                    user_delegation_key=user_delegation_key,
                )
            return blob_client.url + "?" + sas_token
        except Exception as e:
            logger.error(f"Failed to generate SAS URL for {url}: {e}")
            logger.warning("Falling back to original URL without SAS token.")
            return url

sas_gen = SASGen()
