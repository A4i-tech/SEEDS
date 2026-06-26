# Seeds AI Voice Controller — Android Design Document

> **Status: Decisions finalised via design review session — 2026-06-26**

---

## Overview

The **teacher-webapp** exposes a floating voice/text AI panel that lets teachers issue natural-language commands (start a call, mute all, play content, etc.) through the Seeds AI backend. This document describes how an equivalent feature should be designed for the **Android Teacher-App**.

---

## How the Web Feature Works (Reference)

### Activation
A floating mic button (bottom-right corner) is always visible when the teacher is logged in. Clicking it — or holding the `Space` key — opens a slide-in side panel. Holding `Space` starts recording immediately; releasing stops it.

### Recording
A custom React hook (`useVoiceRecorder`) requests microphone access via the browser's `MediaRecorder` API, records in `audio/webm` format, and runs silence detection using the browser's `AudioContext` analyser. If audio amplitude stays below a fixed threshold for 2 continuous seconds, recording stops automatically.

### Command Dispatch
When recording ends, the audio blob is sent to `POST /meta/voice-command` as `multipart/form-data`. A JSON `context` object is attached containing:
- **`activeConferenceId`** — the ID of any in-progress call (stored in a React context that persists across the session)
- **`currentClassId`** — derived from the current URL path (e.g. `/classrooms/detail/123`)
- **`history`** — the last 2 conversation turns (transcript + spoken summary) for reference resolution

For text-only commands, the same context is sent to `POST /meta/text-command` as JSON.

### Backend Response
The backend returns:
- `transcript` — what it heard
- `commands[]` — the list of API calls it decided to make
- `results[]` — the outcome of each call (status code + data)
- `spokenSummary` — a human-readable sentence summarising what happened
- `audioBase64` — optional TTS mp3 of the spoken summary
- `error` — if something went wrong

### Client-Side Execution
Some commands target the **ConferenceV2** server directly. These results arrive with `requiresClientExecution: true` and a `path`/`method`/`body` to execute. The web app resolves `{{stepN.data.field}}` placeholder values from prior steps, then calls the conference server itself.

### TTS / Audio Feedback
When the AI is thinking (`PLANNING` state), the app fetches a pre-recorded "thinking" mp3 from `POST /meta/tts-prompt` and plays it. A "welcome" audio is also fetched on login and played once per session.

### Status Machine
Six states: `idle → recording → transcribing → planning → executing → done / error`.

### Mutation Refresh
When a command results in a write (POST/PATCH/PUT/DELETE), the web fires a `voice-command-complete` custom DOM event. Pages that display data listen for this event and re-fetch.

### Navigation
A utility function maps command paths to app routes. Some results auto-navigate (e.g. "show classrooms" navigates to `/classrooms`), others show a manual "Go to X" button.

---

## Decisions Log

| # | Question | Decision |
|---|---|---|
| Q1 | Audio format & silence detection | `MediaRecorder` → `.m4a` (AAC) + parallel `AudioRecord` for silence detection |
| Q2 | Conference server URL on Android | Reuse existing `Constants.CONTENT_URL` — already used in `CallViewModel` for all conference calls |
| Q3 | Navigation after command result | Mirror web: auto-navigate where web does, show "Go to X" button otherwise |
| Q4 | Welcome TTS on login | Yes — play once per session after login, same as web |
| Q5 | Mutation refresh mechanism | New `MutableSharedFlow` singleton, Hilt-injected, collected by relevant fragments |
| Q6 | Activation gesture | **Shake to activate** — shake phone opens bottom sheet and starts recording immediately |
| Q7 | Stop recording gesture | **Volume-up button** — analogous to releasing `Space` on the web |
| Q8 | Orb/FAB visibility | Small floating mic orb, **always-on-top on all authenticated screens** including the call screen |

---

## Android Design

### Technology Fit

The Android app uses **Kotlin**, **Fragments + Navigation Component**, **ViewBinding**, **Hilt** for DI, **Retrofit + Moshi** for networking, and **Coroutines + StateFlow** for async work. The design below maps every web concern to its natural Android equivalent without introducing new architectural patterns — with the exception of the `MutableSharedFlow` event bus (new, but clean).

---

### Layer Overview

```
ShakeDetector (SensorEventListener in MainActivity)
    │ shake detected
    ▼
VoiceCommandBottomSheet  (BottomSheetDialogFragment — always-expanded)
    │  shows immediately, starts recording
    │
    └── VoiceCommandViewModel
            │
            ├── VoiceRecorderManager
            │       ├── MediaRecorder → .m4a file (audio output)
            │       └── AudioRecord (parallel, PCM only — reads amplitude for silence detection)
            │
            └── VoiceCommandRepository
                    ├── SeedsService (extended with 3 new endpoints)
                    └── OkHttp direct → Constants.CONTENT_URL/conference/*
                        (for requiresClientExecution steps)
```

---

### Component Designs

---

#### 1. Activation — Shake Gesture

**Mechanism:** `ShakeDetector` — a `SensorEventListener` registered against `TYPE_ACCELEROMETER` in `MainActivity`. When the shake threshold is exceeded, it shows `VoiceCommandBottomSheet` and immediately begins recording. This is the Android equivalent of holding `Space` on the web.

**Threshold tuning:** Shake sensitivity should use an established algorithm (e.g. square-root of sum of squared acceleration deltas exceeding ~12 m/s²). A brief vibration feedback confirms activation.

**Guard:** If a sheet is already open or a command is already in-flight, the shake is ignored.

---

#### 2. Floating Mic Orb

A small, semi-transparent circular `FloatingActionButton` (mic icon) anchored to the bottom-right corner inside `activity_main.xml`. Rendered in a `CoordinatorLayout` so it floats above all fragment content.

Visible on **all authenticated screens**, including the call screen — the teacher may want to say "mute all" or "end call" hands-free.

Hidden only on:
- `SplashScreenActivity`
- `LoginActivity`

Tapping the orb also activates the bottom sheet (tap = open idle, shake = open + immediately record).

---

#### 3. VoiceRecorderManager

Responsibility: microphone access, recording lifecycle, silence detection.

**Why not Android's `SpeechRecognizer`?**  
`SpeechRecognizer` sends audio to Google's cloud and returns text only. The Seeds backend needs the raw audio file to run its own Whisper transcription before planning commands.

**Recording — `MediaRecorder`:**  
Writes a compressed `.m4a` (AAC) file to the app's cache directory. Simple API, no buffer management, directly uploadable.

**Silence detection — parallel `AudioRecord`:**  
Android allows a second audio session on the same microphone input at lower priority. A background coroutine reads PCM amplitude in a loop. If the maximum sample value stays below a threshold for **2 continuous seconds**, `MediaRecorder.stop()` is called. Matches the web's `AudioContext` analyser behaviour exactly.

**Audio format:**  
`.m4a` / MIME type `audio/mp4`. The backend's Whisper transcription handles this format. The multipart part is named `audio`, consistent with the web's naming.

**Volume-up stop:**  
`MainActivity` intercepts `KeyEvent.ACTION_UP` for `KEYCODE_VOLUME_UP` and, if recording is active, forwards a stop signal to `VoiceRecorderManager` — the Android equivalent of releasing `Space`.

**Exposed state:**  
`StateFlow<RecorderState>` with values `Idle`, `Recording(startedAt: Long)`, `Stopped(file: File)`.

---

#### 4. VoiceCommandRepository

Responsibility: all network calls for the voice feature, plus client-side execution of conference commands.

**New endpoints added to the existing `SeedsService`:**

| Endpoint | Purpose | Web equivalent |
|---|---|---|
| `POST meta/voice-command` (multipart) | Send `.m4a` + context JSON, receive command plan + results | `sendVoiceCommand()` |
| `POST meta/text-command` | Send text + context JSON, receive command plan + results | `sendTextCommand()` |
| `POST meta/tts-prompt` | Fetch "thinking" / "welcome" mp3 as base64 | `fetchTTSPrompt()` |

**Conference server URL:**  
Uses `Constants.CONTENT_URL` — the same constant `CallViewModel` already uses for all conference calls (`/conference/create`, `/conference/start`, `/conference/mute`, etc.). No new `BuildConfig` field needed.

**`executeClientCommands`:**  
Iterates results flagged `requiresClientExecution`. For each:
1. Resolves `{{stepN.data.field}}` placeholders by looking up prior results (same algorithm as the web's `resolveClientPlaceholders`)
2. Normalises phone numbers (same logic as web's `normalizePhoneNumber`)
3. Issues the call to `Constants.CONTENT_URL` via OkHttp directly (not Retrofit, because the base URL differs from the backend URL)
4. Writes result status + data back into the results list

**Context object sent with every request:**  
`{ activeConferenceId, currentClassId, history[] }` — assembled by the ViewModel.

---

#### 5. VoiceCommandViewModel

Responsibility: owns the state machine, coordinates recorder and repository, exposes a single `UiState` to the bottom sheet.

**State machine (mirrors web exactly):**

```
IDLE
  │
  ├─ shake / tap orb ──► RECORDING ──► volume-up or 2s silence ──► TRANSCRIBING
  │                                                                      │
  │                                                              [audio upload]
  │                                                                      │
  │                                                                  PLANNING
  │                                                              (TTS "thinking")
  │                                                                      │
  │                                              ┌───────────────────────┤
  │                                              ▼                       ▼
  │                                          EXECUTING                 DONE
  │                                      (client commands)           (or ERROR)
  │
  └─ text send ──► (same PLANNING branch)
```

**Conversation history:**  
Kept in the ViewModel as a list capped at 2 turns, reset when the sheet is dismissed. Equivalent to `historyRef` in the web.

**Active conference ID:**  
Read from and written to `VoiceCommandSessionState` (the singleton, see §7). When a result contains a successful `conference/create` response, the ID is extracted and stored.

**TTS playback:**
- On entering `PLANNING`: calls `fetchTTSPrompt("thinking")`, decodes base64 → temp file, plays via `MediaPlayer`. Cached after first fetch.
- On `DONE` with `audioBase64` in result: decodes and plays immediately.

**Mutation events:**  
After a command with write operations completes, the ViewModel emits to `VoiceCommandEventBus` (`MutableSharedFlow<VoiceCommandEvent>`). Relevant fragments collect from this flow and re-fetch their data.

**`currentClassId`:**  
Supplied at construction time from `NavController`'s current back-stack entry arguments. The ViewModel does not reach into the nav controller itself.

**Navigation:**  
A `navigationTarget: NavigationTarget?` is computed from the result's command paths and exposed via `UiState`. Maps web path patterns (e.g. `/class`) to Navigation Component destination IDs. Behaviour mirrors the web: auto-navigate for commands that the web auto-navigates, show a button for the rest.

---

#### 6. VoiceCommandBottomSheet

A `BottomSheetDialogFragment` set to always-expanded state.

**Activation path:**
- Via shake → sheet shows + recording begins immediately (state = `RECORDING`)
- Via orb tap → sheet shows in `IDLE` state; teacher taps mic button to record or types a text command

**UI element mapping:**

| Web panel element | Android equivalent |
|---|---|
| Panel header ("🌱 Seeds AI" + close) | `MaterialToolbar` with close `ImageButton` |
| Large mic button (red when recording) | `FloatingActionButton` (primary → error colour) |
| Status label + spinner | `TextView` + `CircularProgressIndicator` |
| Text input + send icon | `TextInputLayout` + send `ImageButton` |
| "You said:" transcript card | `MaterialCardView` with `TextView` |
| Spoken summary bubble (left border accent) | `MaterialCardView` with start-border colour stripe |
| Result cards per command (green/red border) | `RecyclerView` + `VoiceResultItemAdapter` |
| "Go to X" or auto-navigate | `MaterialButton` (shown when `navigationTarget != null`) |
| Error alert + "Try again" | `MaterialCardView` in error colours |

**Volume-up to stop:**  
When the sheet is open and `status == RECORDING`, volume-up is intercepted in `MainActivity` and forwarded to the ViewModel.

**Runtime permission:**  
`RECORD_AUDIO` requested the first time recording is triggered. If denied, an inline error card explains and offers a Settings deep-link.

---

#### 7. VoiceCommandSessionState — Conference ID Singleton

A Hilt `@Singleton` holding `activeConferenceId: MutableStateFlow<String?>`.

Survives the bottom sheet being dismissed and re-opened — equivalent to `ConferenceContext` in the React app.

Updated when a `conference/create` result lands. Read by the ViewModel when assembling the context for subsequent commands ("end the call", "mute all", etc.).

---

#### 8. VoiceCommandEventBus — Mutation Refresh

A Hilt `@Singleton` wrapping a `MutableSharedFlow<VoiceCommandEvent>`.

`VoiceCommandEvent` carries which type of mutation occurred (classroom, student, call). Fragments that display mutable data (`ClassroomFragment`, `HomeFragment`, etc.) add a `lifecycleScope.launch { eventBus.collect { ... } }` collector and re-fetch when relevant events arrive.

This is the Android equivalent of the web's `voice-command-complete` custom DOM event.

---

#### 9. Welcome TTS

On first launch of `MainActivity` after login (tracked via a flag in `SharedPreferences`, cleared on logout — mirrors the web's `sessionStorage.removeItem("seeds_welcomed")`):

1. Fetch `POST /meta/tts-prompt` with `{ type: "welcome" }`
2. Decode base64 → temp file
3. Play via `MediaPlayer` with a 300 ms delay (allows UI to render first)

---

#### 10. Permissions

`AndroidManifest.xml` addition:

```
RECORD_AUDIO    — runtime dangerous permission, requested before first recording attempt
```

`RECORD_AUDIO` is a runtime (dangerous) permission on Android 6+. Requested contextually — only when the teacher first taps to record, not at app launch.

---

## What Is Explicitly Out of Scope

| Web behaviour | Android decision |
|---|---|
| `audio/webm` format | `.m4a` (AAC) used instead — Whisper handles both |
| `Space` bar hold-to-record | Replaced by shake-to-activate + volume-up to stop |
| Page content shifts right when panel opens | Bottom sheet overlay — no layout shifting needed |
| Custom DOM events for refresh | `MutableSharedFlow` singleton bus |

---

## Files to Create / Modify

| File | Change |
|---|---|
| `AndroidManifest.xml` | Add `RECORD_AUDIO` permission |
| `network/Service.kt` | Add 3 new `SeedsService` endpoints |
| `network/VoiceCommandResponse.kt` | **NEW** — response DTO |
| `network/TextCommandRequest.kt` | **NEW** — text command request DTO |
| `network/TtsPromptRequest.kt` | **NEW** — TTS request DTO |
| `network/TtsPromptResponse.kt` | **NEW** — TTS response DTO |
| `network/VoiceCommandContext.kt` | **NEW** — context object DTO |
| `network/CommandResult.kt` | **NEW** — per-command result DTO |
| `repository/VoiceCommandRepository.kt` | **NEW** — 3 endpoints + `executeClientCommands` |
| `audio/VoiceRecorderManager.kt` | **NEW** — `MediaRecorder` + `AudioRecord` silence detection |
| `ui/voiceCommand/VoiceCommandViewModel.kt` | **NEW** — state machine, TTS, history, navigation |
| `ui/voiceCommand/VoiceCommandBottomSheet.kt` | **NEW** — bottom sheet UI fragment |
| `ui/voiceCommand/VoiceResultItemAdapter.kt` | **NEW** — RecyclerView adapter for result cards |
| `res/layout/bottom_sheet_voice_command.xml` | **NEW** |
| `res/layout/item_voice_result.xml` | **NEW** |
| `res/layout/activity_main.xml` | Add floating mic orb FAB |
| `MainActivity.kt` | Add `ShakeDetector`, volume-up intercept, welcome TTS, orb visibility |
| `HiltAppModule.kt` | Provide `VoiceCommandRepository`, `VoiceCommandSessionState`, `VoiceCommandEventBus` |
| `utils/VoiceCommandSessionState.kt` | **NEW** — `activeConferenceId` singleton |
| `utils/VoiceCommandEventBus.kt` | **NEW** — `MutableSharedFlow` singleton |
