"""
Mock database implementation for testing.
Implements IDatabase interface without requiring real MongoDB connection.
"""

from typing import Any, Dict, List, Optional
from app.interfaces.database import IDatabase


class MockDatabase(IDatabase):
    """
    In-memory mock database for testing.
    Implements all IDatabase methods without external dependencies.
    """

    def __init__(self, initial_data: Optional[List[Dict[str, Any]]] = None):
        """
        Initialize mock database with optional initial data.

        Args:
            initial_data: List of documents to pre-populate the database
        """
        self.data: List[Dict[str, Any]] = initial_data.copy() if initial_data else []
        self._id_counter = 1000

    async def find_by_id(self, id_string: str) -> Optional[Dict[str, Any]]:
        """Find document by _id or id field"""
        for item in self.data:
            if str(item.get("_id")) == id_string or str(item.get("id")) == id_string:
                return item.copy()
        return None

    async def find_one_by_query(self, query: dict) -> Optional[Dict[str, Any]]:
        """Find first document matching all query criteria"""
        for item in self.data:
            if all(item.get(k) == v for k, v in query.items()):
                return item.copy()
        return None

    async def find_all(self) -> List[Dict[str, Any]]:
        """Return all documents"""
        return [item.copy() for item in self.data]

    async def query_items(self, query: dict) -> List[Dict[str, Any]]:
        """Find all documents matching query criteria"""
        results = []
        for item in self.data:
            if all(item.get(k) == v for k, v in query.items()):
                results.append(item.copy())
        return results

    async def insert(self, doc: dict) -> Any:
        """Insert new document and return its ID"""
        new_doc = doc.copy()

        # Generate ID if not provided
        if "_id" not in new_doc and "id" not in new_doc:
            new_doc["_id"] = str(self._id_counter)
            self._id_counter += 1

        self.data.append(new_doc)
        return new_doc.get("_id") or new_doc.get("id")

    async def update_document(self, id: str, new_doc: dict) -> Any:
        """Replace document with matching ID"""
        for i, item in enumerate(self.data):
            if str(item.get("_id")) == id or str(item.get("id")) == id:
                # Preserve the ID in the new document
                updated_doc = new_doc.copy()
                if "_id" not in updated_doc:
                    updated_doc["_id"] = item.get("_id")
                if "id" not in updated_doc and "id" in item:
                    updated_doc["id"] = item.get("id")

                self.data[i] = updated_doc
                return {"modified_count": 1, "matched_count": 1}

        # If not found, upsert (insert new)
        new_doc_copy = new_doc.copy()
        new_doc_copy["_id"] = id
        self.data.append(new_doc_copy)
        return {"modified_count": 0, "matched_count": 0, "upserted_id": id}

    async def delete(self, id: str) -> Any:
        """Delete document with matching ID"""
        for i, item in enumerate(self.data):
            if str(item.get("_id")) == id or str(item.get("id")) == id:
                del self.data[i]
                return {"deleted_count": 1}
        return {"deleted_count": 0}

    async def find_top_one(self, attr: str) -> Optional[Dict[str, Any]]:
        """Find document with highest value for given attribute"""
        if not self.data:
            return None

        # Filter out items without the attribute
        items_with_attr = [item for item in self.data if attr in item]

        if not items_with_attr:
            return None

        # Find max by attribute
        top_item = max(items_with_attr, key=lambda x: x.get(attr, 0))
        return top_item.copy()

    async def update_one(self, filter_query: dict, update_query: dict) -> Any:
        """Update a single document with atomic operators.

        Args:
            filter_query: The filter to match documents (e.g., {"_id": "value"})
            update_query: The update operations (e.g., {"$set": {"field": "value"}})

        Returns:
            A result object with modified_count, matched_count, etc.
        """
        for i, item in enumerate(self.data):
            # Check if item matches filter query
            if all(item.get(k) == v for k, v in filter_query.items()):
                # Apply atomic operations
                updated_item = item.copy()

                # Handle $set operator
                if "$set" in update_query:
                    updated_item.update(update_query["$set"])

                # Handle other operators as needed
                # $inc, $push, etc. can be added here

                self.data[i] = updated_item
                return {"matched_count": 1, "modified_count": 1, "acknowledged": True}

        # No match found
        return {"matched_count": 0, "modified_count": 0, "acknowledged": True}

    def clear(self):
        """Clear all data (useful for test cleanup)"""
        self.data = []
        self._id_counter = 1000

    def add_data(self, documents: List[Dict[str, Any]]):
        """Add multiple documents at once"""
        self.data.extend([doc.copy() for doc in documents])

    def get_all_data(self) -> List[Dict[str, Any]]:
        """Get all data (for test assertions)"""
        return [item.copy() for item in self.data]

    def count(self) -> int:
        """Get count of documents"""
        return len(self.data)
