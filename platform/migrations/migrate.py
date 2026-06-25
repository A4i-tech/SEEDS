#!/usr/bin/env python3
"""
Master migrator — runs all numbered migrations in order.

Migrations are discovered by filename pattern NNN_*.py (excluding rollback/verify).
Each migration module must expose a callable:

    async def migrate(mongo_uri: str, dry_run: bool) -> None

Usage:
    python migrations/migrate.py [--dry-run] [--mongo-uri URI] [--from N] [--only N]

    --dry-run        Preview all changes without writing.
    --mongo-uri URI  Override connection string.
    --from N         Start from migration N (skip earlier ones).
    --only N         Run only migration N.
"""

from __future__ import annotations

import argparse
import asyncio
import importlib.util
import os
import re
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
_PROJECT_ROOT = os.path.dirname(_HERE)
if _PROJECT_ROOT not in sys.path:
    sys.path.insert(0, _PROJECT_ROOT)

# Migrations to run in order — explicit list so nothing runs by accident.
_MIGRATIONS: list[tuple[str, str]] = [
    ("001", "001_unify_users.py"),
    ("002", "002_tenant_scoped_indexes.py"),
    ("003", "003_quizdata_objectid_to_string.py"),
    ("004", "004_users_snake_case_fields.py"),
    ("005", "005_contentsv3_snake_case.py"),
    ("005b", "005b_contentsv3_duration_seconds.py"),
    ("006", "006_classes_snake_case.py"),
    ("007", "007_conferencestate_snake_case.py"),
    ("008", "008_comprehension_snake_case.py"),
    ("009", "009_fsmcontexts_snake_case.py"),
    ("010", "010_logs_snake_case.py"),
    ("011", "011_logentries_snake_case.py"),
    ("012", "012_callslogs_oid.py"),
    ("013", "013_ivrfsms_oid.py"),
    ("014", "014_conferencestate_oid.py"),
    ("015", "015_conferences_oid.py"),
    ("016", "016_coerce_user_ref_ids_to_objectid.py"),
]


def _load_migrate_fn(filename: str):
    path = os.path.join(_HERE, filename)
    spec = importlib.util.spec_from_file_location(filename[:-3], path)
    mod = importlib.util.module_from_spec(spec)  # type: ignore[arg-type]
    spec.loader.exec_module(mod)  # type: ignore[union-attr]
    if not hasattr(mod, "migrate"):
        raise AttributeError(f"{filename} has no `migrate` function")
    return mod.migrate


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


async def run_all(mongo_uri: str, dry_run: bool, from_key: str | None, only_key: str | None) -> None:
    to_run = _MIGRATIONS

    if only_key:
        to_run = [(k, f) for k, f in _MIGRATIONS if k == only_key]
        if not to_run:
            print(f"ERROR: No migration with key '{only_key}'. Valid keys: {[k for k,_ in _MIGRATIONS]}")
            sys.exit(1)
    elif from_key:
        keys = [k for k, _ in _MIGRATIONS]
        if from_key not in keys:
            print(f"ERROR: No migration with key '{from_key}'. Valid keys: {keys}")
            sys.exit(1)
        idx = keys.index(from_key)
        to_run = _MIGRATIONS[idx:]

    print("=" * 60)
    print(f"Master migrator — {'DRY-RUN' if dry_run else 'LIVE'}")
    print(f"Running {len(to_run)} migration(s)")
    print("=" * 60)
    print()

    for key, filename in to_run:
        print(f">>> [{key}] {filename}")
        print("-" * 60)
        fn = _load_migrate_fn(filename)
        await fn(mongo_uri, dry_run)
        print()

    print("=" * 60)
    print(f"Done. {'(dry-run — no writes)' if dry_run else 'All migrations complete.'}")
    print("=" * 60)


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]
    parser = argparse.ArgumentParser(description="Run all platform migrations in order.")
    parser.add_argument("--dry-run", action="store_true", help="Preview without writing.")
    parser.add_argument("--mongo-uri", default=None)
    parser.add_argument("--from", dest="from_key", default=None, metavar="N",
                        help="Start from migration N (e.g. 004).")
    parser.add_argument("--only", dest="only_key", default=None, metavar="N",
                        help="Run only migration N (e.g. 005b).")
    args = parser.parse_args()

    mongo_uri = _resolve_mongo_uri(args.mongo_uri)
    masked = mongo_uri[:20] + "..." if len(mongo_uri) > 20 else mongo_uri
    print(f"Connecting to: {masked}\n")

    asyncio.run(run_all(mongo_uri, args.dry_run, args.from_key, args.only_key))


if __name__ == "__main__":
    main()
