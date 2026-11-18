from __future__ import annotations

import pytest
from bson import ObjectId

from app.models.requests.content_requests import ContentUpdateRequest
from app.platform.error_handling import ForbiddenError
from app.services.content_service import ContentService
from tests.support.mongomock_async import AsyncMongoMockClient

TENANT = "69660fae7fccd4ee129e58ae"
SCHOOL = "69660fae7fccd4ee129e58b0"
OWNER = "690dbc1b3b41c70deffa2761"
SAME_ROLE_COLLEAGUE = "690dbc1b3b41c70deffa2762"
PARTNER_OWNER = "690dbc1b3b41c70deffa2763"


@pytest.fixture
def db():
    return AsyncMongoMockClient()["test_seeds"]


@pytest.fixture
def service(db):
    return ContentService(db)


async def _insert(db, created_by: ObjectId, school_id: ObjectId | None) -> str:
    inserted = await db["contentsV3"].insert_one(
        {
            "tenant_id": ObjectId(TENANT),
            "school_id": school_id,
            "created_by": created_by,
            "type": "story",
            "language": "en",
            "title": {"english": "T"},
            "theme": {"english": "T"},
            "description": "original",
            "is_deleted": False,
            "creation_time": 1,
        }
    )
    return str(inserted.inserted_id)


async def test_owner_updates_and_deletes_own_content(service, db):
    content_id = await _insert(db, ObjectId(OWNER), ObjectId(SCHOOL))

    updated = await service.update_content(
        ContentUpdateRequest(id=content_id, description="edited"), TENANT, OWNER, SCHOOL, False
    )
    matched = await service.delete_content(content_id, TENANT, OWNER, SCHOOL)

    assert updated.description == "edited"
    assert matched == 1


async def test_same_role_colleague_cannot_update_or_delete(service, db):
    content_id = await _insert(db, ObjectId(OWNER), ObjectId(SCHOOL))

    with pytest.raises(ForbiddenError):
        await service.update_content(
            ContentUpdateRequest(id=content_id, description="edited"), TENANT, SAME_ROLE_COLLEAGUE, SCHOOL, False
        )
    matched = await service.delete_content(content_id, TENANT, SAME_ROLE_COLLEAGUE, SCHOOL)

    assert matched == 0
    assert (await db["contentsV3"].find_one({"_id": ObjectId(content_id)}))["description"] == "original"


async def test_tenant_cannot_change_school_content(service, db):
    content_id = await _insert(db, ObjectId(OWNER), ObjectId(SCHOOL))

    with pytest.raises(ForbiddenError):
        await service.update_content(
            ContentUpdateRequest(id=content_id, description="edited"), TENANT, SAME_ROLE_COLLEAGUE, None, False
        )
    matched = await service.delete_content(content_id, TENANT, SAME_ROLE_COLLEAGUE, None)

    assert matched == 0


async def test_tenant_side_users_cannot_change_partner_content(service, db):
    content_id = await _insert(db, ObjectId(PARTNER_OWNER), None)

    with pytest.raises(ForbiddenError):
        await service.update_content(
            ContentUpdateRequest(id=content_id, description="edited"), TENANT, OWNER, None, False
        )
    matched = await service.delete_content(content_id, TENANT, OWNER, None)

    assert matched == 0
    assert (await db["contentsV3"].find_one({"_id": ObjectId(content_id)}))["is_deleted"] is False
