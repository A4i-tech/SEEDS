from __future__ import annotations

import asyncio
import base64
import json
import logging
import os
import re
import struct
import tempfile
from pathlib import Path
from typing import Any, TypedDict

import aiohttp
import yaml
from motor.motor_asyncio import AsyncIOMotorDatabase
from openai import AsyncAzureOpenAI, RateLimitError
from pydantic import ValidationError as PydanticValidationError

from app.models.requests.meta_requests import CommandContext, HistoryEntry
from app.models.responses.meta import ProcessCommandResponse, TtsPromptResponse
from app.models.user import User
from app.platform.error_handling import AppError, ValidationError
from app.platform.settings import get_settings
from app.repositories.classroom_repository import ClassroomRepository
from app.repositories.content_repository import ContentRepository
from app.repositories.user_repository import UserRepository

logger = logging.getLogger(__name__)

_PROMPTS_PATH = Path(__file__).parent / "prompts" / "meta_prompts.yaml"
_prompts_cache: dict[str, Any] | None = None


def _get_prompts() -> dict[str, Any]:
    """Lazily load + cache the prompts YAML on first use.

    Reading the file at import time would fail the module import itself if the
    file isn't present yet at whatever point this module gets imported during
    the docker build (e.g. a build-time bytecode-compile/collection step) —
    deferring the read to first real use means only actual prompt usage can fail.
    """
    global _prompts_cache
    if _prompts_cache is None:
        try:
            _prompts_cache = yaml.safe_load(_PROMPTS_PATH.read_text(encoding="utf-8"))
        except (OSError, yaml.YAMLError) as exc:
            raise RuntimeError(f"meta_service: failed to load prompts from {_PROMPTS_PATH}: {exc}") from exc
    return _prompts_cache

_STOP_WORDS = {
    "play", "show", "find", "get", "list", "fetch", "search", "open", "start",
    "the", "a", "an", "in", "on", "at", "to", "for", "of", "my", "me", "all",
    "content", "classroom", "classrooms", "class", "student", "students",
    "please", "can", "you", "i", "want", "need", "with", "and", "or", "from",
    "is", "are", "it", "this", "that", "some", "any",
}


def _extract_keywords(text: str) -> list[str]:
    words = re.sub(r"[^a-z0-9\s]", "", text.lower()).split()
    return [w for w in words if len(w) > 1 and w not in _STOP_WORDS]


async def fetch_context_from_db(
    transcript: str,
    user_id: str,
    school_id: str,
    tenant_id: str,
    db: AsyncIOMotorDatabase,  # type: ignore[type-arg]
) -> dict[str, list]:
    keywords = _extract_keywords(transcript)
    if not keywords:
        return {"content": [], "classes": [], "students": []}

    escaped = [re.escape(k) for k in keywords]
    pattern = "|".join(escaped)
    regex = re.compile(pattern, re.IGNORECASE)

    content_repo = ContentRepository(db)
    classroom_repo = ClassroomRepository(db)
    user_repo = UserRepository(db)

    content_docs, class_docs = await asyncio.gather(
        content_repo.find_matching_keywords(regex, tenant_id=tenant_id, school_id=school_id, limit=10),
        classroom_repo.find_by_teacher(user_id),
    )

    all_student_ids: set[str] = set()
    for classroom in class_docs:
        all_student_ids.update(classroom.students)
        all_student_ids.update(classroom.leaders)

    student_map: dict[str, User] = {}
    if all_student_ids:
        for u in await user_repo.find_many_by_ids(list(all_student_ids)):
            student_map[u.id] = u

    school_students: list[User] = []
    if school_id:
        try:
            school_students = await user_repo.find_by_school_and_role(school_id, "student")
        except Exception as exc:  # noqa: BLE001 — fuzzy-match enrichment is best-effort
            logger.warning("meta_service: school-wide student lookup failed for school_id=%s: %s", school_id, exc)

    def _student_info(ref: str) -> dict[str, str] | None:
        doc = student_map.get(ref)
        if doc is None:
            logger.warning("meta_service: student ref %s not found in users collection, dropping from context", ref)
            return None
        return {"name": doc.name, "phone": doc.phone or ""}

    content_out = [
        {
            "_id": str(c.get("_id", "")),
            "title": (c.get("title") or {}).get("english") or (c.get("title") or {}).get("local") or "Unknown",
            "type": c.get("type", ""),
            "language": c.get("language", ""),
            "theme": (c.get("theme") or {}).get("english", ""),
        }
        for c in content_docs
    ]
    classes_out = [
        {
            "_id": c.id,
            "name": c.name,
            "students": [s for s in (_student_info(s) for s in c.students) if s is not None],
            "leaders": [ld for ld in (_student_info(ld) for ld in c.leaders) if ld is not None],
        }
        for c in class_docs
    ]
    students_out = [
        {"_id": s.id, "name": s.name, "phone": s.phone or ""}
        for s in school_students
    ]

    return {"content": content_out, "classes": classes_out, "students": students_out}


def _format_db_context(db_results: dict[str, list]) -> str:
    sections: list[str] = []

    if db_results["content"]:
        rows = "\n".join(
            f'  - _id: "{c["_id"]}" | title: "{c["title"]}" | type: {c["type"]} | lang: {c["language"]} | theme: {c["theme"]}'
            for c in db_results["content"]
        )
        sections.append(
            "═══ MATCHING CONTENT FROM DATABASE ═══\n"
            "Use these REAL content IDs when the user asks to play/find content:\n"
            + rows + "\n═══ END CONTENT ═══"
        )

    if db_results["classes"]:
        rows = "\n".join(
            f'  - _id: "{c["_id"]}" | name: "{c["name"]}" | students: {json.dumps(c["students"])} | leaders: {json.dumps(c["leaders"])}'
            for c in db_results["classes"]
        )
        sections.append(
            "═══ TEACHER'S CLASSES FROM DATABASE ═══\n"
            "Each class includes populated student/leader details (name + phone) for conference calls.\n"
            + rows + "\n═══ END CLASSES ═══"
        )

    if db_results["students"]:
        rows = "\n".join(
            f'  - _id: "{s["_id"]}" | name: "{s["name"]}" | phone: "{s["phone"]}"'
            for s in db_results["students"]
        )
        sections.append(
            "═══ TEACHER'S EXISTING STUDENTS ═══\n"
            "When adding a student or leader to a class, use ONLY these mapped _id VALUES "
            "(the students/leaders array stores user _id strings, NOT names or phone numbers).\n"
            'Names come from speech transcription and may be misspelled or mangled by accent '
            '(e.g. "Phonet" -> "Punit"). Match the requested name to the CLOSEST student below '
            "by phonetic/spelling similarity and use that student's _id. "
            "Only refuse if no student is a reasonably close match:\n"
            + rows + "\n═══ END STUDENTS ═══"
        )

    return "\n\n".join(sections) if sections else "(no matching data found in database)"


def _format_history(history: list[HistoryEntry] | None) -> str:
    if not history:
        return "RECENT CONVERSATION: (none — this is the first command)"
    lines = []
    for i, h in enumerate(history[-2:]):
        user_turn = (h.transcript or h.command or "").strip()
        assistant_turn = (h.spoken_summary or h.response or "").strip()
        line = f'{i + 1}. User: "{user_turn}"'
        if assistant_turn:
            line += f'\n   Assistant: "{assistant_turn}"'
        lines.append(line)
    return "RECENT CONVERSATION (oldest first, for resolving references only):\n" + "\n".join(lines)


_llm_client: AsyncAzureOpenAI | None = None


def _get_llm_client() -> AsyncAzureOpenAI:
    """Lazy module-level singleton — reuses one HTTP connection pool across calls."""
    global _llm_client
    if _llm_client is None:
        settings = get_settings()
        if not settings.azure_openai_key or not settings.azure_openai_endpoint:
            raise RuntimeError("Azure OpenAI not configured (AZURE_OPENAI_KEY / AZURE_OPENAI_ENDPOINT missing)")
        endpoint = settings.azure_openai_endpoint.rstrip("/").removesuffix("/openai/v1")
        _llm_client = AsyncAzureOpenAI(
            api_key=settings.azure_openai_key,
            azure_endpoint=endpoint,
            api_version=settings.azure_openai_api_version,
            max_retries=0,
        )
    return _llm_client


async def _call_llm(system_prompt: str, user_message: str) -> dict[str, Any]:
    """Call Azure OpenAI with json_object response format. Retries once on 429."""
    settings = get_settings()
    if not settings.azure_openai_model:
        raise RuntimeError("Azure OpenAI model not configured (AZURE_OPENAI_MODEL missing)")

    client = _get_llm_client()

    def _create():
        return client.chat.completions.create(
            model=settings.azure_openai_model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_message},
            ],
            temperature=0,
            response_format={"type": "json_object"},
        )

    try:
        resp = await _create()
        return json.loads(resp.choices[0].message.content)
    except RateLimitError as exc:
        retry_after = int(exc.response.headers.get("retry-after") or 5)
        logger.info("meta_service: rate limited, retrying in %ds", retry_after)
        await asyncio.sleep(retry_after)
        resp = await _create()
        return json.loads(resp.choices[0].message.content)


def _build_prompt(template: str, user_info: dict[str, Any], extras: dict[str, str] | None = None) -> str:
    prompt = (
        template
        .replace("{{phoneNumber}}", str(user_info["phone_number"]))
        .replace("{{teacherName}}", str(user_info.get("name") or "Teacher"))
        .replace("{{tenantId}}", str(user_info["tenant_id"]))
        .replace("{{userId}}", str(user_info.get("user_id") or "unknown"))
        .replace("{{activeConferenceId}}", str(user_info.get("active_conference_id") or "none"))
        .replace("{{currentClassId}}", str(user_info.get("current_class_id") or "none"))
    )
    for key, value in (extras or {}).items():
        prompt = prompt.replace(f"{{{{{key}}}}}", value)
    return prompt


async def get_db_context(
    transcript: str,
    user_info: dict[str, Any],
    db: AsyncIOMotorDatabase,  # type: ignore[type-arg]
) -> str:
    """Fetch + format DB grounding context once, shared across reason + plan phases."""
    db_results = await fetch_context_from_db(
        transcript,
        user_id=user_info.get("user_id", ""),
        school_id=user_info.get("school_id", ""),
        tenant_id=user_info["tenant_id"],
        db=db,
    )
    return _format_db_context(db_results)


async def reason_about_command(
    transcript: str,
    user_info: dict[str, Any],
    db_context: str,
) -> dict[str, Any]:
    history = _format_history(user_info.get("history"))
    system_prompt = _build_prompt(_get_prompts()["reasoning"], user_info, {"dbContext": db_context, "history": history})
    return await _call_llm(system_prompt, f'User command: "{transcript}"')


async def plan_commands(
    transcript: str,
    user_info: dict[str, Any],
    reasoning: dict[str, Any],
    db_context: str,
) -> dict[str, Any]:
    extras = {
        "reasoning": json.dumps(reasoning, indent=2),
        "dbContext": db_context,
        "history": _format_history(user_info.get("history")),
    }
    system_prompt = _build_prompt(_get_prompts()["planning"], user_info, extras)
    return await _call_llm(system_prompt, f'User command: "{transcript}"')


class StepResult(TypedDict):
    step: str
    status: int
    data: Any
    error: str


JSONValue = str | int | float | bool | None | list["JSONValue"] | dict[str, "JSONValue"]


def _resolve_placeholders(target: JSONValue, context: dict[str, StepResult]) -> JSONValue:
    if target is None:
        return target

    if isinstance(target, str):
        # Rewrite the bare-index form ({{1.data.id}}) the planner emits into 1-based {{stepN...}}.
        target = re.sub(
            r"\{\{(\d+)\.data\b",
            lambda m: f"{{{{step{int(m.group(1)) + 1}.data",
            target,
        )

        # Append to array: {{stepN.data.field+value}}
        def _append_replace(m: re.Match) -> str:  # type: ignore[type-arg]
            step_data = context.get(f"step{m.group(1)}", {}).get("data", {})
            arr = list(step_data.get(m.group(2)) or [])
            arr.append(m.group(3))
            return json.dumps(arr)

        target = re.sub(r"\{\{step(\d+)\.data\.(\w+)\+([^}]+)\}\}", _append_replace, target)

        # Simple field: {{stepN.data.field}}
        def _simple_replace(m: re.Match) -> str:  # type: ignore[type-arg]
            step_data = context.get(f"step{m.group(1)}", {}).get("data", {})
            value = step_data.get(m.group(2))
            if value is None:
                logger.warning("meta_service: unresolved placeholder %s", m.group(0))
                return m.group(0)
            if isinstance(value, (list, dict)):
                return json.dumps(value)
            return str(value)

        target = re.sub(r"\{\{step(\d+)\.data\.(\w+)\}\}", _simple_replace, target)

        # Array search: {{stepN.data[key=value].field}}
        def _search_replace(m: re.Match) -> str:  # type: ignore[type-arg]
            step_data = context.get(f"step{m.group(1)}", {}).get("data")
            if not isinstance(step_data, list):
                return m.group(0)
            found = next((i for i in step_data if str(i.get(m.group(2), "")).lower() == m.group(3).lower()), None)
            if not found:
                logger.warning("meta_service: unresolved placeholder %s", m.group(0))
                return m.group(0)
            return str(found.get(m.group(4), m.group(0)))

        target = re.sub(r"\{\{step(\d+)\.data\[(\w+)=([^\]]+)\]\.(\w+)\}\}", _search_replace, target)

        # Full data: {{stepN.data}}
        def _full_replace(m: re.Match) -> str:  # type: ignore[type-arg]
            step_data = context.get(f"step{m.group(1)}", {}).get("data")
            if step_data is None:
                logger.warning("meta_service: unresolved placeholder %s", m.group(0))
                return m.group(0)
            return json.dumps(step_data)

        target = re.sub(r"\{\{step(\d+)\.data\}\}", _full_replace, target)
        return target

    if isinstance(target, list):
        return [_resolve_placeholders(item, context) for item in target]

    if isinstance(target, dict):
        resolved: dict[str, JSONValue] = {}
        for k, v in target.items():
            val = _resolve_placeholders(v, context)
            if isinstance(val, str) and val.startswith("[") and val.endswith("]"):
                try:
                    val = json.loads(val)
                except (ValueError, TypeError) as exc:
                    logger.warning("meta_service: failed to re-parse placeholder JSON for %r: %s", k, exc)
            resolved[k] = val
        return resolved

    return target


# Path/method allowlist — LLM-planned commands run with the caller's real bearer token.
_ALLOWED_ROUTES: list[tuple[frozenset[str], re.Pattern]] = [  # type: ignore[type-arg]
    (frozenset({"GET"}), re.compile(r"^/content/themes/?$")),
    (frozenset({"GET"}), re.compile(r"^/content/[^/]*$")),
    (frozenset({"GET", "POST"}), re.compile(r"^/class/?$")),
    (frozenset({"GET", "DELETE"}), re.compile(r"^/class/[^/]+$")),
    # Students: read-only, no create/update/delete from a voice/text command.
    (frozenset({"GET"}), re.compile(r"^/student/?$")),
    (frozenset({"GET"}), re.compile(r"^/teacher/me/?$")),
    (frozenset({"GET"}), re.compile(r"^/tenant/names/?$")),
    (frozenset({"POST"}), re.compile(r"^/conference/create/?$")),
    (frozenset({"POST"}), re.compile(r"^/conference/start/[^/]+$")),
    (frozenset({"PUT"}), re.compile(r"^/conference/(end|muteall|unmuteall|playaudio|pauseaudio|addparticipant|removeparticipant)/[^/]+$")),
]


def _is_command_allowed(method: str, path: str) -> bool:
    method = (method or "").upper()
    path_only = path.split("?", 1)[0]
    return any(method in methods and pattern.match(path_only) for methods, pattern in _ALLOWED_ROUTES)


def _has_unresolved_placeholder(value: Any) -> bool:
    """True if a {{...}} template marker survived _resolve_placeholders — the
    referenced step data was missing, so this step must not be dispatched."""
    if isinstance(value, str):
        return "{{" in value
    if isinstance(value, list):
        return any(_has_unresolved_placeholder(v) for v in value)
    if isinstance(value, dict):
        return any(_has_unresolved_placeholder(v) for v in value.values())
    return False


async def _parse_response_body(resp: aiohttp.ClientResponse) -> Any:
    """Best-effort body parse — self-called routes normally return JSON, but an
    error page (proxy timeout, 502 from an upstream, etc.) can come back as
    plain text, so fall back to text rather than raise."""
    try:
        return await resp.json(content_type=None)
    except (json.JSONDecodeError, aiohttp.ContentTypeError):
        return await resp.text()


async def _execute_single(
    method: str,
    url: str,
    body: Any,
    token: str,
    description: str,
    session: aiohttp.ClientSession,
) -> StepResult:
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    try:
        async with session.request(
            method.lower(),
            url,
            json=body or None,
            headers=headers,
            timeout=aiohttp.ClientTimeout(total=15),
        ) as resp:
            data = await _parse_response_body(resp)
            return {"step": description, "status": resp.status, "data": data, "error": ""}
    except TimeoutError as exc:
        raise AppError(
            "COMMAND_TIMED_OUT",
            f"'{description}' took too long and was stopped. Nothing was saved. Check your connection and say the command again.",
            504,
        ) from exc
    except aiohttp.ClientError as exc:
        raise AppError(
            "COMMAND_FAILED",
            f"Could not complete '{description}' because the server was unreachable. Nothing was saved. Check your connection and say the command again.",
            502,
        ) from exc


async def execute_commands(
    commands: list[dict[str, Any]],
    auth_token: str,
    base_url: str,
) -> list[StepResult]:
    results: list[StepResult] = []
    context: dict[str, StepResult] = {}

    async with aiohttp.ClientSession() as session:
        for i, cmd in enumerate(commands):
            description = cmd.get("description", f"step {i + 1}")
            resolved_path = _resolve_placeholders(cmd.get("path", ""), context)
            resolved_body = _resolve_placeholders(cmd.get("body"), context)

            # `method` is mandatory on every planned step — a missing key is a malformed plan.
            if cmd.get("forEach"):
                step_kind = "forEach"
            else:
                method = cmd.get("method")
                if not isinstance(method, str) or method.upper() not in {"GET", "POST", "PUT", "DELETE", "NAVIGATE"}:
                    r = {
                        "step": description,
                        "status": 400,
                        "data": None,
                        "error": f"'{description}' could not run because the plan did not specify a valid action to take. Please rephrase your request and try again.",
                    }
                    results.append(r)
                    context[f"step{i + 1}"] = r
                    continue
                step_kind = method.upper()

            match step_kind:
                case "forEach":
                    m = re.search(r"\{\{step(\d+)\.data\[\]\.(\w+)\}\}", cmd.get("path", ""))
                    if not m:
                        r = {"step": description, "status": 400, "data": None, "error": "Could not determine forEach source"}
                        results.append(r)
                        context[f"step{i + 1}"] = {"step": description, "status": 400, "data": None, "error": ""}
                        continue
                    source_step, field = m.group(1), m.group(2)
                    source_data = context.get(f"step{source_step}", {}).get("data")
                    if not isinstance(source_data, list):
                        r = {"step": description, "status": 400, "data": None, "error": "forEach source is not an array"}
                        results.append(r)
                        context[f"step{i + 1}"] = {"step": description, "status": 400, "data": None, "error": ""}
                        continue
                    foreach_results: list[StepResult] = []
                    for item in source_data:
                        item_val = item.get(field)
                        if not item_val:
                            continue
                        item_path = re.sub(r"\{\{step\d+\.data\[\]\.\w+\}\}", str(item_val), cmd["path"])
                        if _has_unresolved_placeholder(item_path) or _has_unresolved_placeholder(resolved_body):
                            foreach_results.append({
                                "step": f"{description} ({item.get('name', item_val)})",
                                "status": 400,
                                "data": None,
                                "error": f"Could not resolve placeholder(s) in step: {item_path}",
                            })
                            continue
                        if not _is_command_allowed(cmd["method"], item_path):
                            foreach_results.append({
                                "step": f"{description} ({item.get('name', item_val)})",
                                "status": 403,
                                "data": None,
                                "error": f"Command not permitted: {cmd['method']} {item_path}",
                            })
                            continue
                        r = await _execute_single(
                            cmd["method"],
                            f"{base_url}{item_path}",
                            resolved_body,
                            auth_token,
                            f"{description} ({item.get('name', item_val)})",
                            session,
                        )
                        foreach_results.append(r)
                    results.extend(foreach_results)
                    context[f"step{i + 1}"] = {
                        "step": description,
                        "status": 200,
                        "data": [r["data"] for r in foreach_results],
                        "error": "",
                    }

                case "NAVIGATE":
                    # frontend-only pseudo-command
                    r = {"step": description, "status": 200, "data": {"navigate": resolved_path}, "error": ""}
                    results.append(r)
                    context[f"step{i + 1}"] = r

                case _:
                    if _has_unresolved_placeholder(resolved_path) or _has_unresolved_placeholder(resolved_body):
                        r = {
                            "step": description,
                            "status": 400,
                            "data": None,
                            "error": f"Could not resolve placeholder(s) in step: {resolved_path}",
                        }
                        logger.warning("meta_service: unresolved placeholder(s), refusing to dispatch step=%r path=%r", description, resolved_path)
                    elif not _is_command_allowed(step_kind, resolved_path):
                        r = {
                            "step": description,
                            "status": 403,
                            "data": None,
                            "error": f"Command not permitted: {step_kind} {resolved_path}",
                        }
                    else:
                        r = await _execute_single(
                            step_kind,
                            f"{base_url}{resolved_path}",
                            resolved_body,
                            auth_token,
                            description,
                            session,
                        )
                    results.append(r)
                    context[f"step{i + 1}"] = r

    return results


async def generate_spoken_summary(transcript: str, results: list[dict[str, Any]]) -> dict[str, Any]:
    lines: list[str] = []
    for i, r in enumerate(results):
        if r.get("error"):
            lines.append(f"Step {i + 1} ({r.get('step', '')}): FAILED — {r['error']}")
        else:
            data = r.get("data")
            items = data if isinstance(data, list) else (data.get("data") if isinstance(data, dict) else None)
            if isinstance(items, list):
                names = [
                    d.get("name") or (d.get("title") or {}).get("english") or str(d.get("_id", ""))
                    for d in items[:5]
                ]
                summary = f"returned {len(items)} items: {', '.join(str(n) for n in names)}"
            elif isinstance(data, dict):
                summary = f"returned: {json.dumps(data)[:200]}"
            else:
                summary = f"status {r.get('status')}"
            lines.append(f"Step {i + 1} ({r.get('step', '')}): SUCCESS — {summary}")
    user_message = f'User command: "{transcript}"\n\nExecution results:\n' + "\n".join(lines)
    return await _call_llm(_get_prompts()["tts_summary"], user_message)


def _escape_xml(text: str) -> str:
    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("'", "&apos;").replace('"', "&quot;")


async def synthesize_speech(text: str) -> str:
    """Return base64-encoded MP3 audio. Raises on any failure — callers that
    treat TTS as non-blocking (e.g. `_tts_summary`) catch at the call site;
    this function no longer swallows failures itself so there's a single
    catch point instead of two nested safety nets."""
    settings = get_settings()
    speech_key = settings.azure_speech_key or settings.tts_subscription_key
    speech_region = settings.azure_speech_region or settings.tts_region
    voice = settings.tts_voice or "en-US-AvaNeural"

    if not speech_key or not speech_region:
        raise RuntimeError("Azure Speech not configured (AZURE_SPEECH_KEY / AZURE_SPEECH_REGION missing)")

    locale = "-".join(voice.split("-")[:2])  # e.g. "en-US"
    ssml = (
        f"<speak version='1.0' xml:lang='{locale}'>"
        f"<voice xml:lang='{locale}' name='{voice}'>{_escape_xml(text)}</voice>"
        "</speak>"
    )
    url = f"https://{speech_region}.tts.speech.microsoft.com/cognitiveservices/v1"
    headers = {
        "Ocp-Apim-Subscription-Key": speech_key,
        "Content-Type": "application/ssml+xml",
        "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3",
        "User-Agent": "seeds-platform/meta",
    }
    async with aiohttp.ClientSession() as session:
        async with session.post(url, data=ssml.encode(), headers=headers, timeout=aiohttp.ClientTimeout(total=30)) as resp:
            if resp.status != 200:
                err = await resp.text()
                raise RuntimeError(f"TTS error {resp.status}: {err[:200]}")
            audio_bytes = await resp.read()
    return base64.b64encode(audio_bytes).decode()


def _pcm_to_wav(pcm: bytes, sample_rate: int = 16000, channels: int = 1, bits: int = 16) -> bytes:
    block_align = channels * bits // 8
    byte_rate = sample_rate * block_align
    data_size = len(pcm)
    header = struct.pack(
        "<4sI4s4sIHHIIHH4sI",
        b"RIFF", 36 + data_size, b"WAVE",
        b"fmt ", 16, 1, channels,
        sample_rate, byte_rate, block_align, bits,
        b"data", data_size,
    )
    return header + pcm


async def transcribe_audio(audio_bytes: bytes) -> str:
    """Convert browser WebM/Opus to WAV-PCM 16kHz via ffmpeg, then POST to Azure STT."""
    settings = get_settings()
    speech_key = settings.azure_speech_key or settings.tts_subscription_key
    speech_region = settings.azure_speech_region or settings.tts_region

    if not speech_key or not speech_region:
        raise RuntimeError("Azure Speech not configured (AZURE_SPEECH_KEY / AZURE_SPEECH_REGION missing)")

    with tempfile.NamedTemporaryFile(suffix=".webm", delete=False) as tmp_in:
        tmp_in.write(audio_bytes)
        tmp_in_path = tmp_in.name

    try:
        proc = await asyncio.create_subprocess_exec(
            "ffmpeg", "-y",
            "-i", tmp_in_path,
            "-ac", "1",
            "-ar", "16000",
            "-f", "s16le",
            "-acodec", "pcm_s16le",
            "pipe:1",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        pcm, stderr = await asyncio.wait_for(proc.communicate(), timeout=30)
        if proc.returncode != 0:
            logger.warning("meta_service: ffmpeg stderr: %s", stderr.decode(errors="replace")[-300:])
            raise RuntimeError("ffmpeg conversion failed")
    finally:
        try:
            os.unlink(tmp_in_path)
        except OSError as exc:
            logger.warning("meta_service: failed to clean up temp file %s: %s", tmp_in_path, exc)

    wav = _pcm_to_wav(pcm)
    stt_url = f"https://{speech_region}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=en-US"

    async with aiohttp.ClientSession() as session:
        async with session.post(
            stt_url,
            data=wav,
            headers={
                "Ocp-Apim-Subscription-Key": speech_key,
                "Content-Type": "audio/wav; codecs=audio/pcm; samplerate=16000",
                "Accept": "application/json",
            },
            timeout=aiohttp.ClientTimeout(total=20),
        ) as resp:
            result = await resp.json(content_type=None)

    if result.get("RecognitionStatus") != "Success":
        logger.warning("meta_service: STT non-success: %s", result.get("RecognitionStatus"))
        return ""
    return result.get("DisplayText", "")


# ponytail: module-level dict cache; good enough for static prompts
_tts_cache: dict[str, str] = {}


async def get_tts_prompt(prompt_type: str) -> TtsPromptResponse | None:
    text = _get_prompts()["static_tts"].get(prompt_type)
    if text is None:
        return None
    if prompt_type not in _tts_cache:
        try:
            audio = await synthesize_speech(text)
        except Exception as exc:  # noqa: BLE001 — static prompt still usable without audio
            logger.error("meta_service: TTS synthesis failed for prompt_type=%s: %s", prompt_type, exc)
            audio = None
        if audio:
            _tts_cache[prompt_type] = audio
    return TtsPromptResponse(text=text, audio_base64=_tts_cache.get(prompt_type))


# Orchestration entrypoints.


_MAX_AUDIO_BYTES = 25 * 1024 * 1024


def _parse_context(raw: str) -> CommandContext:
    try:
        return CommandContext.from_raw(raw)
    except (ValueError, PydanticValidationError) as exc:
        raise AppError(
            "INVALID_CONTEXT",
            "The app sent a screen context we could not read. Reload the page, then try the command again.",
            400,
        ) from exc


async def transcribe_upload(audio_bytes: bytes) -> str:
    if not audio_bytes:
        raise AppError(
            "NO_AUDIO",
            "No audio reached the server. Record again, then send.",
            400,
        )
    if len(audio_bytes) > _MAX_AUDIO_BYTES:
        raise AppError(
            "AUDIO_TOO_LARGE",
            "That recording is over the 25 MB limit. Record a shorter command, then send.",
            413,
        )
    transcript = await transcribe_audio(audio_bytes)
    logger.info("meta_service: transcript=%r", transcript)
    if not transcript.strip():
        raise AppError(
            "NO_SPEECH",
            "We heard no speech in that recording. Speak closer to the microphone, then record again.",
            400,
        )
    return transcript


async def execute_voice_command(
    audio_bytes: bytes,
    context: str,
    current_user: dict[str, Any],
    db: AsyncIOMotorDatabase,  # type: ignore[type-arg]
    auth_token: str,
    base_url: str,
) -> ProcessCommandResponse:
    transcript = await transcribe_upload(audio_bytes)
    user_info = await build_user_info(current_user, db, _parse_context(context))
    return await process_command(transcript, user_info, db, auth_token, base_url)


async def execute_text_command(
    command: str,
    context: CommandContext,
    current_user: dict[str, Any],
    db: AsyncIOMotorDatabase,  # type: ignore[type-arg]
    auth_token: str,
    base_url: str,
) -> ProcessCommandResponse:
    if not command.strip():
        raise AppError(
            "NO_COMMAND",
            "No command text was sent. Type a command, then send.",
            400,
        )
    logger.info("meta_service: text command=%r", command)
    user_info = await build_user_info(current_user, db, context)
    return await process_command(command, user_info, db, auth_token, base_url)


async def build_user_info(
    current_user: dict[str, Any],
    db: AsyncIOMotorDatabase,  # type: ignore[type-arg]
    context: CommandContext,
) -> dict[str, Any]:
    """Mirror JS getUserInfo(): token claims + user doc (phone/name) + client context."""
    user_id = current_user.get("sub", "")
    user = await UserRepository(db).find_by_id(user_id)
    phone = (user.phone if user else "").strip() if user and user.phone else ""
    if not phone:
        raise ValidationError("Teacher account has no phone number on file — required for voice commands.")
    tenant_id = current_user.get("tenant_id", "")
    if not tenant_id:
        raise ValidationError("Your account is missing a tenant ID — sign out and sign back in to refresh your session.")
    return {
        "user_id": user_id,
        "tenant_id": tenant_id,
        "school_id": current_user.get("school_id", "") or (user.school_id if user else ""),
        "phone_number": phone,
        "name": (user.name if user else "") or "Teacher",
        # Client-supplied context (camelCase over the wire, like the JS API)
        "active_conference_id": context.active_conference_id or "none",
        "current_class_id": context.current_class_id or "none",
        "history": context.history,
    }


async def _tts_summary(
    transcript: str, results: list[dict[str, Any]]
) -> tuple[str | None, str | None]:
    """Spoken summary + TTS audio. Non-blocking: failures return (None, None)."""
    try:
        tts_result = await generate_spoken_summary(transcript, results)
        spoken = tts_result.get("spokenText")
        audio = await synthesize_speech(spoken) if spoken else None
        return spoken, audio
    except Exception as exc:  # noqa: BLE001 — TTS is non-blocking
        logger.error("meta_service: TTS phase failed (non-blocking): %s", exc)
        return None, None


async def process_command(
    transcript: str,
    user_info: dict[str, Any],
    db: AsyncIOMotorDatabase,  # type: ignore[type-arg]
    auth_token: str,
    base_url: str,
) -> ProcessCommandResponse:
    """Shared reason → plan → execute → summarize flow (JS processCommand)."""
    db_context = await get_db_context(transcript, user_info, db)
    try:
        reasoning = await reason_about_command(transcript, user_info, db_context)
    except Exception as exc:  # noqa: BLE001
        logger.error("meta_service: reasoning phase failed: %s", exc)
        raise AppError("AI_REASONING_FAILED", f"AI reasoning failed: {exc}", 502) from exc
    logger.info(
        "meta_service: reasoning intent=%s can_auto_resolve=%s",
        reasoning.get("intent"), reasoning.get("can_auto_resolve"),
    )

    if reasoning.get("can_auto_resolve") is False:
        explanation = (
            reasoning.get("unresolved_note")
            or " Then ".join(s.get("description", "") for s in reasoning.get("steps", []))
            or reasoning.get("reasoning")
            or "I understand your question but cannot execute it automatically."
        )
        spoken_summary, audio_b64 = await _tts_summary(
            transcript,
            [{"step": "explanation", "status": 200, "data": {"explanation": explanation}, "error": ""}],
        )
        spoken_summary = spoken_summary or explanation
        return ProcessCommandResponse(
            transcript=transcript,
            reasoning=reasoning,
            commands=[],
            results=[],
            spoken_summary=spoken_summary,
            audio_base64=audio_b64,
        )

    try:
        plan = await plan_commands(transcript, user_info, reasoning, db_context)
    except Exception as exc:  # noqa: BLE001
        logger.error("meta_service: planning phase failed: %s", exc)
        raise AppError("AI_PLANNING_FAILED", f"AI planning failed: {exc}", 502) from exc
    if plan.get("error"):
        return ProcessCommandResponse(transcript=transcript, reasoning=reasoning, error=plan["error"])
    commands = plan.get("commands")
    if not isinstance(commands, list):
        logger.error("meta_service: LLM plan output has no 'commands' list: %s", plan)
        raise AppError(
            "AI_PLANNING_FAILED",
            "We could not turn that request into an action. Please rephrase it and try again.",
            502,
        )
    if any(c.get("needs_input") for c in commands):
        return ProcessCommandResponse(
            transcript=transcript,
            reasoning=reasoning,
            commands=commands,
            needs_input=True,
            message="Some steps require additional input. Please review and confirm.",
        )

    logger.info("meta_service: executing %d commands", len(commands))
    results = await execute_commands(commands, auth_token, base_url)

    spoken_summary, audio_b64 = await _tts_summary(transcript, results)

    return ProcessCommandResponse(
        transcript=transcript,
        reasoning=reasoning,
        commands=commands,
        results=results,
        spoken_summary=spoken_summary or "",
        audio_base64=audio_b64,
    )
