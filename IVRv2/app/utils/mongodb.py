import asyncio
import threading
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse

from dotenv import load_dotenv
from pymongo import MongoClient

from app.interfaces.database import IDatabase
from app.settings import settings

load_dotenv()


# Shared MongoClient singleton with connection pooling
_mongo_client: Optional[MongoClient] = None
_database_name: Optional[str] = None
_client_lock = threading.Lock()


def get_mongo_client() -> MongoClient:
    """Get or create a shared MongoClient singleton with connection pooling.

    Thread-safe using double-checked locking pattern.
    """

    global _mongo_client, _database_name

    if _mongo_client is not None:
        return _mongo_client

    with _client_lock:
        if _mongo_client is None:
            connection_string = settings.mongo_db_connection_string
            if not connection_string or connection_string == "NONE":
                raise ValueError(
                    "MONGO_DB_CONNECTION_STRING environment variable not set"
                )

            _mongo_client = MongoClient(
                connection_string,
                maxPoolSize=50,
                serverSelectionTimeoutMS=5000,
            )

            try:
                parsed_url = urlparse(connection_string)
                path = parsed_url.path.lstrip("/").split("?")[0]
                if not path:
                    raise ValueError("Database name not found in connection string")
                _database_name = path
            except Exception as e:
                raise ValueError(
                    f"Error parsing database name from connection string: {e}"
                )

    return _mongo_client


def get_database_name() -> str:
    """Get the database name (ensures client is initialized first)."""

    get_mongo_client()
    if _database_name is None:
        raise ValueError("Database name not initialized")
    return _database_name


class MongoDB(IDatabase):
    def __init__(self, collection_name):
        client = get_mongo_client()
        database_name = get_database_name()
        self.db = client[database_name]
        self.collection = self.db[collection_name]

    async def find_by_id(self, id_string: str) -> Optional[Dict[str, Any]]:
        return await asyncio.to_thread(self.collection.find_one, {"_id": id_string})

    async def find_one_by_query(self, query: dict) -> Optional[Dict[str, Any]]:
        return await asyncio.to_thread(self.collection.find_one, query)

    async def find_all(self) -> List[Dict[str, Any]]:
        return await asyncio.to_thread(lambda: list(self.collection.find()))

    async def query_items(self, query: dict) -> List[Dict[str, Any]]:
        return await asyncio.to_thread(lambda: list(self.collection.find(query)))

    async def insert(self, doc: dict) -> Any:
        result = await asyncio.to_thread(self.collection.insert_one, doc)
        if not result.acknowledged:
            raise RuntimeError(
                f"MongoDB insert not acknowledged for doc: {doc.get('_id')}"
            )
        return result.inserted_id

    async def update_document(self, id: str, new_doc: dict) -> Any:
        result = await asyncio.to_thread(
            self.collection.replace_one, {"_id": id}, new_doc, True
        )
        if not result.acknowledged:
            raise RuntimeError(f"MongoDB update not acknowledged for id: {id}")
        return result

    async def delete(self, id: str) -> Any:
        result = await asyncio.to_thread(self.collection.delete_one, {"_id": id})
        if not result.acknowledged:
            raise RuntimeError(f"MongoDB delete not acknowledged for id: {id}")
        return result

    async def find_top_one(self, attr: str) -> Optional[Dict[str, Any]]:
        return await asyncio.to_thread(
            lambda: self.collection.find_one(sort=[(attr, -1)])
        )

    def get_collection(self):
        return self.collection
