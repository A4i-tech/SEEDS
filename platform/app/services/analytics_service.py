"""
Analytics service — IVR and conference usage analytics.

Ported from backend-server/src/services/analytics.service.js.

Returns plain dicts with camelCase keys so the existing ContentWebApp frontend
contract is preserved unchanged after the platform cutover.

SECURITY:
  - All queries are tenant-scoped; school_admin callers are pinned to their own
    school by the controller before this service is invoked.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import TYPE_CHECKING, Any

from fastapi import Depends
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.platform.auth.dependencies import get_db
from app.platform.error_handling import NotFoundError
from app.repositories.conference_repository import ConferenceRepository
from app.repositories.content_repository import ContentRepository
from app.repositories.ivr_repository import IVRRepository
from app.repositories.school_repository import SchoolRepository
from app.repositories.user_repository import UserRepository

# Motor's database class isn't parameterized anywhere in this codebase; alias it
# once so the sole type-arg workaround lives here, not at every annotation site.
if TYPE_CHECKING:
    MotorDatabase = AsyncIOMotorDatabase[Any]
else:
    MotorDatabase = AsyncIOMotorDatabase

logger = logging.getLogger(__name__)

# Cap on the per-response `calls`/`conferences` detail lists so a broad date
# range on a large tenant can't return an unbounded, PII-heavy payload. Totals
# and aggregates are still computed over every matched row; only the row-level
# detail list is truncated, and the response flags when that happens.
MAX_ANALYTICS_ROWS = 5000

SUCCESS_STATUSES = {"completed"}
FAILURE_STATUSES = {"failed", "busy", "unanswered", "rejected", "cancelled", "timeout"}

CLASS_SIZE_BUCKETS = [
    {"label": "1-5", "min": 1, "max": 5},
    {"label": "6-10", "min": 6, "max": 10},
    {"label": "11-20", "min": 11, "max": 20},
    {"label": "21-50", "min": 21, "max": 50},
    {"label": "50+", "min": 51, "max": float("inf")},
]

ACTION_CONFERENCE_START = "Conference-Start"
ACTION_CONFERENCE_END = "Conference-End"
ACTION_RAISE_HAND = "Student-RaiseHandStateChange"

# Roles whose users are attributed as "teacher" for analytics purposes.
TEACHER_ROLES = {"teacher", "content_creator"}


# ---------------------------------------------------------------------------
# Pure helpers (no I/O) — exported for unit tests
# ---------------------------------------------------------------------------


def normalize_phone(phone: Any) -> str:
    """Last 10 digits of a phone number, ignoring formatting and country code."""
    digits = "".join(ch for ch in str(phone or "") if ch.isdigit())
    return digits[-10:]


def conference_teacher_phone(doc: dict) -> Any:
    """Teacher phone from a conferenceState doc, tolerating the live field-name
    split: teacher_phone_number is canonical, teacher_phone is legacy."""
    return doc.get("teacher_phone_number") or doc.get("teacher_phone")


def phone_candidates(phone: Any) -> list[str]:
    """All plausible stored representations of a phone number, for $in queries."""
    raw = str(phone or "").strip()
    digits = "".join(ch for ch in raw if ch.isdigit())
    last10 = digits[-10:]
    if not last10:
        return []
    seen: dict[str, None] = {}
    for c in (raw, digits, last10, f"91{last10}", f"+91{last10}"):
        seen.setdefault(c, None)
    return list(seen.keys())


def median(values: list[float]) -> float | None:
    if not values:
        return None
    s = sorted(values)
    mid = len(s) // 2
    if len(s) % 2:
        return s[mid]
    return (s[mid - 1] + s[mid]) / 2


def average(values: list[float]) -> float | None:
    if not values:
        return None
    return sum(values) / len(values)


def parse_date(value: Any) -> datetime | None:
    """Parse a date field into a datetime.

    Fields flow in as two real shapes: BSON date columns (created_at/stopped_at)
    arrive from Motor already as datetime, while action_history timestamps are
    ISO strings. Both are first-class inputs here — the datetime branch is not
    defensive padding.
    """
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        return value
    text = str(value).replace(" ", "T")
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    try:
        return datetime.fromisoformat(text)
    except ValueError:
        return None


def _delta_seconds(start: datetime, end: datetime) -> float | None:
    """Seconds between two datetimes.

    Normalizes both sides to UTC-aware before subtracting: a naive datetime is
    assumed to be UTC (Mongo stores BSON dates in UTC) rather than having its
    tzinfo stripped off the aware side, which would shift the represented
    instant and corrupt the duration.
    """
    if start.tzinfo is None:
        start = start.replace(tzinfo=UTC)
    if end.tzinfo is None:
        end = end.replace(tzinfo=UTC)
    if end <= start:
        return None
    return (end - start).total_seconds()


def final_call_status(call_status_updates: dict | None) -> str | None:
    """Final status from call_status_updates ({isoTimestamp: status}).

    Keys are parsed to datetimes and the chronologically-last status is
    returned — parsing (not raw string sort) so that mixed tz-aware/naive or
    offset variants order correctly rather than lexicographically.

    Some IVRv2 writes use dotted $set paths that nest the fractional-second part
    one level deep ({"...T10:02:36": {"173000+00:00": "started"}}). This shape
    is still produced by the live write path (observed in staging in 2026), so
    the flattening below is required, not legacy handling.
    """
    entries: list[tuple[str, Any]] = []
    for key, value in (call_status_updates or {}).items():
        if isinstance(value, dict):
            for inner_key, inner_value in value.items():
                entries.append((f"{key}.{inner_key}", inner_value))
        else:
            entries.append((key, value))
    if not entries:
        return None

    def sort_key(kv: tuple[str, Any]) -> tuple[int, Any]:
        # Sort by parsed timestamp; unparsable keys fall back to their raw
        # string but sort before parsed ones so a bad key never wins "last".
        # Flattened nested keys ("...T10:02:36.173000+00:00") are valid ISO too.
        parsed = parse_date(kv[0])
        if parsed is None:
            logger.warning("final_call_status: unparsable timestamp key %r", kv[0])
            return (0, kv[0])
        return (1, parsed.replace(tzinfo=UTC) if parsed.tzinfo is None else parsed)

    entries.sort(key=sort_key)
    return entries[-1][1]


def classify_call(final_status: Any) -> str:
    """Classify a call as completed | failed | dropped from its final status."""
    if final_status in SUCCESS_STATUSES:
        return "completed"
    if final_status in FAILURE_STATUSES:
        return "failed"
    return "dropped"


def session_seconds(log: dict) -> float | None:
    """Session length in seconds: Vonage-reported duration, else stopped_at - created_at."""
    try:
        reported = int(log.get("duration"))
    except (TypeError, ValueError):
        reported = None
    if reported is not None and reported > 0:
        return float(reported)
    start = parse_date(log.get("created_at"))
    end = parse_date(log.get("stopped_at"))
    if start and end:
        return _delta_seconds(start, end)
    return None


def bucket_class_size(size: int) -> str | None:
    for b in CLASS_SIZE_BUCKETS:
        if b["min"] <= size <= b["max"]:
            return b["label"]
    return None


def extract_conference_metrics(doc: dict) -> dict:
    """Extract per-conference metrics from a conferenceState document."""
    history = doc.get("action_history") or []
    if not isinstance(history, list):
        logger.warning(
            "extract_conference_metrics: action_history is %s not list for conf %s — treating as empty",
            type(history).__name__,
            doc.get("_id"),
        )
        history = []
    start_action = next((a for a in history if a.get("action_type") == ACTION_CONFERENCE_START), None)
    end_actions = [a for a in history if a.get("action_type") == ACTION_CONFERENCE_END]
    end_action = end_actions[-1] if end_actions else None

    started_at = parse_date(start_action.get("timestamp")) if start_action else None
    ended_at = parse_date(end_action.get("timestamp")) if end_action else None
    duration_seconds = (
        _delta_seconds(started_at, ended_at) if (started_at and ended_at) else None
    )

    participants = list((doc.get("participants") or {}).values())
    student_count = sum(1 for p in participants if p and p.get("role") == "Student")
    raised_hand_events = sum(
        1
        for a in history
        if a.get("action_type") == ACTION_RAISE_HAND
        and isinstance(a.get("metadata"), dict)
        and a["metadata"].get("raised_hand") is True
    )

    return {
        "conferenceId": doc.get("_id"),
        "startedAt": started_at.isoformat() if started_at else None,
        "endedAt": ended_at.isoformat() if ended_at else None,
        "durationSeconds": duration_seconds,
        "studentCount": student_count,
        "raisedHandEvents": raised_hand_events,
        "isRunning": doc.get("is_running") is True,
        "neverStarted": start_action is None,
    }


def match_content(stream_url: str, content_index: list[dict]) -> dict | None:
    """Map a stream URL to content (exact match, then prefix match)."""
    for entry in content_index:
        if entry["url"] == stream_url:
            return entry
    for entry in content_index:
        if stream_url.startswith(entry["url"]):
            return entry
    return None


def round_or_null(value: float | None, decimals: int = 1) -> float | None:
    if value is None:
        return None
    return round(value, decimals)


# ---------------------------------------------------------------------------
# Service
# ---------------------------------------------------------------------------


class AnalyticsService:
    def __init__(self, db: MotorDatabase) -> None:
        self._db = db
        self._school_repo = SchoolRepository(db)
        self._user_repo = UserRepository(db)
        self._ivr_repo = IVRRepository(db)
        self._conf_repo = ConferenceRepository(db)
        self._content_repo = ContentRepository(db)

    async def _build_attribution_map(
        self, tenant_id: str, school_id: str | None
    ) -> dict[str, Any]:
        """Build a phone → person map for all teachers and students in scope.

        Teachers win collisions. Returns {map, schools, teachers}.
        """
        schools = await self._school_repo.find_all_by_tenant(tenant_id)
        if school_id:
            schools = [s for s in schools if str(s.id) == str(school_id)]
        school_by_id = {str(s.id): s for s in schools}
        school_ids = set(school_by_id.keys())

        users = await self._user_repo.find_all_by_tenant(tenant_id)
        in_scope = [u for u in users if u.school_id in school_ids]

        phone_map: dict[str, dict] = {}
        teachers: list[dict] = []

        def role_value(u: Any) -> str:
            return u.role.value if hasattr(u.role, "value") else str(u.role)

        # Students first so teachers overwrite on phone collisions.
        for u in in_scope:
            if role_value(u) != "student":
                continue
            key = normalize_phone(u.phone)
            if key:
                school = school_by_id[u.school_id]
                phone_map[key] = {
                    "kind": "student",
                    "id": str(u.id),
                    "name": u.name,
                    "schoolId": str(school.id),
                    "schoolName": school.name,
                }
        for u in in_scope:
            if role_value(u) not in TEACHER_ROLES:
                continue
            school = school_by_id[u.school_id]
            teachers.append(
                {
                    "_id": str(u.id),
                    "name": u.name,
                    "phoneNumber": u.phone,
                    "schoolId": str(school.id),
                }
            )
            key = normalize_phone(u.phone)
            if key:
                phone_map[key] = {
                    "kind": "teacher",
                    "id": str(u.id),
                    "name": u.name,
                    "schoolId": str(school.id),
                    "schoolName": school.name,
                }
        return {"map": phone_map, "schools": schools, "teachers": teachers}

    async def _build_content_url_index(self, tenant_id: str) -> list[dict]:
        """Map stream URLs to contents (exact match, then prefix match)."""
        contents = await self._content_repo.find_by_tenant(tenant_id)
        index: list[dict] = []
        for content in contents:
            title = content.title.english if content.title else ""
            urls: list[str] = []
            if content.title and content.title.audio_url:
                urls.append(content.title.audio_url)
            if content.theme and content.theme.audio_url:
                urls.append(content.theme.audio_url)
            for a in content.audio_content or []:
                if a.audio_url:
                    urls.append(a.audio_url)
            for url in urls:
                index.append({"url": url, "contentId": str(content.id), "title": title})
        return index

    async def get_ivr_analytics(self, scope: dict, date_range: dict) -> dict:
        """IVR analytics for a tenant, optionally scoped to a school and/or teacher."""
        tenant_id = scope["tenantId"]
        school_id = scope.get("schoolId")
        teacher_id = scope.get("teacherId")
        start: datetime = date_range["start"]
        end: datetime = date_range["end"]

        attribution = await self._build_attribution_map(tenant_id, school_id)
        phone_map = attribution["map"]
        schools = attribution["schools"]

        phone_numbers: list[str] | None = None
        if teacher_id:
            teacher = await self._user_repo.find_by_id(teacher_id)
            # Validate tenant first: in the tenant-wide case (school_id is None)
            # a teacher from another tenant could otherwise pass on a matching
            # school_id alone, leaking cross-tenant attribution.
            in_scope = (
                teacher is not None
                and str(teacher.tenant_id) == str(tenant_id)
                and any(str(s.id) == str(teacher.school_id) for s in schools)
            )
            if not in_scope:
                raise NotFoundError("Teacher", teacher_id)
            phone_numbers = phone_candidates(teacher.phone)
        elif school_id:
            phone_numbers = list(
                {c for phone in phone_map for c in phone_candidates(phone)}
            )

        logs = await self._ivr_repo.find_for_analytics(
            tenant_id, start, end, phone_numbers
        )

        attributed = [
            {"log": log, "person": phone_map.get(normalize_phone(log.get("phone_number")))}
            for log in logs
        ]
        if school_id:
            rows = [
                r
                for r in attributed
                if r["person"] and r["person"]["schoolId"] == str(school_id)
            ]
        else:
            rows = attributed

        durations: list[float] = []
        status_breakdown: dict[str, int] = {}
        completed_calls = failed_calls = dropped_calls = unattributed_calls = 0
        by_school: dict[str, dict] = {}
        by_teacher: dict[str, dict] = {}
        by_content: dict[str, dict] = {}
        calls: list[dict] = []

        for row in rows:
            log = row["log"]
            person = row["person"]
            status = final_call_status(log.get("call_status_updates")) or "unknown"
            classification = classify_call(status)
            status_breakdown[status] = status_breakdown.get(status, 0) + 1
            if classification == "completed":
                completed_calls += 1
            elif classification == "failed":
                failed_calls += 1
            else:
                dropped_calls += 1
            if not person:
                unattributed_calls += 1

            seconds = session_seconds(log)
            if seconds is not None:
                durations.append(seconds)

            if person:
                school_entry = by_school.setdefault(
                    person["schoolId"],
                    {
                        "schoolId": person["schoolId"],
                        "schoolName": person["schoolName"],
                        "totalCalls": 0,
                        "durations": [],
                        "failedOrDropped": 0,
                    },
                )
                school_entry["totalCalls"] += 1
                if seconds is not None:
                    school_entry["durations"].append(seconds)
                if classification != "completed":
                    school_entry["failedOrDropped"] += 1

                if person["kind"] == "teacher":
                    teacher_entry = by_teacher.setdefault(
                        person["id"],
                        {
                            "teacherId": person["id"],
                            "teacherName": person["name"],
                            "schoolId": person["schoolId"],
                            "schoolName": person["schoolName"],
                            "totalCalls": 0,
                            "durations": [],
                            "failedOrDropped": 0,
                        },
                    )
                    teacher_entry["totalCalls"] += 1
                    if seconds is not None:
                        teacher_entry["durations"].append(seconds)
                    if classification != "completed":
                        teacher_entry["failedOrDropped"] += 1

            for playback in log.get("stream_playback") or []:
                stream_url = playback.get("stream_url")
                if not stream_url:
                    continue
                usage = by_content.setdefault(
                    stream_url,
                    {
                        "streamUrl": stream_url,
                        "playCount": 0,
                        "completedPlays": 0,
                        "callers": set(),
                    },
                )
                usage["playCount"] += 1
                if playback.get("done_at"):
                    usage["completedPlays"] += 1
                if caller := log.get("phone_number"):
                    usage["callers"].add(caller)

            calls.append(
                {
                    "phoneNumber": log.get("phone_number"),
                    "callerName": person["name"] if person else None,
                    "callerType": person["kind"] if person else None,
                    "schoolName": person["schoolName"] if person else None,
                    "createdAt": _iso_or_value(log.get("created_at")),
                    "stoppedAt": _iso_or_value(log.get("stopped_at")),
                    "durationSeconds": seconds,
                    "finalStatus": status,
                }
            )

        content_index = await self._build_content_url_index(tenant_id)
        content_usage = sorted(
            (
                {
                    "contentId": (c := match_content(usage["streamUrl"], content_index))
                    and c["contentId"],
                    "title": c["title"] if c else usage["streamUrl"].rsplit("/", 1)[-1],
                    "streamUrl": usage["streamUrl"],
                    "playCount": usage["playCount"],
                    "completedPlays": usage["completedPlays"],
                    "uniqueCallers": len(usage["callers"]),
                }
                for usage in by_content.values()
            ),
            key=lambda u: u["playCount"],
            reverse=True,
        )

        total_calls = len(rows)
        return {
            "totals": {
                "totalCalls": total_calls,
                "completedCalls": completed_calls,
                "failedCalls": failed_calls,
                "droppedCalls": dropped_calls,
                "dropFailureRate": round_or_null((failed_calls + dropped_calls) / total_calls, 4)
                if total_calls
                else None,
                "unattributedCalls": unattributed_calls,
            },
            "sessionLength": {
                "averageSeconds": round_or_null(average(durations)),
                "medianSeconds": round_or_null(median(durations)),
                "totalSeconds": round_or_null(sum(durations)),
            },
            "statusBreakdown": status_breakdown,
            "bySchool": [
                {
                    "schoolId": e["schoolId"],
                    "schoolName": e["schoolName"],
                    "totalCalls": e["totalCalls"],
                    "averageSeconds": round_or_null(average(e["durations"])),
                    "medianSeconds": round_or_null(median(e["durations"])),
                    "failureRate": round_or_null(e["failedOrDropped"] / e["totalCalls"], 4),
                }
                for e in by_school.values()
            ],
            "byTeacher": [
                {
                    "teacherId": e["teacherId"],
                    "teacherName": e["teacherName"],
                    "schoolId": e["schoolId"],
                    "schoolName": e["schoolName"],
                    "totalCalls": e["totalCalls"],
                    "averageSeconds": round_or_null(average(e["durations"])),
                    "failureRate": round_or_null(e["failedOrDropped"] / e["totalCalls"], 4),
                }
                for e in by_teacher.values()
            ],
            "contentUsage": content_usage,
            "calls": calls[:MAX_ANALYTICS_ROWS],
            "callsTruncated": len(calls) > MAX_ANALYTICS_ROWS,
        }

    async def get_conference_analytics(self, scope: dict, date_range: dict) -> dict:
        """Conference analytics for a tenant, optionally scoped to a school and/or teacher."""
        tenant_id = scope["tenantId"]
        school_id = scope.get("schoolId")
        teacher_id = scope.get("teacherId")
        start: datetime = date_range["start"]
        end: datetime = date_range["end"]

        attribution = await self._build_attribution_map(tenant_id, school_id)
        phone_map = attribution["map"]
        teachers = attribution["teachers"]

        scoped_teachers = teachers
        if teacher_id:
            scoped_teachers = [t for t in teachers if str(t["_id"]) == str(teacher_id)]
            if not scoped_teachers:
                raise NotFoundError("Teacher", teacher_id)

        candidates = list(
            {c for t in scoped_teachers for c in phone_candidates(t["phoneNumber"])}
        )
        docs = (
            await self._conf_repo.find_by_teacher_phones_in_date_range(
                candidates, start.isoformat(), end.isoformat()
            )
            if candidates
            else []
        )

        durations: list[float] = []
        class_sizes: list[int] = []
        completed_conferences = live_conferences = never_started = 0
        total_raised_hands = 0
        by_teacher: dict[str, dict] = {}
        conferences: list[dict] = []

        for doc in docs:
            metrics = extract_conference_metrics(doc)
            teacher_phone = conference_teacher_phone(doc)
            person = phone_map.get(normalize_phone(teacher_phone))

            if metrics["isRunning"]:
                live_conferences += 1
            elif metrics["neverStarted"]:
                never_started += 1
            else:
                completed_conferences += 1

            if metrics["durationSeconds"] is not None:
                durations.append(metrics["durationSeconds"])
            if metrics["studentCount"] > 0:
                class_sizes.append(metrics["studentCount"])
            total_raised_hands += metrics["raisedHandEvents"]

            teacher_key = person["id"] if person else normalize_phone(teacher_phone)
            teacher_entry = by_teacher.setdefault(
                teacher_key,
                {
                    "teacherId": person["id"] if person else None,
                    "teacherName": person["name"] if person else teacher_phone,
                    "schoolId": person["schoolId"] if person else None,
                    "schoolName": person["schoolName"] if person else None,
                    "totalConferences": 0,
                    "durations": [],
                    "classSizes": [],
                    "raisedHandEvents": 0,
                },
            )
            teacher_entry["totalConferences"] += 1
            if metrics["durationSeconds"] is not None:
                teacher_entry["durations"].append(metrics["durationSeconds"])
            if metrics["studentCount"] > 0:
                teacher_entry["classSizes"].append(metrics["studentCount"])
            teacher_entry["raisedHandEvents"] += metrics["raisedHandEvents"]

            conferences.append(
                {
                    "conferenceId": metrics["conferenceId"],
                    "teacherName": person["name"] if person else teacher_phone,
                    "schoolName": person["schoolName"] if person else None,
                    "startedAt": metrics["startedAt"],
                    "endedAt": metrics["endedAt"],
                    "durationSeconds": metrics["durationSeconds"],
                    "studentCount": metrics["studentCount"],
                    "raisedHandEvents": metrics["raisedHandEvents"],
                    "isRunning": metrics["isRunning"],
                }
            )

        distribution = [
            {
                "bucket": b["label"],
                "count": sum(1 for size in class_sizes if b["min"] <= size <= b["max"]),
            }
            for b in CLASS_SIZE_BUCKETS
        ]

        total_conferences = len(docs)
        return {
            "totals": {
                "totalConferences": total_conferences,
                "completedConferences": completed_conferences,
                "liveConferences": live_conferences,
                "neverStarted": never_started,
            },
            "duration": {
                "averageSeconds": round_or_null(average(durations)),
                "medianSeconds": round_or_null(median(durations)),
                "totalSeconds": round_or_null(sum(durations)),
            },
            "classSize": {
                "average": round_or_null(average(class_sizes)),
                "median": round_or_null(median(class_sizes)),
                "distribution": distribution,
            },
            "raisedHands": {
                "totalEvents": total_raised_hands,
                "averagePerConference": round_or_null(total_raised_hands / total_conferences)
                if total_conferences
                else None,
            },
            "byTeacher": [
                {
                    "teacherId": e["teacherId"],
                    "teacherName": e["teacherName"],
                    "schoolId": e["schoolId"],
                    "schoolName": e["schoolName"],
                    "totalConferences": e["totalConferences"],
                    "totalDurationSeconds": round_or_null(sum(e["durations"])),
                    "averageDurationSeconds": round_or_null(average(e["durations"])),
                    "averageClassSize": round_or_null(average(e["classSizes"])),
                    "raisedHandEvents": e["raisedHandEvents"],
                }
                for e in by_teacher.values()
            ],
            "conferences": conferences[:MAX_ANALYTICS_ROWS],
            "conferencesTruncated": len(conferences) > MAX_ANALYTICS_ROWS,
        }


def _iso_or_value(value: Any) -> Any:
    """Return ISO string for datetimes, pass strings/None through unchanged."""
    if isinstance(value, datetime):
        return value.isoformat()
    return value


def get_analytics_service(
    db: MotorDatabase = Depends(get_db),
) -> AnalyticsService:
    return AnalyticsService(db)
