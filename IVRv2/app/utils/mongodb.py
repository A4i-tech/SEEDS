from pymongo import MongoClient, ReturnDocument
from dotenv import load_dotenv
from app.settings import settings
from urllib.parse import urlparse
from typing import List, Optional, Dict, Any, Tuple
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

    async def find_one_and_update(
        self,
        query: dict,
        update: dict,
        upsert: bool = False,
        return_document: str = "after"
    ) -> Optional[Dict[str, Any]]:
        """
        Atomic find and update operation.

        Args:
            query: Filter criteria
            update: Update operations (use $set, $inc, etc.)
            upsert: Create if not exists
            return_document: "before" or "after"

        Returns:
            The document (before or after update), or None
        """
        return_doc = ReturnDocument.AFTER if return_document == "after" else ReturnDocument.BEFORE
        return self.collection.find_one_and_update(
            query,
            update,
            upsert=upsert,
            return_document=return_doc
        )

    async def delete_with_verification(self, id: str) -> Tuple[bool, Optional[Dict[str, Any]]]:
        """
        Delete document and return what was deleted.

        Args:
            id: Document ID to delete

        Returns:
            (True, deleted_doc) if deleted
            (False, None) if not found
        """
        deleted_doc = self.collection.find_one_and_delete({"_id": id})
        return (deleted_doc is not None, deleted_doc)
