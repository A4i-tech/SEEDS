# Platform Service — Code Review Findings

Tracked findings from a4i-architect review of PR #231 (`feat/platform-service`).
Each entry records: what the code does, what's wrong, fix applied or pending, and rationale.

---

## F1 — ContentJobConsumer: BlobStorageProvider init failure silently claims jobs

**File:** `platform/app/consumers/content_job_consumer.py` — `_run_loop`  
**Status:** FIXED

**What the code did:**  
`BlobStorageProvider()` was called once before the poll loop. On failure, `blob_provider = None`. The loop then claimed jobs from MongoDB and passed `None` into `_process_audio_content_job`, causing `AttributeError` on first blob access. Job dead-lettered with confusing message. No recovery if storage came back.

**Fix applied:**  
Moved init inside the loop. Each iteration re-attempts init when `blob_provider is None`. On failure: log with explicit "no jobs will be claimed" message, sleep `POLL_INTERVAL_SECONDS`, `continue` (no job claimed). Recovers automatically when blob storage becomes available.

**Rationale:**  
Don't claim work you can't process. Recovery should be automatic, not manual.

---

## F2 — AudioAnalysisConsumer: pipeline init failure raises PermanentError

**File:** `platform/app/consumers/audio_analysis_consumer.py` — `_ensure_pipeline`  
**Status:** NO FIX — finding invalid

**What the reviewer said:**  
Raise `PermanentError` after init failure so caller dead-letters the message.

**Why the fix is wrong:**  
Hold detection and transcription are optional enhancements. Conference proceeds without them. Raising `PermanentError` permanently dead-letters the audio message, losing conference analysis entirely — worse than degrading gracefully. The current behavior (log once at init, skip per-message) is correct.

**Residual improvement (not applied):**  
Warning fires on every frame after failed init (log spam). Acceptable given low volume.

---

## F3 — AudioRecordingConsumer: session init failure retried on every audio frame

**File:** `platform/app/consumers/audio_recording_consumer.py` — `_get_or_create_session`  
**Status:** FIXED

**What the code did:**  
On `AudioCaptureService` init failure: logged error, returned `None`. Frame silently dropped. Next frame retried init again → repeated failures logged on every chunk (potentially thousands per conference).

**Fix applied:**  
Added `_failed_sessions: set[str]`. On init failure: log once with full `exc_info=True` traceback, add `conference_id` to `_failed_sessions`. Subsequent frames for same conference short-circuit immediately (no retry, no log spam). `_handle_finalize` calls `discard()` on finalize so a new conference reusing the same ID gets a fresh attempt.

**Rationale:**  
`PermanentError` (reviewer's suggestion) doesn't apply — in-process asyncio queue has no DLQ. Correct fix is track-and-suppress. Failure visible once in logs with full context.

---

## F4 — callsLog: ObjectId stringified before SB payload, string used in DB query

**File (Platform):** `platform/app/controllers/webhook_controller.py:253` (INSERT),  
`platform/app/consumers/call_webhook_consumer.py:96` (UPDATE)  
**File (IVRv2):** `IVRv2/app/main.py:307` (INSERT), `IVRv2/app/workers/call_processor.py:86` (UPDATE)  
**Status:** PENDING FIX — present on `a4i/main` too (GitHub issue raised separately)

**What the code does:**  
INSERT writes `{"timestamp": datetime.now(), ...}` → MongoDB auto-generates `ObjectId` for `_id`.  
`call_log_id = str(inserted_id)` → string form pushed into Service Bus payload.  
UPDATE queries `{"_id": call_log_id}` with the string → no match (BSON `ObjectId` ≠ Python `str`).  

Platform: `update_one` silently matches 0 documents. `status` stays `"pending"` forever.  
IVRv2: `update_document` uses `replace_one(..., upsert=True)` → creates a **ghost document** with string `_id` instead of updating the original.

**Secondary bugs (same files):**  
- Field name `timestamp` inconsistent with platform standard (`created_at`)  
- `datetime.now()` is timezone-naive; should be `datetime.now(timezone.utc)`

**DB verification:**
```js
// Expect all stuck at "pending" if bug is active
db.callsLog.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }])
// IVRv2 ghost docs — string _id from upsert
db.callsLog.find({ _id: { $type: "string" } }).count()
```

**Fix (Platform):**
```python
# webhook_controller.py — rename field, fix timezone
{"phone_number": phone_number, "created_at": datetime.now(timezone.utc), "status": "pending"}

# call_webhook_consumer.py — convert back to ObjectId for query, fix timezone
from bson import ObjectId
{"_id": ObjectId(call_log_id)},
{"$set": {"status": "called", "called_at": datetime.now(timezone.utc)}}
```

**Fix (IVRv2):** Same ObjectId conversion in `call_processor.py`; fix `update_document` to accept both str and ObjectId, or convert at call site.

---

## F5 — CallEventConsumer: no SDK-level timeout on Service Bus receiver

**File:** `platform/app/providers/service_bus.py` — `_AzureQueueHandle.initialize` and `receive`  
**Also affects:** `call_event_consumer.py`, `call_webhook_consumer.py` (same receive path)  
**Status:** PENDING FIX — LOW priority (reviewer rated MEDIUM; disagree)

**What the code does:**  
`receive_messages(max_message_count=max_count, max_wait_time=wait_seconds)` passes a per-call `max_wait_time=5` to the Azure SB SDK. This works but the timeout is scattered across every call site.

Azure SB SDK's `get_queue_receiver` accepts `max_wait_time` at the receiver level — SDK docs: *"If no messages arrive, and no timeout is specified, this call will not return until the connection is closed."* Setting it on the receiver makes it the default for all `receive_messages` calls without per-call passing.

**Why reviewer severity is overstated:**  
The per-call `max_wait_time=5` already exists — the SDK IS bounded. Risk of indefinite hang requires the SDK to ignore its own timeout (pathological network partition). Practical risk low on Azure-to-Azure connectivity.

**Preferred fix — move timeout to SDK receiver level:**
```python
# _AzureQueueHandle.initialize in service_bus.py
self._receiver = self._client.get_queue_receiver(
    queue_name=self.queue_name,
    max_wait_time=30,  # SDK-level default for all receive_messages calls
)
```
Then remove `max_wait_time=wait_seconds` from the `receive_messages` call in `receive()`. Consolidates config in one place, same protection.

**`asyncio.wait_for` wrapper not recommended** — redundant given SDK timeout; adds complexity for negligible gain at this risk level.

---

## F6 — ContentJobConsumer: ffprobe error handling allegedly missing

**File:** `platform/app/consumers/content_job_consumer.py` — `_extract_duration`  
**Status:** INVALID — finding is stale, code already correct

**What the reviewer said:**  
"If ffprobe returns non-numeric output, exception is swallowed but job continues. Fix: set duration to None explicitly and log a WARN with context."

**What the code actually does:**  
```python
# _extract_duration lines 286-289
try:
    return float(output)
except (ValueError, TypeError):
    return None   # explicit None on non-numeric output — already there
```

Caller at lines 244–248:
```python
duration: Optional[float] = None   # default already None
try:
    duration = await _extract_duration(output_path)
except Exception as exc:
    logger.warning("content_job: duration extraction failed — %s", exc)
```

Both requested fixes exist: `None` on parse failure, `logger.warning` with context on exception. The comment `# Extract duration (best-effort)` at line 244 documents the intentional design.

**Rationale for no fix:** Duration is explicitly best-effort. Job completing without duration is correct behavior. Finding was either raised against an older version of the code or misread the try/except structure.

---

## F7 — content_controller: role checks use magic strings

**File:** `platform/app/controllers/content_controller.py:39–40`  
**Status:** LOW PRIORITY — not a current bug

**What the code does:**  
`_WRITE_ROLES = {"tenant", "school_admin", "content_creator"}` — string literals.  
JWT payload stores role as `.value` string, so comparison is correct today.

**Risk:** If `UserRole` enum values are renamed, controller silently breaks.  
**Pending fix:** Replace with `{UserRole.TENANT.value, UserRole.SCHOOL_ADMIN.value, ...}`.

---

## F7 — participants_controller: no tenant scoping on conference mutations

**File:** `platform/app/controllers/participants_controller.py`,  
`platform/app/platform/auth/dependencies.py:135–156`  
**Status:** PENDING FIX

**What the code does:**  
`require_conference_owner` checks `conference.created_by == user.sub` only. No `tenant_id` match.

**Risk:** Authenticated user from tenant B who knows a conference UUID from tenant A can add/mute/remove participants in that conference. Practical exploitability is low (UUIDs not guessable, requires knowing another tenant's conference ID), but the authorization boundary is wrong.

**Fix:** Add `str(conference.get("tenant_id", "")) == user.get("tenant_id", "")` check in `require_conference_owner`.

---

## F8 — playback_controller: no URL validation on audio_url

**File:** `platform/app/controllers/playback_controller.py:39`  
**Status:** PENDING FIX

**What the code does:**  
`url: str = Query(...)` passed directly to `PlayContentEvent` → Vonage NCCO. Vonage fetches the URL. No scheme or domain validation.

**Risk:** User can supply any URL; Vonage fetches it. Not server-side SSRF but could abuse Vonage's infra to fetch arbitrary endpoints.

**Fix:** Validate `url.startswith("https://")` and domain is in the allowed blob storage host list before queuing the event.

---

## F9 — webhook_controller: Vonage signature bypass in development has no host restriction

**File:** `platform/app/controllers/webhook_controller.py:59`  
**Status:** PENDING FIX

**What the code does:**
```python
if settings.env == "development": return
```
No `request.client.host` check. Any external caller reaches internal webhook handlers in dev/staging deployments.

**Fix:**
```python
if settings.env == "development" and request.client.host in {"127.0.0.1", "::1"}:
    return
```

---

## F10 — websocket_controller: timing-unsafe secret comparison

**File:** `platform/app/controllers/websocket_controller.py:68–69`  
**Status:** PENDING FIX

**What the code does:**  
`return provided == expected` — direct string compare on `WS-Control-Secret`.

**Fix:** `return hmac.compare_digest(provided, expected)`

---

## F11 — vonage_api: PEM temp file written without secure permissions, never deleted

**File:** `platform/app/providers/vonage_api.py:82–91`  
**Status:** PENDING FIX

**What the code does:**  
`tempfile.mkstemp` creates file with default permissions (0o600 on most Linux; 0o644 on some). No explicit `chmod`. No `os.unlink` on cleanup. Private key sits readable in `/tmp` for process lifetime.

**Fix:**
```python
fd, path = tempfile.mkstemp(suffix=".pem", prefix="vonage_pk_")
try:
    os.chmod(path, 0o600)
    os.write(fd, pem_bytes)
finally:
    os.close(fd)
self._pem_tmp_path = path
```
Add `__del__` or explicit `cleanup()` that calls `os.unlink(self._pem_tmp_path)`.

---

## F12 — auth_controller: tenant_analytics queries datetime with ISO strings

**File:** `platform/app/controllers/auth_controller.py:311–315`  
**Status:** PENDING FIX

**What the code does:**
```python
"created_at": {"$gte": start.isoformat(), "$lte": end.isoformat()}
```
`start.isoformat()` returns a Python `str`. MongoDB stores datetimes as BSON `Date` (datetime objects). String ≠ Date in MongoDB comparisons → query always returns 0 results silently.

**Fix:** Remove `.isoformat()` — pass datetime objects directly.

---

## F13 — websocket_controller: no timeout on DB query during WS handshake

**File:** `platform/app/controllers/websocket_controller.py:72–90`  
**Status:** LOW PRIORITY

`_check_conference_exists` is async but has no `asyncio.wait_for` around the DB lookup. MongoDB hang stalls the WS handshake indefinitely.

**Pending fix:** `await asyncio.wait_for(_check_conference_exists(conference_id), timeout=0.5)`

---

## F14 — school_admin_login: schoolName always empty

**File:** `platform/app/controllers/auth_controller.py:411`  
**Status:** PENDING — needs client audit

`result["schoolName"] = ""` — backward-compat field never populated.

**Parity:** Legacy `schoolAdminAuthProviderMiddleware.js` login returns `name: school.name` (the school entity's own name field). The `schoolName` resolution pattern (query school service by `schoolId`) exists in teacher `getMe` (teacher.controller.js:15–16), not in school admin login. Platform may be porting the wrong contract. Need to confirm which client reads `schoolName` from school admin login before deciding to populate or drop.

---

## F15 — VAD calibration hardcoded defaults

**File:** `platform/app/services/audio/transcriber.py`, `platform/app/platform/settings.py:144–157`  
**Status:** INVALID — finding does not apply

**Parity:** ConferenceV2 `transcriber.py:25` has identical `SILENCE_THRESHOLD = 300` class constant. All VAD params (`aggressiveness`, `frame_ms`, `min_speech_ms`, `silence_flush_ms`, `max_segment_sec`, etc.) are env-configurable in both. Full parity with legacy. The class constants are RMS energy fallback thresholds used only when WebRTC VAD is unavailable — not calibration defaults.

**Rationale for no fix:** Values are already configurable via `AUDIO_VAD_*` env vars. Any operational tuning is a deployment concern, not a code change.

---
