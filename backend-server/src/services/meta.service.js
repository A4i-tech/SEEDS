"use strict";
const axios = require("axios");
const { Readable, PassThrough } = require("stream");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("ffmpeg-static");
const { ContentV3 } = require("../models/ContentV3");
const ClassRoom = require("../models/Class");
const Student = require("../models/Student");
const { AzureOpenAI } = require("openai");
const {
  azureOpenAiKey,
  azureOpenAiEndpoint,
  azureOpenAiModel,
  azureOpenAiApiVersion,
  azureSpeechRegion,
  azureSpeechKey,
  azureTtsVoice,
} = require("../config/env");

if (ffmpegPath) ffmpeg.setFfmpegPath(ffmpegPath);

// LLM (reasoning/planning/summary) runs on Azure OpenAI.
let azureOpenAiClient = null;
if (azureOpenAiKey && azureOpenAiEndpoint) {
  // Normalize endpoint: strip trailing slashes and /openai/v1 suffix if present
  const cleanedEndpoint = azureOpenAiEndpoint.replace(/\/+$/, "").replace(/\/openai\/v1$/, "");
  azureOpenAiClient = new AzureOpenAI({
    apiKey: azureOpenAiKey,
    endpoint: cleanedEndpoint,
    apiVersion: azureOpenAiApiVersion,
  });
} else {
  console.warn("[meta] Azure OpenAI is not configured (AZURE_OPENAI_KEY or AZURE_OPENAI_ENDPOINT missing)");
}

// Azure Speech Services — one resource (region + subscription key) serves STT and TTS.
const AZURE_REGION = azureSpeechRegion;
const AZURE_KEY = azureSpeechKey;
const AZURE_TTS_VOICE = azureTtsVoice || "en-US-AvaNeural";
const AZURE_STT_URL = AZURE_REGION
  ? `https://${AZURE_REGION}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=en-US`
  : null;
const AZURE_TTS_URL = AZURE_REGION
  ? `https://${AZURE_REGION}.tts.speech.microsoft.com/cognitiveservices/v1`
  : null;

// Browser records WebM/Opus; Azure short-audio STT REST accepts only WAV-PCM or OGG-Opus.
// Decode any input container to raw 16 kHz mono PCM (s16le) via bundled ffmpeg, then wrap WAV.
function decodeToPcm(buffer) {
  return new Promise((resolve, reject) => {
    const out = new PassThrough();
    const chunks = [];
    out.on("data", (c) => chunks.push(c));
    out.on("end", () => resolve(Buffer.concat(chunks)));
    out.on("error", reject);
    ffmpeg(Readable.from(buffer))
      .audioChannels(1)
      .audioFrequency(16000)
      .audioCodec("pcm_s16le")
      .format("s16le")
      .on("error", reject)
      .pipe(out, { end: true });
  });
}

// Wrap raw PCM in a 44-byte WAV header (16-bit mono 16 kHz) — avoids ffmpeg seek issues on pipe output.
function pcmToWav(pcm, sampleRate = 16000, channels = 1, bitsPerSample = 16) {
  const blockAlign = (channels * bitsPerSample) / 8;
  const byteRate = sampleRate * blockAlign;
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

// ── MongoDB pre-fetch: search content and classes for LLM context ────────────
const STOP_WORDS = new Set([
  "play", "show", "find", "get", "list", "fetch", "search", "open", "start",
  "the", "a", "an", "in", "on", "at", "to", "for", "of", "my", "me", "all",
  "content", "classroom", "classrooms", "class", "student", "students",
  "please", "can", "you", "i", "want", "need", "with", "and", "or", "from",
  "is", "are", "it", "this", "that", "some", "any",
]);

function extractKeywords(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP_WORDS.has(w));
}

async function fetchContextFromDB(transcript, userInfo) {
  const keywords = extractKeywords(transcript);
  if (keywords.length === 0) return { content: [], classes: [], students: [] };

  const regexPattern = keywords.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const regex = new RegExp(regexPattern, "i");

  const [contentResults, classResults, studentResults] = await Promise.all([
    ContentV3.find({
      isDeleted: { $ne: true },
      $or: [
        { "title.english": regex },
        { "title.local": regex },
        { type: regex },
        { "theme.english": regex },
      ],
    })
      .select("_id title.english title.local type language theme.english")
      .limit(10)
      .lean()
      .exec(),
    ClassRoom.find({ teacher: userInfo.userId })
      .select("_id name students leaders")
      .populate("students", "name phoneNumber")
      .populate("leaders", "name phoneNumber")
      .lean()
      .exec(),
    Student.find({ schoolId: userInfo.schoolId })
      .select("name phoneNumber")
      .lean()
      .exec().catch(() => [])
  ]);

  return {
    content: contentResults.map((c) => ({
      _id: c._id,
      title: c.title?.english || c.title?.local || "Unknown",
      type: c.type,
      language: c.language,
      theme: c.theme?.english || "",
    })),
    classes: classResults.map((c) => ({
      _id: c._id,
      name: c.name,
      students: (c.students || []).map(s => ({ name: s.name, phone: s.phoneNumber })),
      leaders: (c.leaders || []).map(l => ({ name: l.name, phone: l.phoneNumber })),
    })),
    students: studentResults.map(s => ({
      name: s.name,
      phone: s.phoneNumber,
    })),
  };
}

// ── Reasoning prompt — the LLM thinks through the command first ─────────────
const REASONING_PROMPT = `
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

- POST /call/conference/create → body: {teacher_phone, teacher_name, student_phones: [...], student_names: [...], leader_phone: "<phone>" (optional — include only if user names a leader)}
  Creates a conference. Returns {status: "CREATED", id: "<confId>"}. student_phones and student_names are parallel arrays.
  Use teacher's phone number for teacher_phone and student phones/names from the class data in DB context.
  If the user names a leader ("with X as leader" / "make X the leader"), resolve that student via fuzzy match and include their phone as leader_phone. If no leader named, omit the field.
- POST /call/conference/start/:confId → starts a created conference (no body needed). Returns {status: "STARTED", id}
- PUT /call/conference/end/:confId → ends an active conference
- PUT /call/conference/muteall/:confId → mutes all participants in a conference
- PUT /call/conference/unmuteall/:confId → unmutes all participants
- PUT /call/conference/addparticipant/:confId → body: {phone_number, name} → add participant to conference
- PUT /call/conference/removeparticipant/:confId → body: {phone_number} → remove participant
- PUT /call/conference/playaudio/:confId → body: {url} → play audio URL in conference
- PUT /call/conference/pauseaudio/:confId → pause audio playback in conference

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
   - If 'Current class being viewed' in CURRENT USER CONTEXT is a real class id (NOT "none"), use THAT class. Include ALL of its students (from the matching class in DB context) as participants and proceed — set canAutoResolve to true. Do NOT ask which class; the user is already on that class page. A leader is optional — do not block on it.
   - If the user explicitly named a class or specific students in their command, use those instead.
   - Only if 'Current class being viewed' is "none" AND the user did not name a class/students, set canAutoResolve to false and set unresolvedNote to "Which class would you like to start the call for?"
3. If the user wants to end a conference, but the 'Active Conference ID' in CURRENT USER CONTEXT is 'none', set canAutoResolve to false and explain that there is no active conference to end.
4. Student/leader names come from speech transcription and may be misspelled or distorted by accent. When a requested name is not an exact match, pick the CLOSEST existing student (phonetic/spelling similarity) and proceed with that student. Only set canAutoResolve to false if NO existing student is a reasonably close match. Do not reject a name just because the spelling differs slightly.
5. HELP / CAPABILITIES: If the user asks what you can do, what commands or navigation options exist, how to use the assistant, or any similar "help" question, set canAutoResolve to false and set unresolvedNote to this exact list (rephrase naturally, do not invent extra abilities):
   "Here's what I can help you with: show your classrooms; create a new classroom; add an existing student or leader to a class; delete a class; play or find content; show content themes; start, end, mute, or unmute a conference call; add or remove a call participant; show your teacher profile; and list tenant names. Just tell me what you'd like to do."
`;

// ── Planning prompt — produces executable API calls, informed by reasoning ───
const PLANNING_PROMPT = `
You are a command planner for the SEEDS education platform backend.
You have already reasoned about the user's command. Now produce the exact API calls.

CURRENT USER CONTEXT:
- Phone number: {{phoneNumber}}
- Teacher name: {{teacherName}}
- Tenant ID: {{tenantId}}
- User ID: {{userId}}
- Active Conference ID: {{activeConferenceId}}
- Current class being viewed: {{currentClassId}}
  (If not "none" and the command is "start a call" without a named class, build the conference from THIS class's students in DB context.)

{{history}}

REASONING FROM PREVIOUS STEP:
{{reasoning}}

{{dbContext}}

Now produce the API calls to execute IN ORDER.

OUTPUT FORMAT: respond with a JSON OBJECT containing a "commands" array:
{ "commands": [ {step1}, {step2}, ... ] }
The top level MUST be an object with a "commands" key — NEVER a bare array (the
response format requires an object). Even a single step goes inside "commands".

Each element of "commands" must have:
  - "method": HTTP method (GET, POST, PUT, PATCH, DELETE) — or "NAVIGATE" for frontend screen changes
  - "path": the full API path — or the frontend route for NAVIGATE
  - "body": request body object (null if not needed)
  - "description": short description of what this step does

FRONTEND NAVIGATION: for pure "go to / open / take me back to <screen>" requests, emit a single
NAVIGATE step (no HTTP call). Use the frontend route as the path:
  - classrooms / home / main screen / go back → "/classrooms"
  - content library / show me content → GET /content/ (fetch list; frontend opens content drawer; speak item names in summary)
  - a specific class → "/classrooms/detail/<classId>" (use the real _id from DB context)
Example: "take me back to the home screen"
{ "commands": [ { "method": "NAVIGATE", "path": "/classrooms", "body": null, "description": "Navigate to the classrooms home screen" } ] }

CRITICAL RULES:
1. Only return valid JSON. No markdown, no explanation.
2. CHAIN STEPS using variable references: {{stepN.data...}} to avoid placeholder <ID>.
   - {{step1.data}} = the full response data from step 1
   - {{step1.data[name=Grade 7]._id}} = find item named "Grade 7" in array, get _id
   - {{step1.data._id}} = get _id from step 1 result
3. SCHEMA RULES for /class/ POST:
   - students: [String] — array of existing student PHONE NUMBERS. e.g. ["1234567890"]. MUST NOT use names!
   - leaders: [String] — array of existing student PHONE NUMBERS. e.g. ["1234567890"]. MUST NOT use names!
   - contentIds: [String] — array of content ID strings
   - To UPDATE an existing class, include _id in the body.
4. When the user says "delete all classrooms", plan to GET /class/ first, then output a single DELETE step
   with path "/class/{{step1.data[]}}" and set "forEach": true. The system will loop over each item.
5. NEVER plan to create, add, edit, or delete a student. No such route exists for this user.
   If the user asks to add a new (non-existing) student, set this is unmappable.
   Only reference students already present in the DB context (by their phone number).
6. If the command truly cannot be mapped to any route, return:
   { "error": "I could not understand that command. Please try again." }
7. NEVER set "needsInput": true if the data can be resolved from a previous step. Always chain steps.
8. CONTENT PLAYBACK: "play X", "find X", "show X content" → The frontend handles audio playback.
   - If the MATCHING CONTENT FROM DATABASE section has a real _id, use GET /content/<real_id>
   - If no DB match, use GET /content/?expName=X as fallback.
   - Do NOT use /call/conference/create for content playback. Conference calls are ONLY for "start a call/conference".
9. For general commands, when TEACHER'S CLASSES FROM DATABASE provides real class _ids, use them directly instead of chaining a GET /class/ step.
10. CONFERENCE CALLS use a 3-step fetch-create-start flow:
    - Step 1: ALWAYS fetch the classroom first via GET /class/<id> (this is mandatory so the frontend UI can auto-navigate to the classroom).
    - Step 2: POST /call/conference/create
    - Step 3: POST /call/conference/start/{{step2.data.id}}
    The DB context includes student names and phone numbers for each class — use them directly to build student_phones and student_names arrays.
    Phone numbers do NOT need "91" prefix — the backend normalizes them automatically.

═══ COMMON MULTI-STEP EXAMPLES ═══

Example 1: "Delete all classrooms"
{ "commands": [
  { "method": "GET", "path": "/class/", "body": null, "description": "Fetch all classes" },
  { "method": "DELETE", "path": "/class/{{step1.data[]._id}}", "body": null, "description": "Delete each class", "forEach": true }
] }

Example 2: "Add student studentA to Grade 10" (assuming studentA's phone is 9112233445)
{ "commands": [
  { "method": "GET", "path": "/class/", "body": null, "description": "Fetch all classes to find Grade 10" },
  { "method": "GET", "path": "/class/{{step1.data[name=Grade 10]._id}}", "body": null, "description": "Get full details of Grade 10 class" },
  { "method": "POST", "path": "/class/", "body": { "_id": "{{step2.data._id}}", "name": "{{step2.data.name}}", "students": "{{step2.data.students+9112233445}}", "leaders": "{{step2.data.leaders}}", "contentIds": "{{step2.data.contentIds}}" }, "description": "Update Grade 10 to add student studentA" }
] }

Example 3: "Assign studentA as leader for Grade 7" (assuming studentA's phone is 9112233445)
{ "commands": [
  { "method": "GET", "path": "/class/", "body": null, "description": "Fetch all classes to find Grade 7" },
  { "method": "GET", "path": "/class/{{step1.data[name=Grade 7]._id}}", "body": null, "description": "Get full details of Grade 7 class" },
  { "method": "POST", "path": "/class/", "body": { "_id": "{{step2.data._id}}", "name": "{{step2.data.name}}", "students": "{{step2.data.students}}", "leaders": "{{step2.data.leaders+9112233445}}", "contentIds": "{{step2.data.contentIds}}" }, "description": "Update Grade 7 to assign studentA as leader" }
] }

Example 4: "Start a conference for Grade 7" (DB context has class with students: [{name: "Ananya", phone: "9112233445"}, {name: "Balaji", phone: "9887766554"}])
{ "commands": [
  { "method": "GET", "path": "/class/{{step1.data[name=Grade 7]._id}}", "body": null, "description": "Fetch classroom details" },
  { "method": "POST", "path": "/call/conference/create", "body": { "teacher_phone": "{{phoneNumber}}", "teacher_name": "{{teacherName}}", "student_phones": ["9112233445", "9887766554"], "student_names": ["Ananya", "Balaji"] }, "description": "Create conference for Grade 7 students" },
  { "method": "POST", "path": "/call/conference/start/{{step2.data.id}}", "body": null, "description": "Start the conference call" }
] }

Example 5: "Start a call for Grade 7 and then mute everyone" (chained: create → start → mute)
{ "commands": [
  { "method": "GET", "path": "/class/{{step1.data[name=Grade 7]._id}}", "body": null, "description": "Fetch classroom details" },
  { "method": "POST", "path": "/call/conference/create", "body": { "teacher_phone": "{{phoneNumber}}", "teacher_name": "{{teacherName}}", "student_phones": ["9112233445"], "student_names": ["Ananya"] }, "description": "Create conference for Grade 7" },
  { "method": "POST", "path": "/call/conference/start/{{step2.data.id}}", "body": null, "description": "Start the conference" },
  { "method": "PUT", "path": "/call/conference/muteall/{{step2.data.id}}", "body": null, "description": "Mute all participants" }
] }

Example 5b: "Start a conference for Grade 7 with Ananya as leader" (DB context: Ananya phone "9112233445", Balaji phone "9887766554")
{ "commands": [
  { "method": "GET", "path": "/class/{{step1.data[name=Grade 7]._id}}", "body": null, "description": "Fetch classroom details" },
  { "method": "POST", "path": "/call/conference/create", "body": { "teacher_phone": "{{phoneNumber}}", "teacher_name": "{{teacherName}}", "student_phones": ["9112233445", "9887766554"], "student_names": ["Ananya", "Balaji"], "leader_phone": "9112233445" }, "description": "Create conference for Grade 7 with Ananya as leader" },
  { "method": "POST", "path": "/call/conference/start/{{step2.data.id}}", "body": null, "description": "Start the conference" }
] }

Example 6: "Create classroom Grade 10 and add student studentA" (assuming studentA's phone is 9112233445)
{ "commands": [
  { "method": "POST", "path": "/class/", "body": { "name": "Grade 10", "students": ["9112233445"], "leaders": [], "contentIds": [] }, "description": "Create classroom Grade 10 with student studentA" }
] }

Example 7: "End the active conference" (assuming activeConferenceId is conf-1234)
{ "commands": [
  { "method": "PUT", "path": "/call/conference/end/conf-1234", "body": null, "description": "End the currently active conference call" }
] }

Example 8: "Play keats poem" (content playback — just fetch, frontend plays)
{ "commands": [
  { "method": "GET", "path": "/content/?expName=keats%20poem", "body": null, "description": "Fetch keats poem content for playback" }
] }

═══ END EXAMPLES ═══
`;

// Build a name hint from the teacher's class + student names. Retained for
// callers/compat, but Azure short-audio STT REST cannot consume it (no phrase
// bias param) — proper-noun disambiguation now happens in the reasoning LLM.
exports.buildTranscriptionHint = async function buildTranscriptionHint(userInfo = {}) {
  try {
    const [classes, students] = await Promise.all([
      userInfo.userId
        ? ClassRoom.find({ teacher: userInfo.userId }).select("name").lean().exec()
        : [],
      userInfo.schoolId
        ? Student.find({ schoolId: userInfo.schoolId }).select("name").lean().exec()
        : [],
    ]);
    const names = [
      ...classes.map((c) => c.name),
      ...students.map((s) => s.name),
    ].filter(Boolean);
    if (names.length === 0) return "";
    return `Names that may be mentioned: ${[...new Set(names)].join(", ")}.`;
  } catch {
    return "";
  }
};

// ── Transcribe audio using Azure Speech-to-Text (REST short audio) ───────────
// NOTE: Azure short-audio REST has no prompt/phrase-bias param (unlike Whisper),
// so `promptHint` is accepted for signature compatibility but not used. Name
// disambiguation is handled downstream by the reasoning LLM (phonetic matching
// against the students DB context). PhraseListGrammar via the Speech SDK could
// restore STT-level biasing if accuracy on proper nouns proves insufficient.
exports.transcribeAudio = async function transcribeAudio(audioBuffer, mimetype, promptHint = "") {
  if (!AZURE_KEY || !AZURE_STT_URL) {
    throw new Error("Azure Speech not configured (TTS_REGION / TTS_SUBSCRIPTION_KEY missing)");
  }

  const pcm = await decodeToPcm(audioBuffer);
  const wav = pcmToWav(pcm);

  const { data } = await axios.post(AZURE_STT_URL, wav, {
    headers: {
      "Ocp-Apim-Subscription-Key": AZURE_KEY,
      "Content-Type": "audio/wav; codecs=audio/pcm; samplerate=16000",
      Accept: "application/json",
    },
    maxContentLength: Infinity,
    maxBodyLength: Infinity,
    timeout: 20000,
  });

  // Azure returns { RecognitionStatus, DisplayText, Offset, Duration }
  if (data.RecognitionStatus !== "Success") {
    console.warn("[meta] Azure STT non-success status:", data.RecognitionStatus);
    return "";
  }
  return data.DisplayText || "";
};

// ── Build prompt with user info ──────────────────────────────────────────────
function buildPrompt(template, userInfo, extras = {}) {
  let prompt = template
    .replace(/{{phoneNumber}}/g, userInfo.phoneNumber || "unknown")
    .replace(/{{teacherName}}/g, userInfo.name || "Teacher")
    .replace(/{{tenantId}}/g, userInfo.tenantId || "unknown")
    .replace(/{{userId}}/g, userInfo.userId || "unknown")
    .replace(/{{activeConferenceId}}/g, userInfo.activeConferenceId || "none")
    .replace(/{{currentClassId}}/g, userInfo.currentClassId || "none");

  for (const [key, value] of Object.entries(extras)) {
    prompt = prompt.replace(`{{${key}}}`, typeof value === "string" ? value : JSON.stringify(value, null, 2));
  }

  return prompt;
}

// ── Call LLM helper ──────────────────────────────────────────────────────────
async function callLLM(systemPrompt, userMessage) {
  if (!azureOpenAiClient) {
    throw new Error("Azure OpenAI is not configured (azureOpenAiKey or azureOpenAiEndpoint missing)");
  }
  if (!azureOpenAiModel) {
    throw new Error("Azure OpenAI model deployment is not configured (azureOpenAiModel missing)");
  }

  try {
    const response = await azureOpenAiClient.chat.completions.create({
      model: azureOpenAiModel,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      temperature: 0,
      response_format: { type: "json_object" },
    });

    const raw = response.choices[0].message.content;
    return JSON.parse(raw);
  } catch (err) {
    if (err.status === 429) {
      const retryAfterHeader = err.headers?.["retry-after"] || err.headers?.["x-ratelimit-reset"];
      const retryAfter = retryAfterHeader ? parseInt(retryAfterHeader, 10) : 5;
      console.log(`[meta] Azure OpenAI rate limited, retrying in ${retryAfter}s...`);
      await new Promise((r) => setTimeout(r, retryAfter * 1000));
      return callLLM(systemPrompt, userMessage);
    }
    console.error("[meta] Azure OpenAI SDK error:", err);
    throw err;
  }
}

// Render the last few conversation turns (from userInfo.history) into a prompt block.
function formatHistory(history) {
  if (!Array.isArray(history) || history.length === 0) {
    return "RECENT CONVERSATION: (none — this is the first command)";
  }
  const lines = history
    .slice(-2)
    .map((h, i) => {
      const user = (h.transcript || h.command || "").trim();
      const assistant = (h.spokenSummary || h.response || "").trim();
      return `${i + 1}. User: "${user}"${assistant ? `\n   Assistant: "${assistant}"` : ""}`;
    })
    .join("\n");
  return `RECENT CONVERSATION (oldest first, for resolving references only):\n${lines}`;
}

// ── Phase 1: Reason about the command ────────────────────────────────────────
exports.reasonAboutCommand = async function reasonAboutCommand(transcript, userInfo = {}) {
  // Pre-fetch relevant data from MongoDB
  const dbResults = await fetchContextFromDB(transcript, userInfo);
  const dbContext = formatDBContext(dbResults);
  console.log("[meta] DB context:", dbContext);

  const history = formatHistory(userInfo.history);
  const systemPrompt = buildPrompt(REASONING_PROMPT, userInfo, { dbContext, history });
  return callLLM(systemPrompt, `User command: "${transcript}"`);
};

// ── Phase 2: Plan the command sequence (informed by reasoning) ───────────────
exports.planCommands = async function planCommands(transcript, userInfo = {}, reasoning = null) {
  // Pre-fetch relevant data from MongoDB for context
  const dbResults = await fetchContextFromDB(transcript, userInfo);
  const dbContext = formatDBContext(dbResults);

  const extras = {
    reasoning: reasoning ? JSON.stringify(reasoning, null, 2) : "(no reasoning provided)",
    dbContext,
    history: formatHistory(userInfo.history),
  };
  const systemPrompt = buildPrompt(PLANNING_PROMPT, userInfo, extras);
  return callLLM(systemPrompt, `User command: "${transcript}"`);
};

function formatDBContext(dbResults) {
  const sections = [];

  if (dbResults.content.length > 0) {
    sections.push(
      "═══ MATCHING CONTENT FROM DATABASE ═══\n" +
      "Use these REAL content IDs when the user asks to play/find content:\n" +
      dbResults.content.map((c) =>
        `  - _id: "${c._id}" | title: "${c.title}" | type: ${c.type} | lang: ${c.language} | theme: ${c.theme}`
      ).join("\n") +
      "\n═══ END CONTENT ═══"
    );
  }

  if (dbResults.classes.length > 0) {
    sections.push(
      "═══ TEACHER'S CLASSES FROM DATABASE ═══\n" +
      "Each class includes populated student/leader details (name + phone) for conference calls.\n" +
      dbResults.classes.map((c) =>
        `  - _id: "${c._id}" | name: "${c.name}" | students: ${JSON.stringify(c.students)} | leaders: ${JSON.stringify(c.leaders)}`
      ).join("\n") +
      "\n═══ END CLASSES ═══"
    );
  }

  if (dbResults.students && dbResults.students.length > 0) {
    sections.push(
      "═══ TEACHER'S EXISTING STUDENTS ═══\n" +
      "When adding a student or leader to a class, use ONLY these mapped PHONE NUMBERS.\n" +
      "The requested name comes from speech transcription and may be misspelled or mangled by accent " +
      "(e.g. \"Phonet\" -> \"Punit\", \"Smart phone\" -> \"smartphone\"). Match the requested name to the " +
      "CLOSEST student below by phonetic/spelling similarity and use that student's phone. " +
      "Only refuse if no student is a reasonably close match:\n" +
      dbResults.students.map((s) => `  - name: "${s.name}" | phone: "${s.phone}"`).join("\n") +
      "\n═══ END STUDENTS ═══"
    );
  }

  return sections.length > 0 ? sections.join("\n\n") : "(no matching data found in database)";
}

// ── Normalize LLM plan into an array of commands ─────────────────────────────
exports.normalizePlan = function normalizePlan(plan) {
  if (plan.error) return { error: plan.error };
  const commands = Array.isArray(plan) ? plan : plan.commands || plan.steps || [plan];
  // With reasoning phase, we can auto-resolve most things, so only flag needsInput
  // if the plan genuinely can't be completed.
  const needsInput = commands.some((c) => c.needsInput);
  return { commands, needsInput };
};

// ── Execute planned commands against own backend ─────────────────────────────
exports.executeCommands = async function executeCommands(commands, authToken, baseUrl) {
  const results = [];
  const context = {};

  for (let i = 0; i < commands.length; i++) {
    const cmd = commands[i];
    try {
      console.log(`[meta] Resolving step ${i + 1}: ${cmd.description}`);

      // Resolve placeholders in path and body
      const resolvedPath = resolvePlaceholders(cmd.path, context);
      const resolvedBody = resolvePlaceholders(cmd.body, context);



      // Handle forEach — repeat this step for each item in the referenced array
      if (cmd.forEach) {
        const forEachResults = await executeForEach(cmd, resolvedPath, resolvedBody, authToken, baseUrl, context, i);
        results.push(...forEachResults);
        context[`step${i + 1}`] = { data: forEachResults.map((r) => r.data), status: 200 };
        continue;
      }

      // NAVIGATE is a frontend-only pseudo-command (no HTTP). The frontend reads
      // it from the results and routes there. Return a synthetic success.
      if (cmd.method === "NAVIGATE") {
        const result = { step: cmd.description, status: 200, data: { navigate: resolvedPath } };
        results.push(result);
        context[`step${i + 1}`] = result;
        continue;
      }

      const url = `${baseUrl}${resolvedPath}`;
      const headers = { Authorization: `Bearer ${authToken}`, "Content-Type": "application/json" };

      const response = await axios({
        method: cmd.method.toLowerCase(),
        url,
        data: resolvedBody || undefined,
        headers,
        timeout: 15000,
      });

      const result = {
        step: cmd.description,
        status: response.status,
        data: response.data,
      };
      results.push(result);
      context[`step${i + 1}`] = result;
    } catch (err) {
      const errorResult = {
        step: cmd.description,
        status: err.response?.status || 500,
        error: err.response?.data?.message || err.message,
      };
      results.push(errorResult);
      context[`step${i + 1}`] = errorResult;
    }
  }

  return results;
};

// ── Execute a forEach step — loops over items from a previous step ───────────
async function executeForEach(cmd, resolvedPath, resolvedBody, authToken, baseUrl, context, stepIndex) {
  // Find which step's data to iterate over by parsing the path for {{stepN.data[]...}}
  const forEachMatch = cmd.path.match(/{{step(\d+)\.data\[\]\.(\w+)}}/);
  if (!forEachMatch) {
    // Fallback: the path was already partially resolved — can't loop
    console.log(`[meta] forEach step ${stepIndex + 1}: could not determine iteration source`);
    return [{ step: cmd.description, status: 400, error: "Could not determine forEach source" }];
  }

  const sourceStepNum = forEachMatch[1];
  const fieldName = forEachMatch[2];
  const sourceData = context[`step${sourceStepNum}`]?.data;

  if (!Array.isArray(sourceData)) {
    return [{ step: cmd.description, status: 400, error: "forEach source is not an array" }];
  }

  const results = [];
  for (const item of sourceData) {
    const itemValue = item[fieldName];
    if (!itemValue) continue;

    // Replace the forEach placeholder in the original path
    const itemPath = cmd.path.replace(/{{step\d+\.data\[\]\.\w+}}/g, itemValue);
    const url = `${baseUrl}${itemPath}`;
    const headers = { Authorization: `Bearer ${authToken}`, "Content-Type": "application/json" };

    try {
      const response = await axios({
        method: cmd.method.toLowerCase(),
        url,
        data: resolvedBody || undefined,
        headers,
        timeout: 15000,
      });
      results.push({
        step: `${cmd.description} (${item.name || itemValue})`,
        status: response.status,
        data: response.data,
      });
    } catch (err) {
      results.push({
        step: `${cmd.description} (${item.name || itemValue})`,
        status: err.response?.status || 500,
        error: err.response?.data?.message || err.message,
      });
    }
  }

  return results;
}

// ── Resolve placeholders in paths/bodies ─────────────────────────────────────
function resolvePlaceholders(target, context) {
  if (!target) return target;

  if (typeof target === "string") {
    // 1. Handle <CALL_ID>
    if (target.includes("<CALL_ID>")) {
      target = target.replace(/<CALL_ID>/g, `Conf_${Math.random().toString(36).substring(2, 10).toUpperCase()}`);
    }

    // 2. Handle {{stepN.data.field+value}} (append to array)
    const appendRegex = /{{step(\d+)\.data\.(\w+)\+([^}]+)}}/g;
    target = target.replace(appendRegex, (match, stepNum, field, valueToAdd) => {
      const stepData = context[`step${stepNum}`]?.data;
      if (!stepData) return match;
      const arr = Array.isArray(stepData[field]) ? [...stepData[field]] : [];
      arr.push(valueToAdd);
      return JSON.stringify(arr);
    });

    // 3. Handle {{stepN.data.field}} (simple field access)
    const simpleFieldRegex = /{{step(\d+)\.data\.(\w+)}}/g;
    target = target.replace(simpleFieldRegex, (match, stepNum, field) => {
      const stepData = context[`step${stepNum}`]?.data;
      if (!stepData) return match;
      const value = stepData[field];
      if (value === undefined) return match;
      if (Array.isArray(value)) return JSON.stringify(value);
      return String(value);
    });

    // 4. Handle {{stepN.data[key=value].field}} (array search)
    const searchRegex = /{{step(\d+)\.data\[(\w+)=([^\]]+)\]\.(\w+)}}/g;
    target = target.replace(searchRegex, (match, stepNum, key, value, field) => {
      const stepData = context[`step${stepNum}`]?.data;
      if (!stepData || !Array.isArray(stepData)) return match;
      const found = stepData.find((item) => String(item[key]).toLowerCase() === value.toLowerCase());
      if (!found) return match;
      return String(found[field]);
    });

    // 5. Handle {{stepN.data}} (full data reference)
    const fullDataRegex = /{{step(\d+)\.data}}/g;
    target = target.replace(fullDataRegex, (match, stepNum) => {
      const stepData = context[`step${stepNum}`]?.data;
      if (!stepData) return match;
      return JSON.stringify(stepData);
    });

    // 6. Handle {{phoneNumber}} leftover (user context, already in body from LLM)
    // These should already be resolved in the prompt, but just in case
    return target;
  }

  if (Array.isArray(target)) {
    return target.map((item) => resolvePlaceholders(item, context));
  }

  if (typeof target === "object") {
    const resolved = {};
    for (const key in target) {
      const val = resolvePlaceholders(target[key], context);
      // If a string value looks like a JSON array, parse it back
      if (typeof val === "string" && val.startsWith("[") && val.endsWith("]")) {
        try {
          resolved[key] = JSON.parse(val);
        } catch {
          resolved[key] = val;
        }
      } else {
        resolved[key] = val;
      }
    }
    return resolved;
  }

  return target;
}

// ── TTS Summary prompt — generates spoken text from execution results ────────
const TTS_SUMMARY_PROMPT = `
You are a friendly voice assistant for the SEEDS education platform.
Given a user's original command and the execution results, generate a SHORT spoken summary
that will be read aloud to the user via text-to-speech.

RULES:
1. Be conversational and natural — as if speaking to a teacher.
2. Keep it to 1-2 sentences maximum.
3. Mention specific names, counts, or key data from the results.
4. If the command failed, briefly explain what went wrong using simple, non-technical terms (e.g., say "I couldn't find the class" instead of "Status 404" or "API error").
5. Explain successes in simple terms as well. Avoid using technical jargon like "JSON", "payload", "Server", or "Database".
6. Do NOT use markdown, bullet points, or any formatting — just plain spoken text.
7. Do NOT say "Here are your results" or similar generic phrases. Be specific.
8. CRITICAL: For content playback commands ("play X", "show X"), if the step was SUCCESS, the system is ALREADY playing it for the user! Do NOT claim you cannot play it or check for media fields. Simply say you are playing it now.
9. NEVER speak raw IDs, database identifiers, ObjectIds, or hex/UUID-like strings (e.g. "6a2a5f7bb1ff8304cade8735"). Refer to things by their human name only. Do NOT say "with ID ..." or read out any identifier.
10. CRITICAL — describe ONLY actions that actually appear as SUCCESS steps above. Do NOT claim an action happened unless a step performed it. Example: only say "I've started the conference call" if a step that STARTS the call (e.g. "Start the conference") succeeded. If the only step was fetching/loading the class, say you've opened or pulled up the class — NOT that you started a call. Never invent steps that are absent from the results.
11. CONTENT LIBRARY: If a step fetched a list of content items (GET /content/ with no expName filter), the content drawer is already open on screen. Tell the user the names of the available items (up to 5) and invite them to choose one to play.

RESPOND WITH JSON:
{
  "spokenText": "your spoken summary here"
}

IMPORTANT: Only return valid JSON. No markdown.
`;

// ── Phase 4: Generate spoken summary for TTS ─────────────────────────────────
exports.generateSpokenSummary = async function generateSpokenSummary(transcript, results) {
  const resultsContext = results
    .map((r, i) => {
      if (r.error) return `Step ${i + 1} (${r.step}): FAILED — ${r.error}`;
      // Unwrap paginated content responses { data: [...], pagination }
      const items = Array.isArray(r.data) ? r.data : Array.isArray(r.data?.data) ? r.data.data : null;
      const dataSummary = items
        ? `returned ${items.length} items: ${items.slice(0, 5).map(d => d.name || d.title?.english || d._id || JSON.stringify(d)).join(", ")}`
        : typeof r.data === "object" && r.data
          ? `returned: ${JSON.stringify(r.data).substring(0, 200)}`
          : `status ${r.status}`;
      return `Step ${i + 1} (${r.step}): SUCCESS — ${dataSummary}`;
    })
    .join("\n");

  const userMessage = `User command: "${transcript}"\n\nExecution results:\n${resultsContext}`;
  return callLLM(TTS_SUMMARY_PROMPT, userMessage);
};

// ── Azure Text-to-Speech — convert text to MP3 audio (base64) ────────────────
function escapeXml(s) {
  return String(s).replace(/[<>&'"]/g, (c) =>
    ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c])
  );
}

exports.synthesizeSpeech = async function synthesizeSpeech(text) {
  if (!AZURE_KEY || !AZURE_TTS_URL) {
    console.warn("[meta] Azure Speech not configured (TTS_REGION / TTS_SUBSCRIPTION_KEY), skipping TTS");
    return null;
  }

  const locale = AZURE_TTS_VOICE.split("-").slice(0, 2).join("-"); // e.g. "en-US"
  const ssml =
    `<speak version='1.0' xml:lang='${locale}'>` +
    `<voice xml:lang='${locale}' name='${AZURE_TTS_VOICE}'>${escapeXml(text)}</voice>` +
    `</speak>`;

  try {
    const response = await axios.post(AZURE_TTS_URL, ssml, {
      headers: {
        "Ocp-Apim-Subscription-Key": AZURE_KEY,
        "Content-Type": "application/ssml+xml",
        // Frontend plays `data:audio/mp3;base64,...` → emit MP3.
        "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3",
        "User-Agent": "seeds-teacher-backend",
      },
      responseType: "arraybuffer",
      timeout: 30000,
    });

    return Buffer.from(response.data).toString("base64");
  } catch (err) {
    const detail = err.response?.data ? Buffer.from(err.response.data).toString() : err.message;
    console.error("[meta] Azure TTS error:", detail);
    return null;
  }
};
