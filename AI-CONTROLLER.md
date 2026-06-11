# SEEDS AI Controller System

> Natural language → API calls → Automated results → Audio feedback  
> A 4-phase LLM pipeline that lets teachers control the platform via voice or text.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        FRONTEND                                 │
│  VoiceCommandButton.jsx                                         │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  🎤 Voice Input ──► Azure STT ──► transcript             │   │
│  │     (WebM ──ffmpeg──► WAV 16k ──► Azure Speech REST)      │   │
│  │  ⌨️  Text Input ──────────────────► transcript           │   │
│  └──────────────┬───────────────────────────────────────────┘   │
│                 │ POST /meta/text-command  { command, context }  │
│                 │ POST /meta/voice-command { audio, context }    │
│                 │   context: { activeConferenceId, history[2] }  │
│                 ▼                                                │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  voiceCommandService.js                                   │   │
│  │  • sendVoiceCommand() / sendTextCommand()                 │   │
│  │  • executeClientCommands()  ← Conference delegation ✨    │   │
│  │    Runs /call/conference/* directly against ConferenceV2  │   │
│  │    after receiving backend plan (backend can't reach it)  │   │
│  └──────────────┬───────────────────────────────────────────┘   │
│                 │                          │                     │
│  (backend cmds) │           (conf cmds)    │                     │
│                 ▼                          ▼                     │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  commandResultFormatter.js                                │   │
│  │  • formatResult() → display-friendly cards                │   │
│  │  • getNavigationTarget() → auto-navigate to pages        │   │
│  └──────────────────────────────────────────────────────────┘   │
└──────────────────────────┬──────────────────────────────────────┘
                           │  HTTP
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                        BACKEND                                   │
│  metaCaller.js  (routes — auth enforced per-route inline)        │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  POST /meta/voice-command  [authenticateToken]           │   │
│  │  POST /meta/text-command   [authenticateToken]           │   │
│  │  POST /meta/transcribe     [authenticateToken]           │   │
│  │  POST /meta/tts-prompt     [PUBLIC — needed pre-login]   │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  meta.controller.js (orchestrator)                               │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  getUserInfo(req, context) → { phoneNumber, tenantId,    │   │
│  │    userId, schoolId, name, activeConferenceId, history }  │   │
│  │    ← JWT fields + frontend context merged                 │   │
│  │  buildTranscriptionHint() → class+student names for STT  │   │
│  │  Phase 1: REASON  ─► LLM reasons about intent + steps    │   │
│  │    ↳ if canAutoResolve===false → skip to TTS directly    │   │
│  │  Phase 2: PLAN    ─► LLM generates executable API calls  │   │
│  │  Phase 3: EXECUTE ─► Sequential internal API calls       │   │
│  │    ↳ /call/conference/* → flagged PENDING_CLIENT         │   │
│  │  Phase 4: SPEAK   ─► LLM summary → Azure TTS → audio    │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  meta.service.js (engine)                                        │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  • fetchContextFromDB()       → MongoDB pre-fetch        │   │
│  │    - contentsV3 (regex search)                            │   │
│  │    - classes (teacher's classes, populated students)      │   │
│  │    - students (Student model, filter by schoolId)  ✨     │   │
│  │  • reasonAboutCommand()       → Groq LLM reasoning       │   │
│  │  • planCommands()             → Groq LLM planning        │   │
│  │    (LLM stays on Groq Llama; only STT+TTS moved to Azure)│   │
│  │  • normalizePlan()            → Validate + resolve vars  │   │
│  │  • executeCommands()          → axios calls against self  │   │
│  │    ↳ /call/conference/* → returns requiresClientExecution│   │
│  │  • transcribeAudio()          → ffmpeg→WAV → Azure STT   │   │
│  │  • formatHistory()            → last 2 turns → prompt ✨ │   │
│  │  • generateSpokenSummary()    → LLM spoken text (no IDs) │   │
│  │  • synthesizeSpeech()         → Azure TTS (SSML→MP3 b64) │   │
│  └──────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────┘
                           │  HTTP (from browser only)
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                   CONFERENCEV2 (Python FastAPI)                 │
│  https://conferencev2.onrender.com                              │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  POST /conference/create     → Create conference         │   │
│  │  POST /conference/start/:id  → Start (initiates calls)   │   │
│  │  PUT  /conference/end/:id    → End conference            │   │
│  │  PUT  /conference/muteall/:id → Mute all participants    │   │
│  │  PUT  /conference/playaudio/:id → Stream audio to call   │   │
│  │  GET  /conference/teacherappconnect/:id → SSE updates    │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Backend: 4-Phase Pipeline

### Phase 1: Reasoning (`reasonAboutCommand`)

The system first **reasons** about the user's command before generating any API calls.

**What happens:**
1. Keywords are extracted from the command (stop words filtered out)
2. **MongoDB is queried in parallel:**
   - `contentsV3` collection — searches `title.english`, `title.local`, `type`, `theme.english` using regex
   - `classes` collection — fetches teacher's classes, with **populated student/leader details** (name + phoneNumber)
   - `students` collection — fetches students filtered by `schoolId` (from JWT) ✨
3. Real DB results are injected into the LLM prompt as context
4. The LLM outputs structured reasoning:
   ```json
   { "intent": "...", "reasoning": "...", "steps": [...], "canAutoResolve": true/false, "unresolvedNote": "..." }
   ```

**⚡ canAutoResolve short-circuit:**  
If the LLM returns `canAutoResolve: false` (e.g. the user asked a conversational/explanatory question, or more info is needed), **Phases 2 & 3 are skipped entirely**. The pipeline jumps directly to Phase 4 to generate a spoken explanation from the reasoning itself. This prevents unnecessary LLM planning calls that could time out or hit token limits.

**Example context injected into the prompt:**
```text
═══ MATCHING CONTENT FROM DATABASE ═══
  - _id: "a2989a4b-...\" | title: "Keats Poem" | type: poem | lang: en | theme: Poetry

═══ TEACHER'S CLASSES FROM DATABASE ═══
Each class includes populated student/leader details (name + phone) for conference calls.
  - _id: "69cbac77..." | name: "Grade 7" | students: [{"name":"Ananya","phone":"9112233445"}] | leaders: []

═══ TEACHER'S EXISTING STUDENTS ═══
When adding a student or leader to a class, use ONLY these mapped PHONE NUMBERS.
Names come from speech transcription — match the CLOSEST student phonetically:
  - name: "Ananya" | phone: "9112233445"
```

**Key reasoning rules:**
- `"play X"` → content playback (GET request), NOT a conference call
- `"start call for X"` → conference call (create → start)
    - Triggers UI auto-navigation to `ClassroomDetail.js` to mount the live connection (SSE).
- `"end the call"` → PUT /call/conference/end
    - Resolves natively because `activeConferenceId` is injected into the context by the frontend hook `useConference()`.
- `"mute all"` / `"unmute all"` → PUT /call/conference/muteall or /unmuteall
- `"how do I..."` / `"explain..."` → conversational → `canAutoResolve: false`
- **Fuzzy student matching** ✨ — transcribed names may be accent-/spelling-mangled (e.g. `"Phonet" → "Punit"`). The reasoner picks the closest existing student by phonetic similarity; refuses only when no student is a reasonable match. It NEVER creates a new student (see [Student Management](#student-management)).
- **Help / capabilities** ✨ — `"what can you do?"`, `"help"`, `"navigation options"` → `canAutoResolve: false` with `unresolvedNote` set to a fixed capability list (no route exists to fetch this). Phase 4 reads it aloud.
- **Conversation memory** ✨ — the last 2 turns are injected so references like `"add Punit to it"`, `"the last class"`, or answers to a previously-asked clarifying question resolve correctly. See [Conversation Memory](#conversation-memory).

### Phase 2: Planning (`planCommands`)

> **Only reached if `canAutoResolve: true`**

The reasoning output feeds into the **planning** phase, which generates concrete API calls.

**What happens:**
1. The reasoning JSON + DB context + `activeConferenceId` are sent to a second LLM call
2. The planner knows all available API routes
3. It outputs a JSON array of executable steps:
   ```json
   [
     { "method": "GET",  "path": "/class/69955a49...", "body": null },
     { "method": "POST", "path": "/call/conference/create", "body": { "teacher_phone": "...", "student_phones": [...] } },
     { "method": "POST", "path": "/call/conference/start/{{step2.data.id}}", "body": null }
   ]
   ```

> ⚠️ **Conference calls enforce a 3-step fetch→create→start flow.** Step 1 (GET /class/:id) is mandatory so the frontend can auto-navigate to the classroom page.

**Advanced features:**
- **Variable chaining:** Step N references results from Step M via `{{stepM.data.field}}`
- **forEach loops:** `"forEach": true` on a step iterates over array results
- **Real IDs from DB:** Planner uses real content `_id` values from the context directly
- **Phone-to-ObjectId resolution:** `POST /class/` accepts student phone numbers — the class router resolves them to Student `_id`s server-side ✨
- **SCHEMA RULES for `/class/` POST:**
  - `students: [String]` — phone numbers (resolved to ObjectIds by `classRouter.js`)
  - `leaders: [String]` — phone numbers (resolved to ObjectIds by `classRouter.js`)
  - `contentIds: [String]` — content ID strings

### Phase 3: Execution (`executeCommands`)

The planned commands are executed **sequentially**.

**What happens:**
1. Each command's path and body are resolved (replacing `{{stepN.data.*}}` vars)
2. All commands (including `/call/conference/` paths) are executed via axios with the user's JWT forwarded to the backend's self REST paths.
3. The backend proxy (`callRouter.js`) properly formats phones and calls the ConferenceV2 API.
4. Results collected: `{ step, status, data, error }`

**Example execution flow for "Start a call for Grade 7":**
```text
[Backend]
Step 1: POST /call/conference/create → 200 → { id: "conf_abc123" }
Step 2: resolves {{step1.data.id}} → "conf_abc123"
        POST /call/conference/start/conf_abc123 → 200
```

### Phase 4: TTS Audio Response (`generateSpokenSummary` + `synthesizeSpeech`)

After execution (or directly after Phase 1 if `canAutoResolve: false`), the system generates an audio response.

**What happens:**
1. Execution results are summarized into context
2. A 3rd LLM call produces a short conversational spoken summary (1-2 sentences)
3. Wrapped in SSML and sent to **Azure TTS** (`synthesizeSpeech`) → MP3 audio (`audio-24khz-48kbitrate-mono-mp3`) → base64
4. Both `spokenSummary` and `audioBase64` are included in the API response
5. Phase 4 is **non-blocking** — failure does not break execution results

> 🔇 **No raw IDs in speech.** The TTS prompt forbids reading out ObjectIds / hex / UUID-like strings (e.g. "…with ID 6a2a5f7b…"). Things are referred to by human name only. Note: the LLM still *sees* `_id`s in the results context — this is a prompt-level guard, not a hard strip.

---

## Speech-to-Text (Azure)

STT runs on **Azure Speech Services** (REST short-audio endpoint).

**Pipeline:** the browser records `audio/webm` (Opus). Azure short-audio REST accepts only WAV-PCM or OGG-Opus, so `transcribeAudio()` decodes the buffer to raw 16 kHz mono PCM via bundled **ffmpeg** (`ffmpeg-static` + `fluent-ffmpeg`), wraps it in a 44-byte WAV header, then POSTs to:

```
https://<TTS_REGION>.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=en-US
  header: Ocp-Apim-Subscription-Key: <TTS_SUBSCRIPTION_KEY>
  header: Content-Type: audio/wav; codecs=audio/pcm; samplerate=16000
→ { RecognitionStatus, DisplayText, ... }
```

- `transcribeAudio(buffer, mimetype, promptHint)` — `promptHint` is accepted for signature compat but **ignored**: Azure short-audio REST has no prompt/phrase-bias parameter.
- ⚠️ **Biasing regression vs Whisper:** the old Groq-Whisper path biased recognition with a SEEDS glossary + class/student names. Azure REST can't consume that hint. Proper-noun disambiguation is now handled entirely **downstream** by the reasoning LLM's phonetic fuzzy-match rule (see [Fuzzy student matching](#)). The `buildTranscriptionHint()` DB round-trips were removed from the controller (latency win). To restore STT-level biasing, switch to the Azure Speech SDK with `PhraseListGrammar`.

---

## Conversation Memory ✨

The pipeline is otherwise **stateless** — each `callLLM()` sends only `[system, user]`, no prior turns. To resolve references (`"it"`, `"that class"`, `"him"`, `"the last one"`) and continue clarification loops, the **last 2 turns** are passed back to the reasoner and planner.

**Flow:**
1. **Frontend** (`VoiceCommandButton.jsx`) — `historyRef` keeps the last 2 successful turns `{ transcript, spokenSummary }` (`.slice(-2)`); recorded via `recordTurn()` after each success, cleared on dialog reset. Sent as `context.history`.
2. **Service forwarding** — `context` (incl. `history`) is serialized into the request body; `getUserInfo()` merges it into `userInfo.history`.
3. **Backend** — `formatHistory(userInfo.history)` renders a `RECENT CONVERSATION` block injected via `{{history}}` into both `REASONING_PROMPT` and `PLANNING_PROMPT`. The current transcript is always the latest message; history is for context only.

> Double-capped at 2 (frontend + `formatHistory` both `.slice(-2)`) defensively. History is scoped to one dialog session and reset when the assistant is closed.

---

## Authentication

Auth is now enforced **inline per-route** inside `metaCaller.js` (not pre-mounted in `index.js`). This makes it rebase-safe.

| Route | Auth |
|---|---|
| `POST /meta/voice-command` | `authenticateToken` ✅ |
| `POST /meta/text-command` | `authenticateToken` ✅ |
| `POST /meta/transcribe` | `authenticateToken` ✅ |
| `POST /meta/tts-prompt` | **Public** (needed pre-login for welcome audio prefetch) |

**JWT fields used by the AI controller:**
- `req.userId` — teacher ID (used to filter classes)
- `req.schoolId` — school ID (used to fetch students from `students` collection)
- `req.tenantId` — tenant ID
- `req.user.name` — teacher name (used in conference payloads)
- `req.user.phoneNumber` — teacher phone (used in conference payloads)

**Injected Context Fields (Frontend → Backend Contextual Body):**
- `activeConferenceId` — Captured from `useConference()` dynamically inside `VoiceCommandButton.jsx`. Prevents AI from failing when commanding endpoints like `PUT /call/conference/end/:confId`.
- `history` ✨ — Last 2 conversation turns `[{ transcript, spokenSummary }]` for reference resolution. See [Conversation Memory](#conversation-memory).

---

## Database (SEEDS-Teacher-Backend)

The backend connects to MongoDB `SEEDS-Teacher-Backend`. Key collections used by the AI controller:

| Collection | Model | Used For |
|---|---|---|
| `classes` | `Class.js` | Teacher's classrooms, populated with Student refs |
| `students` | `Student.js` | Student list, filtered by `schoolId` |
| `contentsV3` | `ContentV3.js` | Content library search |
| `teachers` | `Teacher.js` | Teacher profile (login, name, phone) |
| `schools` | `School.js` | School lookup for `tenantId` resolution |

**Schema notes:**
- `classes.students` — array of `ObjectId` refs to `Student._id`
- `classes.schoolId` — ObjectId ref to `School._id`
- `students.schoolId` — ObjectId ref to `School._id` (used to scope student queries)
- The `classRouter.js` accepts phone number strings for `students`/`leaders` and resolves them to `_id`s before saving

---

## Backend File Map

| File | Purpose |
|---|---|
| `src/routes/metaCaller.js` | Router: voice-command, text-command, transcribe, tts-prompt — auth inline |
| `src/routes/classRouter.js` | Class CRUD — resolves phone numbers → Student ObjectIds on POST ✨ |
| `src/routes/callRouter.js` | Legacy IVR proxy + ConferenceV2 proxy routes |
| `src/controllers/meta.controller.js` | Orchestrator: 4-phase pipeline, canAutoResolve short-circuit ✨ |
| `src/services/meta.service.js` | Engine: Groq LLM, MongoDB pre-fetch, conference delegation, STT bias, fuzzy name match, help intent, conversation history, no-ID TTS ✨ |
| `docs/STUDENT_ROUTES_ACCESS.md` | Policy doc: students are `school_admin`-only; AI cannot create/edit/delete ✨ |
| `src/auth/authenticateToken.js` | JWT middleware — sets `req.userId`, `req.schoolId`, `req.tenantId` |
| `src/config/env.js` | Environment config: exports `confServerUrl`, `groqApiKey`, `azureSpeechRegion`, `azureSpeechKey`, etc. |

---

## Frontend Integration

### VoiceCommandButton.jsx

A floating UI component (FAB button) providing two input modes:

1. **Voice Input:** Records audio → `/meta/voice-command` → Azure STT transcribes → LLM processes
2. **Text Input:** User types → `/meta/text-command` → LLM processes

**State machine:**
```
IDLE → RECORDING → TRANSCRIBING → PLANNING → EXECUTING → DONE
                                              ↑
                               (conference delegation here)
                                                │
                                                ├── Display results
                                                ├── 🔊 Auto-play TTS audio
                                                ├── Show spoken summary bubble
                                                └── Auto-navigate (e.g. to ClassroomDetail logic with state.autoStart)
```

**Conference delegation flow:**
After receiving the backend response, if any result has `requiresClientExecution: true`:
1. Status transitions to `EXECUTING`
2. `executeClientCommands(results)` is called from `voiceCommandService.js`
3. Each pending conference command is resolved with `{{stepN.data.field}}` placeholders from prior results
4. Calls are made directly to `REACT_APP_CONF_SERVER_BASE_URI` (ConferenceV2)
5. Results are merged back into the response before display

**Conference ID persistence:**
After *any* successful command execution (voice or text), `storeConferenceIdFromResults()` scans the results for a `/call/conference/create` response. If found, the conference ID is immediately stored in `ConferenceContext` via `setConfId()`. This ensures the `activeConferenceId` is available for subsequent commands like "end the call" — without relying on page navigation.

### voiceCommandService.js

| Function | Purpose |
|---|---|
| `sendVoiceCommand(blob, context)` | POST to `/meta/voice-command` with `context` (includes `activeConferenceId`, `history`) |
| `sendTextCommand(text, context)` | POST to `/meta/text-command` with `context` (includes `activeConferenceId`, `history`) |
| `transcribeAudio(blob)` | POST to `/meta/transcribe` |
| `fetchTTSPrompt(type)` | POST to `/meta/tts-prompt` |
| `executeClientCommands(results)` ✨ | Execute PENDING_CLIENT conference steps directly against ConferenceV2 |

### Seeds AI Interactive Mode

The AI assistant is branded as **"Seeds"** — a friendly teaching assistant persona.

**Features:**
- **Welcome audio:** Pre-fetched on app load via `POST /meta/tts-prompt { type: "welcome" }`, Seeds greets the teacher on login
- **Push-to-Talk via 'R' key:** Opens dialog and auto-starts recording
- **Auto-Submit on Silence:** 2 seconds of silence automatically stops recording and submits
- **"Thinking" audio:** While AI processes, Seeds says *"Let me think about that for a moment"*
- **Conversational responses:** When `canAutoResolve: false`, Seeds explains in natural language (skips planning entirely)

### commandResultFormatter.js

| Function | Purpose |
|---|---|
| `formatResult(cmd, res)` | Converts raw API response into user-friendly display cards |
| `getNavigationTarget(cmds, res)` | Determines post-command navigation (content → `/content/:id`, conference → `/class/:id` with `autoStart` state, **new class created → `/classrooms/detail/:newId` "Go to {room name}"** ✨) |

> ✨ **New-classroom navigation:** A successful `POST /class/` create (response carries `_id` + `name`) now returns a `Go to {room name}` button targeting that room's detail page, instead of the generic "Go to Classrooms" list. The button is the opt-in ("ask"), the click is "yes" — no `autoNavigate`.

---

## Available API Routes

### Classroom Management
| Method | Route | Description |
|---|---|---|
| GET | `/class/` | List all classrooms for the teacher |
| GET | `/class/:classId` | Get a specific classroom by ID |
| POST | `/class/` | Create/update class — `students`/`leaders` as phone number arrays (auto-resolved to ObjectIds) |
| DELETE | `/class/:classId` | Delete a classroom |

### Student Management

> ⚠️ **The AI controller can NEVER create, edit, or delete students.** Mutation routes are restricted to `school_admin` via `authorizeRole`, and the planner prompt explicitly forbids planning a student create/add/edit/delete (rule 5). Phantom `/v1/teacher/students` and `/v1/teacher/add-students` endpoints were removed from the prompts — they never existed. The AI may only **read** students and reference existing ones (by phone) when building a class. See `docs/STUDENT_ROUTES_ACCESS.md`.

| Method | Route | Description | AI access |
|---|---|---|---|
| GET | `/student/` | List students for the school (requires schoolId from JWT) | ✅ read only |
| POST | `/student/` | Create a student | ❌ `school_admin` only |
| PATCH | `/student/:id` | Update a student | ❌ `school_admin` only |
| DELETE | `/student/:id` | Delete a student | ❌ `school_admin` only |

### Teacher Management
| Method | Route | Description |
|---|---|---|
| GET | `/teacher/me` | Get current teacher's profile |

### Content Library
| Method | Route | Description |
|---|---|---|
| GET | `/content/` | List content (filters: `language`, `theme`, `expName`, `ids`, `limit`, `cursor`) |
| GET | `/content/:contentId` | Get a single content item |
| GET | `/content/themes` | Get available themes |

### Conference Calls (ConferenceV2 — frontend-delegated)

> ⚠️ **These routes are intercepted client-side.** The backend plans them, but `executeClientCommands()` runs them directly from the browser against `REACT_APP_CONF_SERVER_BASE_URI`.

| Method | Route | Description |
|---|---|---|
| POST | `/call/conference/create` | Create conference (`teacher_phone`, `teacher_name`, `student_phones[]`, `student_names[]`) |
| POST | `/call/conference/start/:confId` | Start the conference |
| PUT | `/call/conference/end/:confId` | End an active conference |
| PUT | `/call/conference/muteall/:confId` | Mute all participants |
| PUT | `/call/conference/unmuteall/:confId` | Unmute all participants |
| PUT | `/call/conference/addparticipant/:confId` | Add participant |
| PUT | `/call/conference/removeparticipant/:confId` | Remove participant |
| PUT | `/call/conference/playaudio/:confId` | Play audio URL in conference |
| PUT | `/call/conference/pauseaudio/:confId` | Pause audio playback |

---

## Example Command Flows

### Simple: "How many classes do I have?"
```
Reasoning → intent: "count classes", canAutoResolve: true
DB        → 4 classes found for teacher
Plan      → [{ GET /class/ }]
Execute   → GET /class/ → 200 → [...4 classes]
Phase 4   → "You have four classes: test smartphone, test, tesst2, and tst3."
Frontend  → Plays TTS, shows result card
```

### Conversational: "Can you explain how to start a conference call?"
```
Reasoning → intent: "explain conference call process", canAutoResolve: false
            unresolvedNote: "Need user to specify which class they want to call"
SHORT-CIRCUIT → skip Phase 2 & 3
Phase 4   → explanation built from reasoning.steps
            "Sure, first tell me which class you'd like to call..."
Frontend  → Plays TTS explanation, no results cards shown
```

### Content Playback: "Play keats poem"
```
DB Pre-fetch → ContentV3 search → [{ _id: "a29...", title: "Keats Poem" }]
Reasoning    → canAutoResolve: true
Plan         → [{ GET /content/a29... }]
Execute      → GET /content/a29... → 200
Frontend     → Auto-navigates to /content/a29..., audio auto-plays
```

### Multi-Step Conference: "Start conference for test smartphone"
```
DB Pre-fetch → classes populated with students → test smartphone: [Pranav (9554433221), TestUser (9001122334)]
Reasoning    → canAutoResolve: true
Plan         → [
                 { GET /class/69955a49... },
                 { POST /call/conference/create, body: { teacher_phone, student_phones: [...] } },
                 { POST /call/conference/start/{{step2.data.id}} }
               ]
Execute      → Step 1: GET /class/69955a49... → 200 (classroom data)
               Step 2: POST /call/conference/create → 200 → { id: "conf_abc" }
               Step 3: POST /call/conference/start/conf_abc → 200
Phase 4      → "I've started the conference call for test smartphone."
Frontend     → storeConferenceIdFromResults() saves "conf_abc" into ConferenceContext
               getNavigationTarget() routes to /class/69955a49... with location.state.autoStart=true
               ClassroomDetail mounts → SSE connection established
```

### Follow-Up: "End the conference"
```
Frontend     → VoiceCommandButton reads confId="conf_abc" from useConference()
               Sends { activeConferenceId: "conf_abc" } in context
Backend      → {{activeConferenceId}} = "conf_abc" in prompts
Reasoning    → canAutoResolve: true
Plan         → [{ PUT /call/conference/end/conf_abc }]
Execute      → PUT /call/conference/end/conf_abc → 200
Phase 4      → "The conference has been ended."
```

### Reference Resolution: "Add Punit" → then "add him as leader too" ✨
```
Turn 1: "add Punit to test22"
  History sent: [] → resolves normally → records turn
Turn 2: "add him as leader too"
  History sent: [{ transcript:"add Punit to test22", spokenSummary:"Added Punit to test22." }]
  Reasoning → {{history}} resolves "him" = Punit, "test22" carried over
  Plan      → POST /class/ update test22 leaders += Punit's phone
```

### Help: "What can you do?" ✨
```
Reasoning → intent: "capabilities", canAutoResolve: false
            unresolvedNote: fixed capability list
SHORT-CIRCUIT → skip Phase 2 & 3
Phase 4   → reads the command menu aloud
```

### New Class: "Create a class called Grade 9"
```
Plan     → [{ POST /class/, body: { name:"Grade 9", students:[], leaders:[], contentIds:[] } }]
Execute  → 200 → { _id:"66f…", name:"Grade 9" }
Phase 4  → "Your new class Grade 9 has been created."  (no ID spoken)
Frontend → getNavigationTarget() → button "Go to Grade 9" → /classrooms/detail/66f…
```

### Compound: "Delete all classrooms"
```
Plan    → [{ GET /class/ }, { DELETE /class/{{step1.data[]}}, forEach: true }]
Execute → Step 1: GET /class/ → [{ _id: "abc" }, { _id: "def" }]
          Step 2a: DELETE /class/abc → 200
          Step 2b: DELETE /class/def → 200
```

---

## Environment Variables

### Backend (`backend-server/.env`)
| Variable | Purpose | Required |
|---|---|---|
| `GROQ_API_KEY` | Groq Cloud API key for the LLM (Llama 3.3) reasoning/planning/summary calls | Yes |
| `TTS_REGION` | Azure Speech resource region (e.g. `centralindia`) — powers both STT and TTS | For STT/TTS |
| `TTS_SUBSCRIPTION_KEY` | Azure Speech subscription key | For STT/TTS |
| `TTS_VOICE` | Azure neural voice name (default: `en-US-AvaNeural`) | No |
| `LLM` | LLM model name (default: `llama-3.3-70b-versatile`) | No |
| `CONF_SERVER_URL` | ConferenceV2 server URL — used only by legacy call proxy routes | Legacy |
| `MONGODB_URI` | MongoDB connection string pointing to `SEEDS-Teacher-Backend` | Yes |
| `SECRET_KEY` | JWT signing secret | Yes |

### Frontend (`teacher-webapp/.env`)
| Variable | Purpose | Required |
|---|---|---|
| `REACT_APP_API_BASE_URL` | Backend server base URL (e.g. `http://localhost:4000`) | Yes |
| `REACT_APP_CONF_SERVER_BASE_URI` | ConferenceV2 URL — used directly by `executeClientCommands()` | For calls |
| `REACT_APP_STORAGE_ACCOUNT_NAME` | Azure blob storage for content | For content |

---

## Testing

Two simulator scripts are provided:

| Script | Purpose |
|---|---|
| `test-backend-simulator.sh` | Direct curl calls to every API route (~20 endpoints) |
| `test-ai-simulator.sh` | Same tasks expressed as natural language (~22 AI commands) |

```bash
bash test-backend-simulator.sh   # Part 1: direct API
bash test-ai-simulator.sh         # Part 2: AI path
```

Compare terminal logs to verify the AI path hits the same endpoints as direct curl.

---

## Known Limitations / Future Work

- **Teacher phone from token:** The LLM uses `req.user.phoneNumber` from the JWT for conference payloads. Ensure this is set correctly in the login response.
- **ConferenceV2 CORS:** The browser calls ConferenceV2 directly — ensure ConferenceV2 has CORS configured to allow the teacher webapp origin.
- **Conference ID lifecycle:** The `confId` in `ConferenceContext` is stored on creation but is **not automatically cleared** when a conference ends. A future improvement could listen for end-conference results and call `setConfId("")` to reset the state.

---

## 🐛 Open Issue: Conference Auto-Navigation Not Working

**Status:** Unresolved  
**Severity:** Medium — conference calls are created and started successfully, but the UI does NOT auto-navigate to the classroom page. The teacher must manually navigate to see the live call.

### Intended Flow

When the user says "Start a conference for test smartphone", the expected flow is:

```
VoiceCommandButton                     Backend                          ClassroomDetail
     │                                    │                                   │
     │──── POST /meta/voice-command ─────►│                                   │
     │                                    │── Phase 1: Reason                 │
     │                                    │── Phase 2: Plan (3 steps)         │
     │                                    │── Phase 3: Execute                │
     │                                    │   ├─ GET /class/69955a49...       │
     │                                    │   ├─ POST /call/conference/create │
     │                                    │   └─ POST /call/conference/start  │
     │◄─── { commands, results } ─────────│                                   │
     │                                    │                                   │
     │ storeConferenceIdFromResults()      │                                   │
     │   → setConfId("conf-xxx") ✅       │                                   │
     │                                    │                                   │
     │ navTarget = getNavigationTarget()   │                                   │
     │   → { path: "/classrooms/detail/69955a49...",                          │
     │       state: { confId: "conf-xxx", autoStart: true },                  │
     │       autoNavigate: true }          │                                   │
     │                                    │                                   │
     │ auto-navigate useEffect fires:      │                                   │
     │   handleClose()                     │                                   │
     │   navigate(path, { state })  ───────────────────────────────────────────►│
     │                                    │                                   │
     │                                    │   useEffect detects autoStart     │
     │                                    │   setConfId("conf-xxx")            │
     │                                    │   setConferenceStarted(true)       │
     │                                    │   SSE connection established       │
```

### Where It Breaks: Detailed Failure Point Analysis

#### Point A: `getNavigationTarget()` may return `null`

**File:** `commandResultFormatter.js` (`getNavigationTarget`)

> Note: line numbers below predate the new-classroom-navigation block (a `POST /class/` create check now sits just before the generic `/class` fallback). The conference logic and the analysis below are unchanged; offsets shifted by a few lines.

The function iterates through `commands[]` and `results[]` in order, looking for:
1. A `GET /class/:id` command to extract `classIdSearchResult`
2. A `POST /call/conference/create` to extract `confIdSearchResult`
3. A `POST /call/conference/start` to trigger the navigation return

**Potential failure:** There's a **fallthrough bug at line 139**. After the conference start block (line 99-109), the loop continues and hits line 139:
```js
if (path.match(/\/class/)) {
  return { label: "Go to Classrooms", path: ROUTES.CLASSROOMS };
}
```
This regex matches ANY path containing `/class` — including `/class/69955a49...` from Step 1. Since the loop iterates in order and Step 1 (`GET /class/:id`) comes FIRST, it hits the **specific** check at line 89 and sets `classIdSearchResult`. But it doesn't return early — it falls through to line 139 which matches `/class/` too and **returns a generic "Go to Classrooms" navigation instead of the conference navigation.**

Wait — actually line 89 only sets a variable and doesn't return. Then the loop continues to steps 2 and 3. Step 3 (conference start at line 99) should match and return the conference nav target. But only if `classIdSearchResult` is truthy. If `res?.data?._id` is undefined for some reason, it stays null and the conference block at line 101 doesn't return.

**Root cause possibility:** The backend's `GET /class/:id` response structure. The `res.data._id` check at line 90 assumes the response body has a top-level `_id` field. If the class route returns data in a wrapper (e.g., `{ data: { _id: "..." } }`) or if the backend `executeCommands` double-wraps it (result is `{ step, status, data }` where `data` is `response.data`), then `res.data._id` is correct. But verify by logging `JSON.stringify(res)` for the GET /class step.

#### Point B: `handleClose()` race condition with `navigate()`

**File:** `VoiceCommandButton.jsx:248-255`

```js
useEffect(() => {
  if (status === STATUS.DONE && navTarget?.autoNavigate) {
    handleClose();   // sets result=null, status=IDLE, open=false
    navigate(navTarget.path, navTarget.state ? { state: navTarget.state } : undefined);
  }
}, [status, navTarget]);
```

`handleClose()` calls `reset()` which sets `result = null`. This causes `navTarget` to become `null` on the next render (since `navTarget = result?.commands ? getNavigationTarget(...) : null`).

**In React 18**, state updates inside effects are batched. So `setStatus(IDLE)`, `setResult(null)`, and `setOpen(false)` are all batched and don't cause intermediate re-renders. The `navigate()` call executes synchronously after `handleClose()` returns, before the next render. So **in theory** the navigation fires correctly.

**BUT:** `navTarget` is captured from the current render's closure. If it's truthy when the effect fires, it should remain truthy for the `navigate()` call. The risk is if React processes the batched updates and triggers a synchronous re-render before `navigate()` fires — which should not happen in the standard React 18 event model, but edge cases exist with concurrent mode.

#### Point C: MUI Dialog unmount interfering with navigation

**File:** `VoiceCommandButton.jsx:78-83`

```js
const handleClose = () => {
  if (isRecording) stopRecording();
  setOpen(false);   // triggers Dialog exit animation
  reset();          // nulls result
};
```

Setting `open = false` triggers MUI's `<Dialog>` exit transition. The Dialog uses `TransitionComponent` (defaults to `Fade` or `Slide`). During the exit animation, the Dialog's content tree is still mounted. The `navigate()` call fires while the Dialog is animating out.

**Potential failure:** If `navigate()` causes a full route change (e.g., from `/classrooms` to `/classrooms/detail/xyz`), React unmounts the current page and mounts `ClassroomDetail`. The VoiceCommandButton is rendered inside `AppContent` (above the Routes), so it survives the route change. But if the Dialog's `TransitionComponent` has `unmountOnExit={true}`, the Dialog content (which holds the result state) might be unmounted mid-animation, causing the effect cleanup to fire and mark operations as cancelled.

#### Point D: `ClassroomDetail` autoStart useEffect timing

**File:** `ClassroomDetail.js:84-92`

```js
useEffect(() => {
  if (location.state?.autoStart && location.state?.confId && !conferenceStarted) {
    setConferenceStarted(true);
    setConferenceId(location.state.confId);
    setConfId(location.state.confId);
    navigate(location.pathname, { replace: true, state: {} });
  }
}, [location.state, conferenceStarted, setConfId, navigate, location.pathname]);
```

This effect depends on `location.state` which should be `{ confId: "conf-xxx", autoStart: true }` after navigation. It then immediately calls `navigate(pathname, { state: {} })` to clear the state. 

**Potential failure:** If `ClassroomDetail` is already mounted (e.g., user was already viewing this classroom), `navigate` with `{ replace: true }` updates the history entry but may not trigger a re-render if the pathname hasn't changed. The `location.state` ref update depends on `useLocation()` detecting the state change.

#### Point E: `location.state` not arriving at ClassroomDetail

**File:** `VoiceCommandButton.jsx:252`

```js
navigate(navTarget.path, navTarget.state ? { state: navTarget.state } : undefined);
```

`navTarget.state` is `{ confId: "conf-xxx", autoStart: true }`. The second argument to `navigate` is `NavigateOptions`, and state goes inside it as `{ state: {...} }`. So the full call is:
```js
navigate("/classrooms/detail/69955a49...", { state: { confId: "conf-xxx", autoStart: true } })
```

This should be correct per React Router v6 API. But if `navTarget.state` is somehow falsy (e.g., if `confIdSearchResult` was null and the fallback path.split("/").pop() returned the placeholder string `{{step2.data.id}}`), then the state would contain a garbage confId, and ClassroomDetail might handle it incorrectly.

### Debugging Checklist

To isolate the exact failure point, add these console.log statements:

```js
// In getNavigationTarget (commandResultFormatter.js) — after the for loop
console.log("[nav] classIdSearchResult:", classIdSearchResult, "confIdSearchResult:", confIdSearchResult);

// In VoiceCommandButton auto-navigate effect
console.log("[nav] status:", status, "navTarget:", JSON.stringify(navTarget));

// In ClassroomDetail autoStart effect
console.log("[nav] location.state:", JSON.stringify(location.state), "conferenceStarted:", conferenceStarted);
```

### Possible Solutions

| # | Approach | Complexity | Risk |
|---|---|---|---|
| 1 | **Bypass navigation entirely** — Since `storeConferenceIdFromResults()` now stores confId in ConferenceContext, the "end call" command should work without needing ClassroomDetail to mount. Only the SSE live-view requires navigation. | Low | Conference runs but teacher doesn't see the live UI until they manually navigate |
| 2 | **Decouple close from navigate** — Don't call `handleClose()` before `navigate()`. Use a flag `pendingNavigation` and close the dialog AFTER navigation completes (in a separate effect checking `location.pathname`). | Medium | Dialog stays open briefly during transition |
| 3 | **Use `window.location` instead of `navigate`** — Hard redirect ensures state is fresh on mount. Loses in-memory React state but guarantees clean mount. | Low | Full page reload, loses ConferenceContext (since it's in-memory) |
| 4 | **Post-navigate confirmation** — After `navigate()`, wait 100ms and verify `location.pathname` changed. If not, retry with `window.location.href`. | Medium | Hacky but reliable |
| 5 | **Separate the concerns** — Keep the dialog open showing "Conference started! Navigating..." and navigate via a user-click button instead of auto-navigate. The `navTarget` already has a `label` and `handleNavigate` function for this. Remove `autoNavigate: true` for conference targets. | Low | Requires one extra user click |
