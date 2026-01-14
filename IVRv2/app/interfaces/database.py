from abc import ABC, abstractmethod
from typing import Any, Dict, List, Optional


class IDatabase(ABC):
    """Abstract interface for database operations."""

    @abstractmethod
    async def find_by_id(self, id_string: str) -> Optional[Dict[str, Any]]:
        """Find a document by its ID."""
        pass

    @abstractmethod
    async def find_one_by_query(
        self, query: Dict[str, Any]
    ) -> Optional[Dict[str, Any]]:
        """Find a single document matching the query."""
        pass

    @abstractmethod
    async def find_all(self) -> List[Dict[str, Any]]:
        """Find all documents in the collection."""
        pass

    @abstractmethod
    async def query_items(self, query: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Query documents matching the query."""
        pass

    @abstractmethod
    async def insert(self, doc: Dict[str, Any]) -> Any:
        """Insert a new document and return its ID."""
        pass

    @abstractmethod
    async def update_document(self, id: str, new_doc: Dict[str, Any]) -> Any:
        """Update an existing document."""
        pass

    @abstractmethod
    async def update_one(
        self, filter_query: Dict[str, Any], update_query: Dict[str, Any]
    ) -> Any:
        """Update a single document matching the filter with atomic operators (e.g., $set).

        Args:
            filter_query: The filter to match documents (e.g., {"_id": "value"})
            update_query: The update operations (e.g., {"$set": {"field": "value"}})

        Returns:
            The update result object
        """
        pass

    @abstractmethod
    async def delete(self, id: str) -> Any:
        """Delete a document by its ID."""
        pass

    @abstractmethod
    async def find_top_one(self, attr: str) -> Optional[Dict[str, Any]]:
        """Find the top document based on a specific attribute."""
        pass
