from pymongo import MongoClient
from dotenv import load_dotenv
from app.settings import settings
from urllib.parse import urlparse
from typing import List, Optional, Dict, Any
from app.interfaces.database import IDatabase

load_dotenv()


class MongoDB(IDatabase):
    def __init__(self, collection_name):
        connection_string = settings.mongo_db_connection_string
        if not connection_string or connection_string == "NONE":
            raise ValueError("MONGO_DB_CONNECTION_STRING environment variable not set")

        client = MongoClient(connection_string)

        # Extract database name from connection string
        try:
            parsed_url = urlparse(connection_string)
            path = parsed_url.path.lstrip('/').split('?')[0]
            if not path:
                raise ValueError("Database name not found in connection string")
            database_name = path
        except Exception as e:
            raise ValueError(f"Error parsing database name from connection string: {e}")
        self.db = client[database_name]
        self.collection = self.db[collection_name]

    async def find_by_id(self, id_string: str) -> Optional[Dict[str, Any]]:
        return self.collection.find_one({"_id": id_string})

    async def find_one_by_query(self, query: dict) -> Optional[Dict[str, Any]]:
        return self.collection.find_one(query)

    async def find_all(self) -> List[Dict[str, Any]]:
        return list(self.collection.find())

    async def query_items(self, query: dict) -> List[Dict[str, Any]]:
        return list(self.collection.find(query))

    async def insert(self, doc: dict) -> Any:
        return self.collection.insert_one(doc).inserted_id

    async def update_document(self, id: str, new_doc: dict) -> Any:
        return self.collection.replace_one({"_id": id}, new_doc, upsert=True)

    async def delete(self, id: str) -> Any:
        return self.collection.delete_one({"_id": id})

    async def find_top_one(self, attr: str) -> Optional[Dict[str, Any]]:
        return self.collection.find_one(sort=[(attr, -1)])

    def get_collection(self):
        return self.collection
