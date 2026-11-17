import argparse
import asyncio
import json
from datetime import UTC, datetime
from pathlib import Path

from app.platform.database import close_database, get_database, init_database
from app.repositories.ocr_correction_repository import OcrCorrectionRepository

SEED = Path(__file__).with_name("ocr_corrections_seed.json")


async def main(apply):
    pairs = json.loads(SEED.read_text(encoding="utf-8"))["pairs"]
    if not apply:
        for pair in pairs:
            print(f"{pair['language']} g{pair['grade']} {pair['wrong']} -> {pair['right']}")
        print(f"dry run: {len(pairs)} rows would be inserted. Pass --apply to write.")
        return
    await init_database()
    try:
        repo = OcrCorrectionRepository(get_database())
        inserted = existing = 0
        for pair in pairs:
            added_at = datetime.now(UTC)
            doc = {
                "language": pair["language"],
                "wrong": pair["wrong"],
                "right": pair["right"],
                "grade": pair["grade"],
                "subject": pair["subject"],
                "context": pair["context"],
                "page": None,
                "status": "approved",
                "source": "sheet:" + ",".join(pair["source_ids"]),
                "added_by": "backfill",
                "added_at": added_at,
            }
            row = await repo.add(doc)
            if row["added_at"] == added_at:
                inserted += 1
            else:
                existing += 1
        print(f"inserted={inserted} existing={existing}")
    finally:
        await close_database()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true")
    asyncio.run(main(parser.parse_args().apply))
