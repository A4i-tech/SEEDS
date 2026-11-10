from __future__ import annotations

from typing import ClassVar

from fastapi import Depends
from pymongo.asynchronous.database import AsyncDatabase

from app.aggregators.models import SourceType
from app.platform.auth.dependencies import get_db
from app.providers.blob_storage import BlobStorageProvider
from app.services.content_aggregator_sync_jobs import SyncJobService, get_sync_job_service
from app.services.stored_content_service import StoredContentService


class IrisService(StoredContentService):
    SOFT_DELETE_ABSENT: ClassVar[bool] = True

    def __init__(
        self, db: AsyncDatabase, blob: BlobStorageProvider, sync_jobs: SyncJobService
    ) -> None:
        super().__init__(db, blob, sync_jobs, SourceType.IRIS)


def get_iris_service(db: AsyncDatabase = Depends(get_db)) -> IrisService:
    return IrisService(db, BlobStorageProvider(), get_sync_job_service(db))
