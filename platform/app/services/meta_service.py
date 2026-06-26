"""
SEEDS AI Controller — meta service.

Ported from backend-server/src/services/meta.service.js.

4-phase pipeline:
  1. fetchContextFromDB + reasonAboutCommand  (Azure OpenAI)
  2. planCommands                             (Azure OpenAI)
  3. executeCommands                          (httpx self-calls)
  4. generateSpokenSummary + synthesizeSpeech (Azure OpenAI + Azure TTS)

SECURITY:
  - API keys never logged.
  - Auth token forwarded to self-calls via Authorization header only.
"""

from __future__ import annotations

import asyncio
import io
import logging
import re
import struct
import subprocess  # nosec B404 — controlled ffmpeg invocation, no shell=True
import tempfile
from typing import Any

import aiohttp
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.platform.settings import get_settings

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Stop-words for keyword extraction (mirrors JS STOP_WORDS set)
# ---------------------------------------------------------------------------
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


# ---------------------------------------------------------------------------
# MongoDB pre-fetch — grounding context for LLM prompts
# ---------------------------------------------------------------------------

async def fetch_context_from_db(
    transcript: str,
    user_id: str,
    school_id: str,
    db: AsyncIOMotorDatabase,  # type: ignore[type-arg]
) -> dict[str, list]:
    keywords = _extract_keywords(transcript)
    if not keywords:
        return {"content": [], "classes": [], "students": []}

    escaped = [re.escape(k) for k in keywords]
    pattern = "|".join(escaped)
    regex = re.compile(pattern, re.IGNORECASE)

    content_query = {
        "isDeleted": {"$ne": True},
        "$or": [
            {"title.english": regex},
            {"title.local": regex},
            {"type": regex},
            {"theme.english": regex},
        ],
    }
    class_query = {"teacher": user_id}
    student_query = {"schoolId": school_id} if school_id else None

    content_cursor = db["contentsV3"].find(
        content_query,
        {"_id": 1, "title": 1, "type": 1, "language": 1, "theme": 1},
    ).limit(10)

    class_cursor = db["classes"].find(
        class_query,
        {"_id": 1, "name": 1, "students": 1, "leaders": 1},
    )

    content_docs, class_docs = await asyncio.gather(
        content_cursor.to_list(length=10),
        class_cursor.to_list(length=None),
    )

    # Populate student/leader refs for classes
    all_student_ids: set[str] = set()
    for cls in class_docs:
        all_student_ids.update(str(s) for s in cls.get("students", []))
        all_student_ids.update(str(s) for s in cls.get("leaders", []))

    student_map: dict[str, dict] = {}
    if all_student_ids:
        user_cursor = db["users"].find(
            {"_id": {"$in": list(all_student_ids)}},
            {"_id": 1, "name": 1, "phoneNumber": 1},
        )
        for doc in await user_cursor.to_list(length=None):
            student_map[str(doc["_id"])] = doc

    # School-wide students for fuzzy matching
    school_students: list[dict] = []
    if student_query:
        try:
            sc = db["users"].find(student_query, {"_id": 0, "name": 1, "phoneNumber": 1})
            school_students = await sc.to_list(length=None)
        except Exception:  # noqa: BLE001
            school_students = []

    def _student_info(ref: Any) -> dict:
        doc = student_map.get(str(ref), {})
        return {"name": doc.get("name", ""), "phone": doc.get("phoneNumber", "")}

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
            "_id": str(c.get("_id", "")),
            "name": c.get("name", ""),
            "students": [_student_info(s) for s in c.get("students", [])],
            "leaders": [_student_info(l) for l in c.get("leaders", [])],
        }
        for c in class_docs
    ]
    students_out = [
        {"name": s.get("name", ""), "phone": s.get("phoneNumber", "")}
        for s in school_students
    ]

    return {"content": content_out, "classes": classes_out, "students": students_out}


# ---------------------------------------------------------------------------
# DB context formatter
# ---------------------------------------------------------------------------

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
        import json
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
            f'  - name: "{s["name"]}" | phone: "{s["phone"]}"'
            for s in db_results["students"]
        )
        sections.append(
            "═══ TEACHER'S EXISTING STUDENTS ═══\n"
            "When adding a student or leader to a class, use ONLY these mapped PHONE NUMBERS.\n"
            'Names come from speech transcription and may be misspelled or mangled by accent '
            '(e.g. "Phonet" -> "Punit"). Match the requested name to the CLOSEST student below '
            "by phonetic/spelling similarity and use that student's phone. "
            "Only refuse if no student is a reasonably close match:\n"
            + rows + "\n═══ END STUDENTS ═══"
        )

    return "\n\n".join(sections) if sections else "(no matching data found in database)"


# ---------------------------------------------------------------------------
# History formatter
# ---------------------------------------------------------------------------

def _format_history(history: list[dict] | None) -> str:
    if not history:
        return "RECENT CONVERSATION: (none — this is the first command)"
    lines = []
    for i, h in enumerate(history[-2:]):
        user_turn = (h.get("transcript") or h.get("command") or "").strip()
        assistant_turn = (h.get("spokenSummary") or h.get("response") or "").strip()
        line = f'{i + 1}. User: "{user_turn}"'
        if assistant_turn:
            line += f'\n   Assistant: "{assistant_turn}"'
        lines.append(line)
    return "RECENT CONVERSATION (oldest first, for resolving references only):\n" + "\n".join(lines)


# ---------------------------------------------------------------------------
# Azure OpenAI LLM helper
# ---------------------------------------------------------------------------

_REASONING_PROMPT = """
You are a reasoning engine for the SEEDS education platform.
Given a user command, think step by step about how to fulfil it using the available API routes.

Your job is to REASON about the command, NOT to produce the final plan.
Think about:
1. What is the user's intent?
2. What data/IDs are needed?
3. What API calls are required, and in what order?
4. Can all required data be fetched automatically via prior API calls?
5. How do results from earlier steps feed into later steps?

CURRENT USER CONTEXT:
- Phone number: {{phoneNumber}}
- Teacher name: {{teacherName}}
- Tenant ID: {{tenantId}}
- User ID: {{userId}}
- Active Conference ID: {{activeConferenceId}}
  ("none" means there is no live conference. Any non-"none" value IS a live call that can be ended/muted.)
- Current class being viewed: {{currentClassId}}
  ("none" means the user is on the main/list screen, not inside a specific class page.)

{{history}}

Use the recent conversation above to resolve references like "it", "that class", "him", "the last one", or to continue answering a question you previously asked. The CURRENT command is the latest user message; history is only for context.

═══ CRITICAL: CONTENT PLAYBACK vs CONFERENCE CALLS ═══
- "play", "show", "find", "get" content → Just fetch it with GET /content/?expName=...
  The FRONTEND handles playback. You only need to return the content data.
  This is ALWAYS a single GET request. canAutoResolve is ALWAYS true.
- "start a call", "start a conference" → Use POST /call/conference/create then POST /call/conference/start/{id}
  This is a 2-step flow: first create the conference, then start it using the returned conference ID.
- "end the call", "end conference" → Use PUT /call/conference/end/{confId}
- "mute all", "unmute all" → Use PUT /call/conference/muteall or /call/conference/unmuteall
Do NOT confuse content playback with conference calls. "Play keats poem" = GET /content/?expName=keats poem. That's it.
═══ END CRITICAL ═══

═══ NAVIGATION (frontend screens) ═══
Pure "take me to / go to / open / go back to / show me the X screen" requests are FRONTEND navigation — no backend data is fetched. These ALWAYS have canAutoResolve=true. Known screens:
- "home", "home screen", "classrooms", "my classes", "go back", "main screen" → the classrooms list (route /classrooms)
- "content", "content library", "songs list", "stories list", "show me content" → fetch the content list: GET /content/ (no filter). The frontend will open the content drawer automatically and you will speak the item names aloud in the summary.
- A specific class by name → that class's detail page (route /classrooms/detail/<classId> using the _id from DB context)
Navigating is a single frontend step; do not plan any API call for it.
═══ END NAVIGATION ═══

AVAILABLE API ROUTES (summary):
- GET /class/ → returns array of classes [{_id, name, teacher, students, leaders, contentIds}]
- GET /class/:classId → single class
- POST /class/ → create/update class. Body: {name, students: [String], leaders: [String], contentIds: [String], _id?}
  If _id is provided, it UPDATES the existing class. If no _id, it CREATES a new class.
  IMPORTANT: students and leaders are arrays of STRINGS (names or phone numbers), NOT arrays of objects!
- DELETE /class/:classId → delete a class

NOTE: Students cannot be created, added, edited, or deleted via voice/text commands.
Only existing students (provided in the DB context below) may be referenced. There is
no endpoint to create a student here — never plan one.

- GET /content/ → query: language, theme, expName, ids, limit, cursor
  "play X" or "find X" → GET /content/?expName=X (frontend handles playback)
- GET /content/:contentId → single content
- GET /content/themes → query: language

- GET /teacher/me → current teacher info

- POST /call/conference/create → body: {teacher_phone, teacher_name, student_phones: [...], student_names: [...], leader_phone: "<phone>" (optional)}
- POST /call/conference/start/:confId → starts a created conference (no body needed)
- PUT /call/conference/end/:confId → ends an active conference
- PUT /call/conference/muteall/:confId → mutes all participants
- PUT /call/conference/unmuteall/:confId → unmutes all participants
- PUT /call/conference/addparticipant/:confId → body: {phone_number, name}
- PUT /call/conference/removeparticipant/:confId → body: {phone_number}
- PUT /call/conference/playaudio/:confId → body: {url}
- PUT /call/conference/pauseaudio/:confId → pause audio playback

- GET /tenant/names → list tenants

{{dbContext}}

RESPOND WITH JSON:
{
  "intent": "what the user wants to achieve",
  "reasoning": "step by step thinking about how to do it",
  "steps": [
    { "description": "what this step does", "resolves": "what data this provides for later steps" }
  ],
  "canAutoResolve": true/false,
  "unresolvedNote": "if canAutoResolve is false, explain what can't be resolved in simple, non-technical terms"
}

IMPORTANT RULES:
1. Only return valid JSON. No markdown.
2. If the user wants to start a conference:
   - If 'Current class being viewed' is a real class id (NOT "none"), use THAT class.
   - If the user explicitly named a class or specific students, use those instead.
   - Only if 'Current class being viewed' is "none" AND no class/students named, set canAutoResolve to false.
3. If the user wants to end a conference but 'Active Conference ID' is 'none', set canAutoResolve to false.
4. Student/leader names may be misspelled. Pick CLOSEST existing student by phonetic/spelling similarity.
5. HELP / CAPABILITIES: If the user asks what you can do, set canAutoResolve to false and set unresolvedNote to this exact list:
   "Here's what I can help you with: show your classrooms; create a new classroom; add an existing student or leader to a class; delete a class; play or find content; show content themes; start, end, mute, or unmute a conference call; add or remove a call participant; show your teacher profile; and list tenant names. Just tell me what you'd like to do."
"""

_PLANNING_PROMPT = """
You are a command planner for the SEEDS education platform backend.
You have already reasoned about the user's command. Now produce the exact API calls.

CURRENT USER CONTEXT:
- Phone number: {{phoneNumber}}
- Teacher name: {{teacherName}}
- Tenant ID: {{tenantId}}
- User ID: {{userId}}
- Active Conference ID: {{activeConferenceId}}
- Current class being viewed: {{currentClassId}}

{{history}}

REASONING FROM PREVIOUS STEP:
{{reasoning}}

{{dbContext}}

OUTPUT FORMAT: respond with a JSON OBJECT containing a "commands" array:
{ "commands": [ {step1}, {step2}, ... ] }

Each element must have:
  - "method": HTTP method (GET, POST, PUT, PATCH, DELETE) or "NAVIGATE"
  - "path": full API path or frontend route for NAVIGATE
  - "body": request body object (null if not needed)
  - "description": short description

CRITICAL RULES:
1. Only return valid JSON. No markdown, no explanation.
2. CHAIN STEPS: {{stepN.data.field}}, {{stepN.data[key=value].field}}, {{stepN.data.field+value}}
3. SCHEMA for /class/ POST: students/leaders are phone number arrays [String].
4. forEach delete: GET /class/ then DELETE /class/{{step1.data[]._id}} with "forEach": true
5. NEVER plan to create, add, edit, or delete a student.
6. For conference calls use a 3-step fetch-create-start flow.
7. CONTENT PLAYBACK: GET /content/?expName=X or GET /content/<real_id> from DB context.
8. If truly unmappable: { "error": "I could not understand that command. Please try again." }
"""

_TTS_SUMMARY_PROMPT = """
You are a friendly voice assistant for the SEEDS education platform.
Given a user's original command and the execution results, generate a SHORT spoken summary
that will be read aloud to the user via text-to-speech.

RULES:
1. Be conversational and natural — as if speaking to a teacher.
2. Keep it to 1-2 sentences maximum.
3. Mention specific names, counts, or key data from the results.
4. If the command failed, briefly explain in simple terms (no "Status 404" or "API error").
5. No markdown, bullet points, or formatting — just plain spoken text.
6. Do NOT say "Here are your results". Be specific.
7. For content playback ("play X"), if SUCCESS, say you are playing it now.
8. NEVER speak raw IDs, ObjectIds, or hex/UUID-like strings. Use human names only.
9. Describe ONLY actions that appear as SUCCESS steps. Do not invent steps.
10. CONTENT LIBRARY: If a step fetched GET /content/ with no filter, the content drawer is open. Name up to 5 items and invite the user to choose.

RESPOND WITH JSON:
{ "spokenText": "your spoken summary here" }

IMPORTANT: Only return valid JSON. No markdown.
"""


async def _call_llm(system_prompt: str, user_message: str) -> dict[str, Any]:
    """Call Azure OpenAI with json_object response format. Retries once on 429."""
    settings = get_settings()
    if not settings.azure_openai_key or not settings.azure_openai_endpoint:
        raise RuntimeError("Azure OpenAI not configured (AZURE_OPENAI_KEY / AZURE_OPENAI_ENDPOINT missing)")
    if not settings.azure_openai_model:
        raise RuntimeError("Azure OpenAI model not configured (AZURE_OPENAI_MODEL missing)")

    from openai import AsyncAzureOpenAI  # noqa: PLC0415

    endpoint = settings.azure_openai_endpoint.rstrip("/").removesuffix("/openai/v1")
    client = AsyncAzureOpenAI(
        api_key=settings.azure_openai_key,
        azure_endpoint=endpoint,
        api_version=settings.azure_openai_api_version,
    )

    import json  # noqa: PLC0415

    try:
        resp = await client.chat.completions.create(
            model=settings.azure_openai_model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_message},
            ],
            temperature=0,
            response_format={"type": "json_object"},
        )
        return json.loads(resp.choices[0].message.content)
    except Exception as exc:  # noqa: BLE001
        # Retry once on rate-limit
        if hasattr(exc, "status_code") and exc.status_code == 429:  # type: ignore[union-attr]
            retry_after = int(getattr(exc, "retry_after", None) or 5)
            logger.info("meta_service: rate limited, retrying in %ds", retry_after)
            await asyncio.sleep(retry_after)
            resp = await client.chat.completions.create(
                model=settings.azure_openai_model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_message},
                ],
                temperature=0,
                response_format={"type": "json_object"},
            )
            return json.loads(resp.choices[0].message.content)
        raise


def _build_prompt(template: str, user_info: dict[str, Any], extras: dict[str, Any] | None = None) -> str:
    import json  # noqa: PLC0415
    prompt = (
        template
        .replace("{{phoneNumber}}", str(user_info.get("phone_number") or "unknown"))
        .replace("{{teacherName}}", str(user_info.get("name") or "Teacher"))
        .replace("{{tenantId}}", str(user_info.get("tenant_id") or "unknown"))
        .replace("{{userId}}", str(user_info.get("user_id") or "unknown"))
        .replace("{{activeConferenceId}}", str(user_info.get("active_conference_id") or "none"))
        .replace("{{currentClassId}}", str(user_info.get("current_class_id") or "none"))
    )
    for key, value in (extras or {}).items():
        prompt = prompt.replace(f"{{{{{key}}}}}", value if isinstance(value, str) else json.dumps(value, indent=2))
    return prompt


# ---------------------------------------------------------------------------
# Phase 1: Reason
# ---------------------------------------------------------------------------

async def reason_about_command(
    transcript: str,
    user_info: dict[str, Any],
    db: AsyncIOMotorDatabase,  # type: ignore[type-arg]
) -> dict[str, Any]:
    db_results = await fetch_context_from_db(
        transcript,
        user_id=user_info.get("user_id", ""),
        school_id=user_info.get("school_id", ""),
        db=db,
    )
    db_context = _format_db_context(db_results)
    history = _format_history(user_info.get("history"))
    system_prompt = _build_prompt(_REASONING_PROMPT, user_info, {"dbContext": db_context, "history": history})
    return await _call_llm(system_prompt, f'User command: "{transcript}"')


# ---------------------------------------------------------------------------
# Phase 2: Plan
# ---------------------------------------------------------------------------

async def plan_commands(
    transcript: str,
    user_info: dict[str, Any],
    reasoning: dict[str, Any],
    db: AsyncIOMotorDatabase,  # type: ignore[type-arg]
) -> dict[str, Any]:
    import json  # noqa: PLC0415
    db_results = await fetch_context_from_db(
        transcript,
        user_id=user_info.get("user_id", ""),
        school_id=user_info.get("school_id", ""),
        db=db,
    )
    db_context = _format_db_context(db_results)
    extras = {
        "reasoning": json.dumps(reasoning, indent=2),
        "dbContext": db_context,
        "history": _format_history(user_info.get("history")),
    }
    system_prompt = _build_prompt(_PLANNING_PROMPT, user_info, extras)
    return await _call_llm(system_prompt, f'User command: "{transcript}"')


def normalize_plan(plan: dict[str, Any]) -> dict[str, Any]:
    if plan.get("error"):
        return {"error": plan["error"]}
    commands = plan.get("commands") or plan.get("steps") or [plan]
    if not isinstance(commands, list):
        commands = [commands]
    needs_input = any(c.get("needsInput") for c in commands)
    return {"commands": commands, "needsInput": needs_input}


# ---------------------------------------------------------------------------
# Phase 3: Execute
# ---------------------------------------------------------------------------

def _resolve_placeholders(target: Any, context: dict[str, Any]) -> Any:
    import json  # noqa: PLC0415
    if target is None:
        return target

    if isinstance(target, str):
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
                return m.group(0)
            return str(found.get(m.group(4), m.group(0)))

        target = re.sub(r"\{\{step(\d+)\.data\[(\w+)=([^\]]+)\]\.(\w+)\}\}", _search_replace, target)

        # Full data: {{stepN.data}}
        def _full_replace(m: re.Match) -> str:  # type: ignore[type-arg]
            step_data = context.get(f"step{m.group(1)}", {}).get("data")
            return json.dumps(step_data) if step_data is not None else m.group(0)

        target = re.sub(r"\{\{step(\d+)\.data\}\}", _full_replace, target)
        return target

    if isinstance(target, list):
        return [_resolve_placeholders(item, context) for item in target]

    if isinstance(target, dict):
        import json  # noqa: PLC0415
        resolved: dict[str, Any] = {}
        for k, v in target.items():
            val = _resolve_placeholders(v, context)
            # String that looks like JSON array → parse it back
            if isinstance(val, str) and val.startswith("[") and val.endswith("]"):
                try:
                    val = json.loads(val)
                except (ValueError, TypeError):
                    pass
            resolved[k] = val
        return resolved

    return target


async def _execute_single(
    method: str,
    url: str,
    body: Any,
    token: str,
    description: str,
) -> dict[str, Any]:
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    try:
        async with aiohttp.ClientSession() as session:
            async with session.request(
                method.lower(),
                url,
                json=body or None,
                headers=headers,
                timeout=aiohttp.ClientTimeout(total=15),
            ) as resp:
                try:
                    data = await resp.json(content_type=None)
                except Exception:  # noqa: BLE001
                    data = await resp.text()
                return {"step": description, "status": resp.status, "data": data}
    except Exception as exc:  # noqa: BLE001
        return {"step": description, "status": 500, "error": str(exc)}


async def execute_commands(
    commands: list[dict[str, Any]],
    auth_token: str,
    base_url: str,
) -> list[dict[str, Any]]:
    results: list[dict[str, Any]] = []
    context: dict[str, Any] = {}

    for i, cmd in enumerate(commands):
        description = cmd.get("description", f"step {i + 1}")
        resolved_path = _resolve_placeholders(cmd.get("path", ""), context)
        resolved_body = _resolve_placeholders(cmd.get("body"), context)

        # forEach — iterate over array from a prior step
        if cmd.get("forEach"):
            m = re.search(r"\{\{step(\d+)\.data\[\]\.(\w+)\}\}", cmd.get("path", ""))
            if not m:
                r = {"step": description, "status": 400, "error": "Could not determine forEach source"}
                results.append(r)
                context[f"step{i + 1}"] = {"data": None, "status": 400}
                continue
            source_step, field = m.group(1), m.group(2)
            source_data = context.get(f"step{source_step}", {}).get("data")
            if not isinstance(source_data, list):
                r = {"step": description, "status": 400, "error": "forEach source is not an array"}
                results.append(r)
                context[f"step{i + 1}"] = {"data": None, "status": 400}
                continue
            foreach_results: list[dict[str, Any]] = []
            for item in source_data:
                item_val = item.get(field)
                if not item_val:
                    continue
                item_path = re.sub(r"\{\{step\d+\.data\[\]\.\w+\}\}", str(item_val), cmd["path"])
                r = await _execute_single(
                    cmd["method"],
                    f"{base_url}{item_path}",
                    resolved_body,
                    auth_token,
                    f"{description} ({item.get('name', item_val)})",
                )
                foreach_results.append(r)
            results.extend(foreach_results)
            context[f"step{i + 1}"] = {"data": [r.get("data") for r in foreach_results], "status": 200}
            continue

        # NAVIGATE — frontend-only pseudo-command
        if cmd.get("method", "").upper() == "NAVIGATE":
            r = {"step": description, "status": 200, "data": {"navigate": resolved_path}}
            results.append(r)
            context[f"step{i + 1}"] = r
            continue

        r = await _execute_single(
            cmd["method"],
            f"{base_url}{resolved_path}",
            resolved_body,
            auth_token,
            description,
        )
        results.append(r)
        context[f"step{i + 1}"] = r

    return results


# ---------------------------------------------------------------------------
# Phase 4: Spoken summary + TTS
# ---------------------------------------------------------------------------

async def generate_spoken_summary(transcript: str, results: list[dict[str, Any]]) -> dict[str, Any]:
    import json  # noqa: PLC0415
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
    return await _call_llm(_TTS_SUMMARY_PROMPT, user_message)


def _escape_xml(text: str) -> str:
    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("'", "&apos;").replace('"', "&quot;")


async def synthesize_speech(text: str) -> str | None:
    """Return base64-encoded MP3 audio or None on failure."""
    settings = get_settings()
    speech_key = settings.azure_speech_key or settings.tts_subscription_key
    speech_region = settings.azure_speech_region or settings.tts_region
    voice = settings.seeds_tts_voice or "en-US-AvaNeural"

    if not speech_key or not speech_region:
        logger.warning("meta_service: Azure Speech not configured, skipping TTS")
        return None

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
    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(url, data=ssml.encode(), headers=headers, timeout=aiohttp.ClientTimeout(total=30)) as resp:
                if resp.status != 200:
                    err = await resp.text()
                    logger.error("meta_service: TTS error %d: %s", resp.status, err[:200])
                    return None
                audio_bytes = await resp.read()
        import base64  # noqa: PLC0415
        return base64.b64encode(audio_bytes).decode()
    except Exception as exc:  # noqa: BLE001
        logger.error("meta_service: TTS exception: %s", exc)
        return None


# ---------------------------------------------------------------------------
# STT — Azure Speech REST (WebM → WAV 16kHz via ffmpeg subprocess)
# ---------------------------------------------------------------------------

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

    # Decode to raw 16 kHz mono PCM via ffmpeg
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
        import os  # noqa: PLC0415
        try:
            os.unlink(tmp_in_path)
        except OSError:
            pass

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


# ---------------------------------------------------------------------------
# Static TTS prompts (Seeds persona)
# ---------------------------------------------------------------------------

_SEEDS_PROMPTS: dict[str, str] = {
    "welcome": "Hey there! I'm Seeds, your AI teaching assistant. Hold Space to talk to me, or type a command. I'm here to help!",
    "thinking": "Let me think about that for a moment.",
}

# ponytail: module-level dict cache; good enough for static prompts
_tts_cache: dict[str, str] = {}


async def get_tts_prompt(prompt_type: str) -> dict[str, Any] | None:
    text = _SEEDS_PROMPTS.get(prompt_type)
    if text is None:
        return None
    if prompt_type not in _tts_cache:
        audio = await synthesize_speech(text)
        if audio:
            _tts_cache[prompt_type] = audio
    return {"text": text, "audioBase64": _tts_cache.get(prompt_type)}
