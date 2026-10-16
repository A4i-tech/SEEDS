#!/usr/bin/env python3
"""
Migration 021 — Backfill websites.claimed_domains and enforce unique domain claims.

claimed_domains is derived from `domain` and `additional_domains` (lowercased,
deduplicated; see app.platform.domain.claimed_domains). The unique partial index
`claimed_domains_unique` makes MongoDB reject two websites claiming the same hostname
in any combination of the primary `domain` and `additional_domains`. A collection
validator (installed here) requires every website to carry claims that match its
domains, so no writer can bypass the index with a missing or stale claimed_domains.

How concurrent writes are handled
    * Maintenance window: until no website lacks claimed_domains, the application refuses
      every register / domain update with HTTP 503 (OnboardingService._ensure_claims_migrated).
      The check reads the shared database, so it covers every application instance, and no
      domain claim can be acquired while legacy websites are still unclaimed.
    * Older application versions ignore that check, so the collection validator is installed
      first. From then on MongoDB rejects their inserts and updates that leave claimed_domains
      missing or stale.
    * Success is reported only after a final verification: no duplicates, no website missing
      or with stale claims, validator in strict mode.

Deployment order:
    1. Deploy the application version that includes the gate to every instance. Domain
       registration and domain edits return 503 from this point until step 3 completes.
    2. Run this migration (--dry-run first), immediately after the deployment.
    3. It exits 0 only when verification passed; any other exit code means the maintenance
       window is still open and the migration must be fixed and re-run.

Steps:
    1. Read every website and compute normalized claims. If any hostname is claimed by more
       than one website, print each hostname with its site_ids and stop before writing
       anything. Nothing is deleted or rewritten; resolve the duplicates manually and re-run.
    2. Create the website indexes, then install the claims validator in `moderate` mode.
    3. Re-read and re-check for duplicates (catches writes made while step 2 ran).
    4. Backfill claimed_domains per document with a compare-and-set on the fields it was
       computed from, retrying when a concurrent update changed them.
    5. Switch the validator to `strict`, then verify in rounds until nothing is missing or
       stale. A duplicate-key error or an exhausted retry is reported as a conflict and the
       migration exits non-zero.

Idempotent and restartable: documents whose claimed_domains already match are not touched,
and every step can be repeated after a failure or interruption. The gate stays closed for
as long as any website lacks claimed_domains, so an interrupted run is never mistaken for a
finished one.

Usage:
    python migrations/021_website_claimed_domains.py [--dry-run] [--mongo-uri URI]
"""

from __future__ import annotations

import argparse
import asyncio
import os
import sys
from typing import Any

_HERE = os.path.dirname(os.path.abspath(__file__))
_PROJECT_ROOT = os.path.dirname(_HERE)
if _PROJECT_ROOT not in sys.path:
    sys.path.insert(0, _PROJECT_ROOT)

COLLECTION = "websites"
MAX_ATTEMPTS = 5
MAX_ROUNDS = 5
CONFIRM_DELAY_SECONDS = 1.0


def _claims(doc: dict[str, Any]) -> list[str]:
    from app.platform.domain import claimed_domains

    domain = doc.get("domain")
    additional = doc.get("additional_domains")
    return claimed_domains(
        domain if isinstance(domain, str) else None,
        [value for value in additional if isinstance(value, str)] if isinstance(additional, list) else None,
    )


def find_duplicate_claims(docs: list[dict[str, Any]]) -> dict[str, list[str]]:
    owners: dict[str, set[str]] = {}
    for doc in docs:
        for domain in _claims(doc):
            owners.setdefault(domain, set()).add(str(doc.get("site_id") or doc["_id"]))
    return {domain: sorted(sites) for domain, sites in sorted(owners.items()) if len(sites) > 1}


def _malformed_values(doc: dict[str, Any]) -> list[Any]:
    from app.platform.domain import DOMAIN_RE

    domain = doc.get("domain")
    additional = doc.get("additional_domains")
    malformed = [] if isinstance(domain, str) and DOMAIN_RE.fullmatch(domain) else [domain]
    if isinstance(additional, list):
        malformed += [
            value
            for value in additional
            if not (isinstance(value, str) and value == value.lower() and DOMAIN_RE.fullmatch(value))
        ]
    elif additional is not None:
        malformed.append(additional)
    return malformed


def find_unnormalizable(docs: list[dict[str, Any]]) -> dict[str, list[str]]:
    bad: dict[str, list[str]] = {}
    for doc in docs:
        malformed = _malformed_values(doc)
        if malformed:
            bad[str(doc.get("site_id") or doc["_id"])] = [repr(value) for value in malformed]
    return bad


def _is_current(doc: dict[str, Any]) -> bool:
    claims = doc.get("claimed_domains")
    return isinstance(claims, list) and sorted(map(str, claims)) == sorted(_claims(doc))


def _guard(doc: dict[str, Any]) -> dict[str, Any]:
    additional = doc.get("additional_domains", {"$exists": False})
    return {"_id": doc["_id"], "domain": doc.get("domain"), "additional_domains": additional}


def succeeded(result: dict[str, Any]) -> bool:
    blockers = result["duplicates"] or result["unnormalizable"] or result["conflicts"] or result["remaining"]
    return not blockers and result["strict"]


def _report_problems(result: dict[str, Any]) -> None:
    if result["unnormalizable"]:
        _report_unnormalizable(result["unnormalizable"])
    if result["duplicates"]:
        _report_duplicates(result["duplicates"])


def _report_unnormalizable(bad: dict[str, list[str]]) -> None:
    print("Websites with an invalid domain or additional_domains cannot be backfilled; fix them manually.")
    print("(wrong type, empty, whitespace, not a hostname, or an additional domain with uppercase letters)")
    for site_id, values in bad.items():
        print(f"  site_id {site_id} -> {values}")


def _report_duplicates(duplicates: dict[str, list[str]]) -> None:
    print("Duplicate domain claims found; nothing was backfilled:")
    for domain, sites in duplicates.items():
        print(f"  {domain} -> site_ids {sites}")


def _print_summary(result: dict[str, Any]) -> None:
    print(f"Backfilled {result['backfilled']} document(s).")
    for conflict in result["conflicts"]:
        print(f"  CONFLICT site_id={conflict['site_id']}: {conflict['error']}")
    print(f"Websites without current claimed_domains: {result['remaining']}")


async def _backfill(col: Any, docs: list[dict[str, Any]], result: dict[str, Any]) -> None:
    from pymongo.errors import DuplicateKeyError

    for doc in docs:
        for _ in range(MAX_ATTEMPTS):
            try:
                updated = await col.update_one(_guard(doc), {"$set": {"claimed_domains": _claims(doc)}})
            except DuplicateKeyError as exc:
                result["conflicts"].append({"site_id": doc.get("site_id"), "error": str(exc)})
                break
            if updated.matched_count:
                result["backfilled"] += 1
                break
            doc = await col.find_one({"_id": doc["_id"]})
            if doc is None or _is_current(doc):
                break
        else:
            result["conflicts"].append({"site_id": doc.get("site_id"), "error": "changed concurrently, re-run"})


async def _read_with_confirmed_duplicates(col: Any) -> tuple[list[dict[str, Any]], dict[str, list[str]]]:
    docs = await col.find({}).to_list(length=None)
    duplicates = find_duplicate_claims(docs)
    if duplicates:
        await asyncio.sleep(CONFIRM_DELAY_SECONDS)
        docs = await col.find({}).to_list(length=None)
        duplicates = find_duplicate_claims(docs)
    return docs, duplicates


async def _count_not_current(col: Any) -> int:
    return len([doc for doc in await col.find({}).to_list(length=None) if not _is_current(doc)])


async def run(db: Any, dry_run: bool) -> dict[str, Any]:
    from app.repositories.website_repository import WebsiteRepository

    col = db[COLLECTION]
    docs, duplicates = await _read_with_confirmed_duplicates(col)
    result: dict[str, Any] = {
        "total": len(docs),
        "duplicates": duplicates,
        "unnormalizable": find_unnormalizable(docs),
        "backfilled": 0,
        "conflicts": [],
        "remaining": 0,
        "strict": False,
    }

    if result["unnormalizable"] or result["duplicates"]:
        _report_problems(result)
        return result

    stale = [doc for doc in docs if not _is_current(doc)]
    print(f"{len(docs)} website(s), {len(stale)} need claimed_domains backfilled.")
    if dry_run:
        print(f"[DRY-RUN] {len(stale)} document(s) would be updated; no indexes or validator created.")
        result["remaining"] = len(stale)
        return result

    await WebsiteRepository.ensure_indexes(db)
    if await WebsiteRepository.claims_validator_level(db) != "strict":
        await WebsiteRepository.set_claims_validator(db, "moderate")

    docs, result["duplicates"] = await _read_with_confirmed_duplicates(col)
    if result["duplicates"]:
        _report_duplicates(result["duplicates"])
        return result

    await _backfill(col, [doc for doc in docs if not _is_current(doc)], result)
    if result["conflicts"]:
        result["remaining"] = await _count_not_current(col)
        _print_summary(result)
        return result

    await WebsiteRepository.set_claims_validator(db, "strict")
    result["strict"] = True

    for _ in range(MAX_ROUNDS):
        docs, result["duplicates"] = await _read_with_confirmed_duplicates(col)
        if result["duplicates"]:
            _report_duplicates(result["duplicates"])
            return result
        stale = [doc for doc in docs if not _is_current(doc)]
        if not stale:
            break
        await _backfill(col, stale, result)
        if result["conflicts"]:
            break

    result["remaining"] = await _count_not_current(col)
    _print_summary(result)
    return result


async def migrate(mongo_uri: str, dry_run: bool) -> None:
    from pymongo import AsyncMongoClient

    from app.platform.database import _extract_db_name

    client: AsyncMongoClient = AsyncMongoClient(mongo_uri)  # type: ignore[type-arg]
    db_name = _extract_db_name(mongo_uri)
    print(f"Database: {db_name}")

    try:
        result = await run(client[db_name], dry_run)
    finally:
        await client.close()

    if dry_run:
        if result["duplicates"] or result["unnormalizable"]:
            sys.exit(1)
        return
    if not succeeded(result):
        print("Migration did NOT complete; website domain changes stay paused (HTTP 503) until it does.")
        sys.exit(1)
    print("Migration complete and verified.")


def _resolve_mongo_uri(cli_uri: str | None) -> str:
    if cli_uri:
        return cli_uri
    for env_var in ("MONGO_DB_CONNECTION_STRING", "DB_CONNECTION"):
        val = os.environ.get(env_var, "").strip()
        if val:
            return val
    env_path = os.path.join(_PROJECT_ROOT, ".env")
    if os.path.exists(env_path):
        with open(env_path) as f:
            for line in f:
                line = line.strip()
                if line.startswith("#") or "=" not in line:
                    continue
                key, _, value = line.partition("=")
                if key.strip() in ("MONGO_DB_CONNECTION_STRING", "DB_CONNECTION"):
                    val = value.strip().strip('"').strip("'")
                    if val:
                        return val
    return "mongodb://localhost:27017/seeds"


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]
    parser = argparse.ArgumentParser(description="Backfill websites.claimed_domains and enforce unique domain claims.")
    parser.add_argument("--dry-run", action="store_true", help="Preview changes without writing.")
    parser.add_argument("--mongo-uri", default=None, help="MongoDB connection URI.")
    args = parser.parse_args()

    mongo_uri = _resolve_mongo_uri(args.mongo_uri)
    masked = mongo_uri[:20] + "..." if len(mongo_uri) > 20 else mongo_uri
    print(f"Connecting to: {masked}")
    print(f"Mode: {'DRY-RUN (no writes)' if args.dry_run else 'LIVE (will write)'}\n")

    asyncio.run(migrate(mongo_uri, args.dry_run))


if __name__ == "__main__":
    main()
