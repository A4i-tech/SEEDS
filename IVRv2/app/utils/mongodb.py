import os
from pymongo import MongoClient
from dotenv import load_dotenv
from app.settings import settings
from urllib.parse import urlparse

load_dotenv()


class MongoDB:
    def __init__(self, collection_name):
        connection_string = settings.mongo_db_connection_string
        if not connection_string or connection_string == "NONE":
            raise ValueError("MONGO_DB_CONNECTION_STRING environment variable not set")

        client = MongoClient(connection_string)

        # Try to extract database name from connection string
        db_name = None
        try:
            parsed = urlparse(connection_string)
            # Extract database name from path (e.g., /test or /ivr)
            path = parsed.path.lstrip("/").split("?")[0]
            if path:
                db_name = path
        except Exception:
            pass

        # Fallback to environment variable or default
        if not db_name:
            db_name = os.environ.get("MONGO_DB_NAME", "SEEDS-Teacher-Backend")

        self.db = client[db_name]
        self.collection = self.db[collection_name]

    async def find_by_id(self, id_string: str):
        return self.collection.find_one({"_id": id_string})

    async def find_one_by_query(self, query: dict):
        return self.collection.find_one(query)

    async def find_all(self):
        return list(self.collection.find())

    async def query_items(self, query: dict):
        return list(self.collection.find(query))

    async def insert(self, doc: dict):
        return self.collection.insert_one(doc).inserted_id

    async def update_document(self, id: str, new_doc: dict):
        return self.collection.replace_one({"_id": id}, new_doc, upsert=True)

    async def delete(self, id: str):
        return self.collection.delete_one({"_id": id})

    async def find_top_one(self, attr: str):
        return self.collection.find_one(sort=[(attr, -1)])

    def get_collection(self):
        return self.collection
