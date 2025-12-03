from functools import lru_cache
from typing import Optional

from app.interfaces.database import IDatabase
from app.utils.mongodb import MongoDB
from app.repositories.comprehension_repository import ComprehensionRepository
from app.settings import settings


@lru_cache()
def get_database_service(
    datasource: str,
    collection_name: str,
) -> IDatabase:
    """
    Factory function to get a database service instance.
    """
    match datasource:
        case "mongodb":
            return MongoDB(collection_name)
        case _:
            raise ValueError(f"Unsupported datasource: {datasource}")

def get_comprehension_db() -> IDatabase:
    """Get MongoDB comprehension collection instance."""
    return get_database_service(
        datasource="mongodb",
        collection_name="comprehension",
    )

def get_comprehension_repository(db: IDatabase = None) -> ComprehensionRepository:
    """Get comprehension repository instance."""
    if db is None:
        db = get_comprehension_db()
    return ComprehensionRepository(db)
