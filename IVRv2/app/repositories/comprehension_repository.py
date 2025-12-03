from typing import Dict, List, Optional, Any
from app.interfaces.database import IDatabase

class ComprehensionRepository:
    """
    Repository for managing comprehension documents in the database.
    """

    def __init__(self, db: IDatabase):
        self.db = db

    async def get_all_comprehensions(self) -> List[Dict[str, Any]]:
        """Retrieve all comprehension documents from the database."""
        return await self.db.find_all()
    
    async def get_comprehension_by_id(self, comprehension_id: str) -> Optional[Dict[str, Any]]:
        """Retrieve a single comprehension document by its ID."""
        return await self.db.find_by_id(comprehension_id)
    
    async def create_comprehension(self, doc: Dict[str, Any]) -> Any:
        """Insert a new comprehension document into the database."""
        return await self.db.insert(doc)
    
    async def update_comprehension(self, comprehension_id: str, new_doc: Dict[str, Any]) -> Any:
        """Update an existing comprehension document."""
        return await self.db.update_document(comprehension_id, new_doc)
    
    async def delete_comprehension(self, comprehension_id: str) -> Any:
        """Delete a comprehension document by its ID."""
        return await self.db.delete(comprehension_id)
        