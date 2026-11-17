import json
import re
import sys
from pathlib import Path

import openpyxl

OUT = Path(__file__).with_name("ocr_corrections_seed.json")
LOOKUP = "Translation index/lookup"
OTHER_TAGS = {"Regex rule / lookup", "Verifier model prompt fix"}
MIXED_SPELLING_IDS = {"ISS-144", "ISS-157", "ISS-170", "ISS-231", "ISS-244", "ISS-257"}
COMMON_WORD_IDS = {"ISS-062", "ISS-116", "ISS-127", "ISS-162", "ISS-174", "ISS-203", "ISS-214", "ISS-249", "ISS-261"}
# Matches the sheet wording: Replace “X” with “Y”, optionally "both occurrences of" or "in both places".
REPLACE = re.compile(
    r"Replace (?:both occurrences of )?“([^”]+)” with “([^”]+)”(?: in both places)?\.?"
)
# Matches the sheet wording: Do not change “X”.
PROTECT = re.compile(r"Do not change “([^”]+)”")


def classify(row_id, tag, correction):
    protected = PROTECT.findall(correction)
    if protected:
        return None, "Correction lists several variants and a protected word", protected
    match = REPLACE.fullmatch(correction.strip())
    if match and row_id in COMMON_WORD_IDS:
        return None, "Replaced word is common. Needs a context before it is safe", []
    if match:
        return match.groups(), None, []
    if tag == LOOKUP or row_id in MIXED_SPELLING_IDS:
        return None, "Correction is not a single Replace X with Y", []
    return "skip", None, []


def clean_grade(grade):
    if grade is None or str(grade).strip() == "":
        return None
    if isinstance(grade, float) and grade.is_integer():
        return str(int(grade))
    return str(grade).strip()


def main():
    if len(sys.argv) != 2:
        print("Usage: python extract_ocr_corrections.py <path to Feedback_Consolidated.xlsx>")
        sys.exit(1)
    sheet = openpyxl.load_workbook(sys.argv[1], read_only=True)["Issues"]
    pairs = {}
    needs_review = []
    protected = []
    covered = set()
    skipped = 0
    for row in list(sheet.iter_rows(values_only=True))[1:]:
        row_id, grade, language, subject, issue, correction, tag, effort = (
            row[0], clean_grade(row[2]), row[3], row[4], row[7], row[8], row[11], row[13],
        )
        if effort != "Quick fix" or (tag != LOOKUP and tag not in OTHER_TAGS):
            skipped += 1
            continue
        pair, reason, words = classify(row_id, tag, correction or "")
        if pair == "skip":
            skipped += 1
            continue
        for word in words:
            protected.append({"language": language, "text": word, "source_id": row_id})
        if pair is None:
            needs_review.append(
                {"id": row_id, "reason": reason, "issue": issue, "correction": correction}
            )
            continue
        wrong, right = pair
        key = (language, grade, subject, wrong, right)
        entry = pairs.setdefault(
            key,
            {
                "language": language,
                "grade": grade,
                "subject": subject,
                "wrong": wrong,
                "right": right,
                "context": None,
                "source_ids": [],
            },
        )
        entry["source_ids"].append(row_id)
        covered.add(row_id)
    data = {
        "pairs": list(pairs.values()),
        "needs_review": needs_review,
        "protected": protected,
    }
    OUT.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    print(
        f"pairs={len(pairs)} needs_review={len(needs_review)} "
        f"protected={len(protected)} source_rows={len(covered)} skipped={skipped}"
    )


if __name__ == "__main__":
    main()
