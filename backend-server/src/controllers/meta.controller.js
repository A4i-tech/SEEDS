"use strict";
const metaService = require("../services/meta.service");

function getBaseUrl(req) {
  return `${req.protocol}://${req.get("host")}`;
}

function getUserInfo(req, context = {}) {
  return {
    phoneNumber: req.user?.phoneNumber,
    tenantId: req.tenantId,
    userId: req.userId,
    schoolId: req.schoolId,
    name: req.user?.name || "Teacher",
    ...context,
  };
}

function getAuthToken(req) {
  return req.headers.authorization?.split(" ")[1];
}

// ── Shared logic: reason → plan → execute ────────────────────────────────────
async function processCommand(transcript, req, context = {}) {
  const userInfo = getUserInfo(req, context);

  // Phase 1: Reason about the command
  console.log("[meta] Phase 1: Reasoning about command...");
  const reasoning = await metaService.reasonAboutCommand(transcript, userInfo);
  console.log("[meta] Reasoning:", JSON.stringify(reasoning, null, 2));

  // If the command is conversational/explanatory (no API calls needed), skip planning
  if (reasoning.canAutoResolve === false) {
    console.log("[meta] canAutoResolve=false — skipping planning, generating spoken response from reasoning.");
    let spokenSummary = null;
    let audioBase64 = null;
    try {
      // Build a human-friendly explanation from reasoning steps
      const explanation = reasoning.unresolvedNote ||
        (reasoning.steps?.map((s) => s.description).join(" Then ")) ||
        reasoning.reasoning ||
        "I understand your question but cannot execute it automatically.";
      const ttsResult = await metaService.generateSpokenSummary(transcript, [
        { step: "explanation", status: 200, data: { explanation } },
      ]);
      spokenSummary = ttsResult?.spokenText || explanation;
      console.log("[meta] Spoken summary:", spokenSummary);
      if (spokenSummary) {
        audioBase64 = await metaService.synthesizeSpeech(spokenSummary);
      }
    } catch (ttsErr) {
      console.error("[meta] TTS phase failed (non-blocking):", ttsErr.message);
    }
    return { transcript, reasoning, commands: [], results: [], spokenSummary, audioBase64 };
  }

  // Phase 2: Plan (informed by reasoning)
  console.log("[meta] Phase 2: Planning commands...");
  const plan = await metaService.planCommands(transcript, userInfo, reasoning);
  console.log("[meta] Plan:", JSON.stringify(plan, null, 2));

  const normalized = metaService.normalizePlan(plan);
  if (normalized.error) {
    return { transcript, reasoning, error: normalized.error };
  }

  if (normalized.needsInput) {
    return {
      transcript,
      reasoning,
      commands: normalized.commands,
      needsInput: true,
      message: "Some steps require additional input. Please review and confirm.",
    };
  }

  // Phase 3: Execute
  console.log("[meta] Phase 3: Executing", normalized.commands.length, "commands...");
  const results = await metaService.executeCommands(normalized.commands, getAuthToken(req), getBaseUrl(req));
  console.log("[meta] Done:", JSON.stringify(results.map((r) => ({ step: r.step, status: r.status })), null, 2));

  // Phase 4: Generate spoken summary + TTS audio
  let spokenSummary = null;
  let audioBase64 = null;
  try {
    console.log("[meta] Phase 4: Generating spoken summary...");
    const ttsResult = await metaService.generateSpokenSummary(transcript, results);
    spokenSummary = ttsResult?.spokenText || null;
    console.log("[meta] Spoken summary:", spokenSummary);

    if (spokenSummary) {
      console.log("[meta] Phase 4b: Synthesizing speech via Murf.ai...");
      audioBase64 = await metaService.synthesizeSpeech(spokenSummary);
      console.log("[meta] TTS audio:", audioBase64 ? `${audioBase64.length} chars base64` : "skipped");
    }
  } catch (ttsErr) {
    console.error("[meta] TTS phase failed (non-blocking):", ttsErr.message);
  }

  return { transcript, reasoning, commands: normalized.commands, results, spokenSummary, audioBase64 };
}

// POST /meta/voice-command
exports.voiceCommand = async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No audio file provided" });
  }

  console.log("[meta] Received audio:", req.file.mimetype, req.file.size, "bytes");

  // Transcribe
  console.log("[meta] Transcribing audio...");
  const transcript = await metaService.transcribeAudio(req.file.buffer, req.file.mimetype);
  console.log("[meta] Transcript:", transcript);

  const context = req.body.context ? JSON.parse(req.body.context) : {};
  const result = await processCommand(transcript, req, context);
  return res.json(result);
};

// POST /meta/transcribe
exports.transcribe = async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No audio file provided" });
  }

  const transcript = await metaService.transcribeAudio(req.file.buffer, req.file.mimetype);
  return res.json({ transcript });
};

// POST /meta/text-command
exports.textCommand = async (req, res) => {
  const { command, context = {} } = req.body;
  if (!command) {
    return res.status(400).json({ error: "No command provided" });
  }

  console.log("[meta:text] Command:", command);

  const result = await processCommand(command, req, context);
  return res.json(result);
};

// Static TTS prompts for the Seeds AI persona
const SEEDS_PROMPTS = {
  welcome:
    "Hey there! I'm Seeds, your AI teaching assistant. Press R anytime to talk to me, or type a command. I'm here to help!",
  thinking:
    "Let me think about that for a moment.",
};

const ttsCache = {};

// POST /meta/tts-prompt
exports.ttsPrompt = async (req, res) => {
  const { type } = req.body;
  const text = SEEDS_PROMPTS[type];
  if (!text) {
    return res.status(400).json({ error: `Unknown prompt type: ${type}` });
  }

  if (ttsCache[type]) {
    return res.json({ text, audioBase64: ttsCache[type] });
  }

  const audioBase64 = await metaService.synthesizeSpeech(text);
  if (audioBase64) {
    ttsCache[type] = audioBase64;
  }
  return res.json({ text, audioBase64 });
};
