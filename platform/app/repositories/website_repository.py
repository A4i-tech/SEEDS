from __future__ import annotations

from collections.abc import Sequence
from datetime import UTC, datetime
from typing import Any

from pymongo.asynchronous.database import AsyncDatabase

from app.platform.domain import claimed_domains
from app.repositories.base_repository import BaseRepository

_PRIMARY_DOMAIN = {"$map": {"input": {"$literal": [0]}, "as": "i", "in": "$domain"}}

_CLAIMED_DOMAINS = {
    "$setUnion": [
        {
            "$filter": {
                "input": {
                    "$map": {
                        "input": {"$concatArrays": [_PRIMARY_DOMAIN, {"$ifNull": ["$additional_domains", []]}]},
                        "as": "d",
                        "in": {"$toLower": "$$d"},
                    }
                },
                "as": "d",
                "cond": {"$ne": ["$$d", ""]},
            }
        }
    ]
}


_HOST_LABEL = "[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?"
HOSTNAME_LOWERCASE_PATTERN = rf"^{_HOST_LABEL}(?:\.{_HOST_LABEL})+\z"
_ADDITIONAL_DOMAINS = {"$ifNull": ["$additional_domains", []]}


def _all_lowercase_hostnames(array: Any) -> dict[str, Any]:
    is_hostname = {
        "$and": [
            {"$eq": [{"$type": "$$d"}, "string"]},
            {"$regexMatch": {"input": "$$d", "regex": HOSTNAME_LOWERCASE_PATTERN}},
        ]
    }
    return {"$allElementsTrue": [{"$map": {"input": array, "as": "d", "in": is_hostname}}]}


CLAIMS_VALIDATOR = {
    "$expr": {
        "$and": [
            {"$eq": [{"$type": "$domain"}, "string"]},
            {"$regexMatch": {"input": "$domain", "regex": HOSTNAME_LOWERCASE_PATTERN, "options": "i"}},
            {"$isArray": _ADDITIONAL_DOMAINS},
            {"$isArray": "$claimed_domains"},
            _all_lowercase_hostnames(_ADDITIONAL_DOMAINS),
            _all_lowercase_hostnames("$claimed_domains"),
            {"$setEquals": [{"$setUnion": [[{"$toLower": "$domain"}], _ADDITIONAL_DOMAINS]}, "$claimed_domains"]},
        ]
    }
}


class WebsiteRepository(BaseRepository):
    COLLECTION = "websites"

    def __init__(self, db: AsyncDatabase) -> None:
        self._col = db[self.COLLECTION]

    @classmethod
    async def ensure_indexes(cls, db: AsyncDatabase) -> None:
        col = db[cls.COLLECTION]
        await col.create_index("site_id", unique=True)
        await col.create_index("domain", unique=True)
        await col.create_index("additional_domains")
        await cls._ensure_additional_domains_unique_index(col)
        await col.create_index(
            "claimed_domains",
            name="claimed_domains_unique",
            unique=True,
            partialFilterExpression={"claimed_domains.0": {"$exists": True}},
        )

    @staticmethod
    async def _ensure_additional_domains_unique_index(col: Any) -> None:
        cursor = await col.aggregate(
            [
                {"$unwind": "$additional_domains"},
                {"$group": {"_id": "$additional_domains", "site_ids": {"$addToSet": "$site_id"}}},
                {"$match": {"$expr": {"$gt": [{"$size": "$site_ids"}, 1]}}},
            ]
        )
        duplicates = await cursor.to_list(length=None)
        if duplicates:
            claims = "; ".join(f"{d['_id']} -> {sorted(d['site_ids'])}" for d in duplicates)
            raise RuntimeError(
                "Cannot create the unique websites.additional_domains index: domains claimed by more "
                f"than one website: {claims}. Resolve the duplicates manually and restart."
            )
        await col.create_index(
            "additional_domains",
            name="additional_domains_unique",
            unique=True,
            partialFilterExpression={"additional_domains.0": {"$exists": True}},
        )

    async def create(
        self,
        tenant_id: str,
        project_id: str | None,
        domain: str,
        site_id: str,
        name: str = "",
        status: str = "Active",
        languages: list[dict[str, Any]] | None = None,
        additional_domains: Sequence[str] = (),
    ) -> dict[str, Any]:
        now = datetime.now(UTC)
        doc = {
            "tenant_id": tenant_id,
            "project_id": project_id,
            "domain": domain,
            "additional_domains": list(additional_domains),
            "claimed_domains": claimed_domains(domain, list(additional_domains)),
            "site_id": site_id,
            "name": name,
            "status": status,
            "languages": languages or [],
            "created_at": now,
            "updated_at": now,
        }
        result = await self._col.insert_one(doc)
        doc["_id"] = result.inserted_id
        return doc

    async def find_by_id_and_tenant(self, website_id: str, tenant_id: str) -> dict[str, Any] | None:
        return await self._col.find_one({"_id": self._to_id(website_id), "tenant_id": tenant_id})

    async def find_by_site_id(self, site_id: str) -> dict[str, Any] | None:
        return await self._col.find_one({"site_id": site_id})

    async def find_claiming(self, domain: str) -> dict[str, Any] | None:
        return await self._col.find_one(
            {"$or": [{"claimed_domains": domain}, {"domain": domain}, {"additional_domains": domain}]}
        )

    async def has_unclaimed_websites(self) -> bool:
        return await self._col.find_one({"claimed_domains": {"$not": {"$type": "array"}}}, {"_id": 1}) is not None

    @classmethod
    async def claims_validator_level(cls, db: AsyncDatabase) -> str | None:
        cursor = await db.list_collections(filter={"name": cls.COLLECTION})
        for collection in await cursor.to_list(length=None):
            options = collection.get("options", {})
            if options.get("validator") == CLAIMS_VALIDATOR:
                return options.get("validationLevel", "strict")
        return None

    @classmethod
    async def set_claims_validator(cls, db: AsyncDatabase, level: str) -> None:
        await db.command(
            "collMod",
            cls.COLLECTION,
            validator=CLAIMS_VALIDATOR,
            validationLevel=level,
            validationAction="error",
        )

    async def find_by_domain(self, domain: str) -> dict[str, Any] | None:
        return await self._col.find_one({"$or": [{"domain": domain}, {"additional_domains": domain}]})

    async def find_by_project_and_tenant(self, project_id: str, tenant_id: str) -> list[dict[str, Any]]:
        return await self._col.find({"project_id": project_id, "tenant_id": tenant_id}).to_list(length=None)

    async def find_all_by_tenant(self, tenant_id: str) -> list[dict[str, Any]]:
        return await self._col.find({"tenant_id": tenant_id}).to_list(length=None)

    async def update(self, website_id: str, tenant_id: str, fields: dict[str, Any]) -> dict[str, Any] | None:
        fields = {**fields, "updated_at": datetime.now(UTC)}
        pipeline: list[dict[str, Any]] = [{"$set": {key: {"$literal": value} for key, value in fields.items()}}]
        if "domain" in fields or "additional_domains" in fields:
            pipeline.append({"$set": {"claimed_domains": _CLAIMED_DOMAINS}})
        await self._col.update_one({"_id": self._to_id(website_id), "tenant_id": tenant_id}, pipeline)
        return await self.find_by_id_and_tenant(website_id, tenant_id)

    async def delete(self, website_id: str, tenant_id: str) -> bool:
        result = await self._col.delete_one({"_id": self._to_id(website_id), "tenant_id": tenant_id})
        return result.deleted_count > 0

    async def count(self) -> int:
        return await self._col.count_documents({})
