"use strict";
const axios = require("axios");
const FormData = require("form-data");
const { ContentV3 } = require("../models/ContentV3");
const ClassRoom = require("../models/Class");
const teacherService = require("./teacher.service");
const { murfApiKey, groqApiKey, sttModel, llm } = require("../config/env");

const GROQ_API_KEY = groqApiKey;
const MURF_API_KEY = murfApiKey;
const STT_MODEL = sttModel || "whisper-large-v3-turbo";
const LLM = llm || "llama-3.3-70b-versatile";
const GROQ_BASE = "https://api.groq.com/openai/v1";
const MURF_API_URL = "https://api.murf.ai/v1/speech/stream";

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
      .lean()
      .exec(),
    teacherService.getStudents({ phoneNumber: userInfo.phoneNumber, tenantId: userInfo.tenantId }).catch(() => [])
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
      studentCount: c.students?.length || 0,
      leaders: c.leaders || [],
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
- Tenant ID: {{tenantId}}
- User ID: {{userId}}

═══ CRITICAL: CONTENT PLAYBACK vs CONFERENCE CALLS ═══
- "play", "show", "find", "get" content → Just fetch it with GET /content/?expName=... 
  The FRONTEND handles playback. You only need to return the content data.
  This is ALWAYS a single GET request. canAutoResolve is ALWAYS true.
- "start a call", "start a conference" → Use POST /call/start (this is different!)
Do NOT confuse these. "Play keats poem" = GET /content/?expName=keats poem. That's it.
═══ END CRITICAL ═══

AVAILABLE API ROUTES (summary):
- GET /class/ → returns array of classes [{_id, name, teacher, students, leaders, contentIds}]
- GET /class/:classId → single class
- POST /class/ → create/update class. Body: {name, students: [String], leaders: [String], contentIds: [String], _id?}
  If _id is provided, it UPDATES the existing class. If no _id, it CREATES a new class.
  IMPORTANT: students and leaders are arrays of STRINGS (names or phone numbers), NOT arrays of objects!
- DELETE /class/:classId → delete a class

- POST /v1/teacher/students → body: {phoneNumber} → get students for teacher
- POST /v1/teacher/add-students → body: {phoneNumber, students: [{name, phone_number}]}
- DELETE /v1/teacher/students → body: {phoneNumber, students: [{phoneNumber}]}

- GET /content/ → query: language, theme, expName, ids, limit, cursor
  "play X" or "find X" → GET /content/?expName=X (frontend handles playback)
- GET /content/:contentId → single content
- GET /content/themes → query: language

- GET /teacher/me → current teacher info

- POST /call/start → body: {from, to, callId} → start conference (ONLY for "start call/conference" commands)
- GET /call/accessToken → conference access token

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
  "unresolvedNote": "if canAutoResolve is false, explain what can't be resolved"
}

IMPORTANT: Only return valid JSON. No markdown.
`;

// ── Planning prompt — produces executable API calls, informed by reasoning ───
const PLANNING_PROMPT = `
You are a command planner for the SEEDS education platform backend.
You have already reasoned about the user's command. Now produce the exact API calls.

CURRENT USER CONTEXT:
- Phone number: {{phoneNumber}}
- Tenant ID: {{tenantId}}
- User ID: {{userId}}

REASONING FROM PREVIOUS STEP:
{{reasoning}}

{{dbContext}}

Now produce a JSON array of API calls to execute IN ORDER.

Each element must have:
  - "method": HTTP method (GET, POST, PATCH, DELETE)
  - "path": the full API path
  - "body": request body object (null if not needed)
  - "description": short description of what this step does

CRITICAL RULES:
1. Only return valid JSON. No markdown, no explanation.
2. CHAIN STEPS using variable references: {{stepN.data...}} to avoid placeholder <ID>.
   - {{step1.data}} = the full response data from step 1
   - {{step1.data[name=Grade 7]._id}} = find item named "Grade 7" in array, get _id
   - {{step1.data._id}} = get _id from step 1 result
3. For conference calls, use "<CALL_ID>" for callId (auto-generated).
4. SCHEMA RULES for /class/ POST:
   - students: [String] — array of existing student PHONE NUMBERS. e.g. ["9717503152"]. MUST NOT use names!
   - leaders: [String] — array of existing student PHONE NUMBERS. e.g. ["9717503152"]. MUST NOT use names!
   - contentIds: [String] — array of content ID strings
   - To UPDATE an existing class, include _id in the body.
5. When the user says "delete all classrooms", plan to GET /class/ first, then output a single DELETE step
   with path "/class/{{step1.data[]}}" and set "forEach": true. The system will loop over each item.
6. For /v1/teacher/students and /v1/teacher/add-students, phoneNumber in body is REQUIRED — use current user's phone.
7. If the command truly cannot be mapped to any route, return:
   { "error": "I could not understand that command. Please try again." }
8. NEVER set "needsInput": true if the data can be resolved from a previous step. Always chain steps.
9. CONTENT PLAYBACK: "play X", "find X", "show X content" → The frontend handles audio playback.
   - If the MATCHING CONTENT FROM DATABASE section has a real _id, use GET /content/<real_id>
   - If no DB match, use GET /content/?expName=X as fallback.
   - Do NOT use /call/start for content playback. Conference calls are ONLY for "start a call/conference".
10. When TEACHER'S CLASSES FROM DATABASE provides real class _ids, use them directly instead of chaining a GET /class/ step.

═══ COMMON MULTI-STEP EXAMPLES ═══

Example 1: "Delete all classrooms"
[
  { "method": "GET", "path": "/class/", "body": null, "description": "Fetch all classes" },
  { "method": "DELETE", "path": "/class/{{step1.data[]._id}}", "body": null, "description": "Delete each class", "forEach": true }
]

Example 2: "Add student studentA to Grade 10" (assuming studentA's phone is 9876543210)
[
  { "method": "GET", "path": "/class/", "body": null, "description": "Fetch all classes to find Grade 10" },
  { "method": "GET", "path": "/class/{{step1.data[name=Grade 10]._id}}", "body": null, "description": "Get full details of Grade 10 class" },
  { "method": "POST", "path": "/class/", "body": { "_id": "{{step2.data._id}}", "name": "{{step2.data.name}}", "students": "{{step2.data.students+9876543210}}", "leaders": "{{step2.data.leaders}}", "contentIds": "{{step2.data.contentIds}}" }, "description": "Update Grade 10 to add student studentA" }
]

Example 3: "Assign studentA as leader for Grade 7" (assuming studentA's phone is 9876543210)
[
  { "method": "GET", "path": "/class/", "body": null, "description": "Fetch all classes to find Grade 7" },
  { "method": "GET", "path": "/class/{{step1.data[name=Grade 7]._id}}", "body": null, "description": "Get full details of Grade 7 class" },
  { "method": "POST", "path": "/class/", "body": { "_id": "{{step2.data._id}}", "name": "{{step2.data.name}}", "students": "{{step2.data.students}}", "leaders": "{{step2.data.leaders+9876543210}}", "contentIds": "{{step2.data.contentIds}}" }, "description": "Update Grade 7 to assign studentA as leader" }
]

Example 4: "Start a conference for Grade 7"
[
  { "method": "GET", "path": "/class/", "body": null, "description": "Fetch all classes to find Grade 7" },
  { "method": "POST", "path": "/call/start", "body": { "from": "{{phoneNumber}}", "to": "{{step1.data[name=Grade 7]._id}}", "callId": "<CALL_ID>" }, "description": "Start conference call for Grade 7" }
]

Example 5: "Create classroom Grade 10 and add student studentA" (assuming studentA's phone is 9876543210)
[
  { "method": "POST", "path": "/class/", "body": { "name": "Grade 10", "students": ["9876543210"], "leaders": [], "contentIds": [] }, "description": "Create classroom Grade 10 with student studentA" }
]

Example 6: "Play keats poem" (content playback — just fetch, frontend plays)
[
  { "method": "GET", "path": "/content/?expName=keats%20poem", "body": null, "description": "Fetch keats poem content for playback" }
]

═══ END EXAMPLES ═══
`;

// ── Transcribe audio using Groq Whisper ──────────────────────────────────────
exports.transcribeAudio = async function transcribeAudio(audioBuffer, mimetype) {
  const form = new FormData();
  form.append("file", audioBuffer, {
    filename: "audio.webm",
    contentType: mimetype || "audio/webm",
  });
  form.append("model", STT_MODEL);
  form.append("language", "en");

  const { data } = await axios.post(`${GROQ_BASE}/audio/transcriptions`, form, {
    headers: {
      Authorization: `Bearer ${GROQ_API_KEY}`,
      ...form.getHeaders(),
    },
    maxContentLength: Infinity,
    maxBodyLength: Infinity,
  });

  return data.text;
};

// ── Build prompt with user info ──────────────────────────────────────────────
function buildPrompt(template, userInfo, extras = {}) {
  let prompt = template
    .replace(/{{phoneNumber}}/g, userInfo.phoneNumber || "unknown")
    .replace(/{{tenantId}}/g, userInfo.tenantId || "unknown")
    .replace(/{{userId}}/g, userInfo.userId || "unknown");

  for (const [key, value] of Object.entries(extras)) {
    prompt = prompt.replace(`{{${key}}}`, typeof value === "string" ? value : JSON.stringify(value, null, 2));
  }

  return prompt;
}

// ── Call LLM helper ──────────────────────────────────────────────────────────
async function callLLM(systemPrompt, userMessage) {
  const { data } = await axios.post(
    `${GROQ_BASE}/chat/completions`,
    {
      model: LLM,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      temperature: 0,
      response_format: { type: "json_object" },
    },
    {
      headers: {
        Authorization: `Bearer ${GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
    }
  );

  const raw = data.choices[0].message.content;
  return JSON.parse(raw);
}

// ── Phase 1: Reason about the command ────────────────────────────────────────
exports.reasonAboutCommand = async function reasonAboutCommand(transcript, userInfo = {}) {
  // Pre-fetch relevant data from MongoDB
  const dbResults = await fetchContextFromDB(transcript, userInfo);
  const dbContext = formatDBContext(dbResults);
  console.log("[meta] DB context:", dbContext);

  const systemPrompt = buildPrompt(REASONING_PROMPT, userInfo, { dbContext });
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
      dbResults.classes.map((c) =>
        `  - _id: "${c._id}" | name: "${c.name}" | students: ${c.studentCount} | leaders: [${c.leaders.join(", ")}]`
      ).join("\n") +
      "\n═══ END CLASSES ═══"
    );
  }

  if (dbResults.students && dbResults.students.length > 0) {
    sections.push(
      "═══ TEACHER'S EXISTING STUDENTS ═══\n" +
      "When adding a student or leader to a class, ONLY use these exact mapped PHONE NUMBERS if they match the requested name:\n" +
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
4. If the command failed, briefly explain what went wrong.
5. Do NOT use markdown, bullet points, or any formatting — just plain spoken text.
6. Do NOT say "Here are your results" or similar generic phrases. Be specific.
7. CRITICAL: For content playback commands ("play X", "show X"), if the step was SUCCESS, the system is ALREADY playing it for the user! Do NOT claim you cannot play it or check for media fields. Simply say you are playing it now.

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
      const dataSummary = Array.isArray(r.data)
        ? `returned ${r.data.length} items: ${r.data.slice(0, 5).map(d => d.name || d.title?.english || d._id || JSON.stringify(d)).join(", ")}`
        : typeof r.data === "object" && r.data
          ? `returned: ${JSON.stringify(r.data).substring(0, 200)}`
          : `status ${r.status}`;
      return `Step ${i + 1} (${r.step}): SUCCESS — ${dataSummary}`;
    })
    .join("\n");

  const userMessage = `User command: "${transcript}"\n\nExecution results:\n${resultsContext}`;
  return callLLM(TTS_SUMMARY_PROMPT, userMessage);
};

// ── Murf.ai TTS synthesis — convert text to audio ────────────────────────────
exports.synthesizeSpeech = async function synthesizeSpeech(text) {
  if (!MURF_API_KEY) {
    console.warn("[meta] MURF_API_KEY not set, skipping TTS synthesis");
    return null;
  }

  try {
    const response = await axios.post(
      MURF_API_URL,
      {
        text,
        voiceId: "Matthew",
        model: "FALCON",
        locale: "en-US",
      },
      {
        headers: {
          "Content-Type": "application/json",
          "api-key": MURF_API_KEY,
        },
        responseType: "arraybuffer",
        timeout: 30000,
      }
    );

    const audioBuffer = Buffer.from(response.data);
    return audioBuffer.toString("base64");
  } catch (err) {
    console.error("[meta] Murf.ai TTS error:", err.message);
    return null;
  }
};
