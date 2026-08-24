#!/usr/bin/env python3
"""
Register a Content Aggregator integration client (OAuth2 Client Credentials).

Per the SEEDS 2.0 Content Aggregators spec (2.2 Client Registration): registration
is admin-mediated and out-of-band — there is no public self-service HTTP endpoint.
This script generates a client_id/client_secret pair, stores only the bcrypt hash
of the secret, and prints the raw secret once. It is never persisted or logged.

Usage:
    python -m tools.register_integration_client --name hexis-adapter \
        --tenant-ids tenantA,tenantB --scopes content:read,content:write \
        [--mongo-uri URI]
"""

from __future__ import annotations

import argparse
import asyncio
import os
import secrets
import uuid
from datetime import UTC, datetime

import bcrypt
from pymongo import AsyncMongoClient

from app.models.content_aggregator import IntegrationClient
from app.platform.database import _extract_db_name
from app.repositories.integration_client_repository import IntegrationClientRepository

CLIENT_SECRET_BCRYPT_ROUNDS = 12


def _resolve_mongo_uri(cli_uri: str | None) -> str:
    if cli_uri:
        return cli_uri
    for env_var in ("MONGO_DB_CONNECTION_STRING", "DB_CONNECTION"):
        val = os.environ.get(env_var, "").strip()
        if val:
            return val
    return "mongodb://localhost:27017/seeds_platform"


async def register(
    mongo_uri: str, name: str, tenant_ids: list[str], scopes: list[str]
) -> None:
    client_id = str(uuid.uuid4())
    client_secret = secrets.token_urlsafe(32)
    secret_hash = bcrypt.hashpw(
        client_secret.encode("utf-8"), bcrypt.gensalt(rounds=CLIENT_SECRET_BCRYPT_ROUNDS)
    ).decode("utf-8")

    db_client = AsyncMongoClient(mongo_uri)
    try:
        db = db_client[_extract_db_name(mongo_uri)]
        repo = IntegrationClientRepository(db)
        integration_client = IntegrationClient(
            client_id=client_id,
            client_secret_hash=secret_hash,
            name=name,
            tenant_ids=tenant_ids,
            allowed_scopes=scopes,
            created_at=datetime.now(tz=UTC),
        )
        await repo.create(integration_client)
    finally:
        await db_client.close()

    print(f"name:          {name}")
    print(f"tenant_ids:    {tenant_ids}")
    print(f"allowed_scopes:{scopes}")
    print(f"client_id:     {client_id}")
    print(f"client_secret: {client_secret}")
    print("\nSave the client_secret now — it will not be shown again.")


def main() -> None:
    parser = argparse.ArgumentParser(description="Register an integration client.")
    parser.add_argument("--name", required=True, help="Human-readable label (e.g. hexis-adapter).")
    parser.add_argument("--tenant-ids", required=True, help="Comma-separated tenant IDs.")
    parser.add_argument("--scopes", required=True, help="Comma-separated allowed scopes.")
    parser.add_argument("--mongo-uri", default=None, help="MongoDB connection URI.")
    args = parser.parse_args()

    mongo_uri = _resolve_mongo_uri(args.mongo_uri)
    tenant_ids = [t.strip() for t in args.tenant_ids.split(",") if t.strip()]
    scopes = [s.strip() for s in args.scopes.split(",") if s.strip()]

    asyncio.run(register(mongo_uri, args.name, tenant_ids, scopes))


if __name__ == "__main__":
    main()
