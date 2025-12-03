from typing import Optional, Dict, Any, List

from app.repositories.comprehension_repository import ComprehensionRepository
from app.dependencies import get_comprehension_repository
from app.utils.audio import hydrate_comprehension_document

async def load_comprehension_structure(repository: Optional[ComprehensionRepository] = None) -> List[Dict[str, Any]]:
    """
    Load and hydrate comprehension structure from the database.
    
    Args:
        repository: Optional repository instance to use for data access.

    Returns:
        dict: Hydrated comprehension structure with full audio URLs.

    Raises:
        ValueError: If the comprehension document is not found.
    """

    repo = repository or get_comprehension_repository()
    db_doc = await repo.get_all_comprehensions()

    return hydrate_comprehension_document(db_doc)
    
comprehension_structure: Optional[List[Dict[str, Any]]] = None

async def initialize_comprehension_structure(repository: Optional[ComprehensionRepository] = None):
    """
    Initialize the global comprehension structure variable.

    Args:
        repository: Optional repository instance to use for data access.
    """
    global comprehension_structure
    comprehension_structure = await load_comprehension_structure(repository)