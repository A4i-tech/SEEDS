"use strict";
/**
 * Subodha LMS (Open edX wrapper) adapter.
 *
 * Maps a raw Subodha course JSON into the vendor-neutral adapter contract:
 *   { source, status, detectedScripts, vendorMeta?, nested[] }
 *
 * This is the ONLY file that knows about Subodha's payload shape, edX block ids,
 * `is_correct` vs `correct`, static-asset URL paths, etc.
 *
 * Writes vendorId = "vendor_1" via the registry (see constants/vendors.js).
 */

const path = require("path");
const { detectScripts } = require("../constants/languages.js");

const VENDOR_ID = "vendor_1";
const SUBODHA_BASE = "https://subodha-lms.visionempowertrust.org";

function parseCourseId(courseId) {
  const m = /^course-v1:([^+]+)\+([^+]+)\+(.+)$/.exec(courseId || "");
  if (!m) return { org: "", courseCode: "", run: "" };
  return { org: m[1], courseCode: m[2], run: m[3] };
}

function rewriteStaticUrls(html) {
  if (typeof html !== "string" || !html) return html;
  return html.replace(/(\b(?:src|href)\s*=\s*["'])\/static\//g, `$1${SUBODHA_BASE}/static/`);
}

function collectText(course) {
  const buf = [];
  for (const sec of course.sections || []) {
    for (const sub of sec.subsections || []) {
      for (const u of sub.units || []) {
        for (const b of u.blocks || []) {
          if (b.html_content) buf.push(b.html_content);
          if (b.question_text) buf.push(b.question_text);
          if (Array.isArray(b.choices)) for (const c of b.choices) buf.push(c.label || "");
          if (b.explanation) buf.push(b.explanation);
          if (b.display_name) buf.push(b.display_name);
        }
        if (u.display_name) buf.push(u.display_name);
      }
      if (sub.display_name) buf.push(sub.display_name);
    }
    if (sec.display_name) buf.push(sec.display_name);
  }
  return buf.join(" ");
}

function mapSubodhaBlock(srcBlock) {
  const rawType = srcBlock.type;
  // Vendor-neutral blockType taxonomy:
  let blockType;
  if (rawType === "html") blockType = "html";
  else if (rawType === "problem") blockType = "quiz";
  else if (rawType === "video") blockType = "video";
  else blockType = "html"; // fallback

  const node = {
    kind: "block",
    sourceId: srcBlock.id,
    displayName: srcBlock.display_name || "",
    blockType,
    body: {},
    vendorMeta: {},
  };

  if (blockType === "html") {
    node.body.htmlContent = rewriteStaticUrls(srcBlock.html_content || "");
  } else if (blockType === "quiz") {
    node.body.questionText = rewriteStaticUrls(srcBlock.question_text || "");
    node.body.explanation = rewriteStaticUrls(srcBlock.explanation || "");
    node.body.choices = Array.isArray(srcBlock.choices)
      ? srcBlock.choices.map((c) => ({
          label: c.label || c.text || "",
          correct: Boolean(c.is_correct ?? c.correct),
        }))
      : [];
    node.vendorMeta.problemType = srcBlock.problem_type || "";
  } else if (blockType === "video") {
    node.body.youtubeId = srcBlock.youtube_id || "";
    node.body.youtubeUrl = srcBlock.youtube_url || "";
    node.body.videoSources = Array.isArray(srcBlock.html5_sources) ? srcBlock.html5_sources : [];
    node.body.transcriptUrl = srcBlock.transcript_url || "";
    node.vendorMeta.edxVideoId = srcBlock.edx_video_id || "";
  }

  // Drop empty vendorMeta so the doc is clean.
  if (Object.keys(node.vendorMeta).length === 0) delete node.vendorMeta;
  return node;
}

/**
 * Subodha → vendor-neutral adapter output.
 * @param {object} rawJson - parsed course JSON from Subodha LMS
 * @param {object} [ctx]   - { filePath? } for source.importedFrom diagnostics
 * @returns {{vendorId, sourceCourseId, sourceVersion, title, theme, language, adapted}}
 */
function mapSubodhaCourseToImported(rawJson, ctx = {}) {
  const courseId = rawJson.course_id;
  if (!courseId) throw new Error("Subodha course JSON missing course_id");

  const { org, courseCode, run } = parseCourseId(courseId);
  const text = collectText(rawJson);
  const detectedScripts = detectScripts(text);
  // Subodha doesn't carry language; SC3 mandates derivation. SEEDS canonical "english" if nothing else.
  const language = inferLanguage(detectedScripts);

  const nested = (rawJson.sections || []).map((sec) => ({
    kind: "container",
    sourceId: sec.id,
    displayName: sec.display_name || "",
    children: (sec.subsections || []).map((sub) => ({
      kind: "container",
      sourceId: sub.id,
      displayName: sub.display_name || "",
      children: (sub.units || []).map((u) => ({
        kind: "container",
        sourceId: u.id,
        displayName: u.display_name || "",
        children: (u.blocks || []).map(mapSubodhaBlock),
      })),
    })),
  }));

  return {
    vendorId: VENDOR_ID,
    sourceCourseId: courseId,
    sourceVersion: run,
    title: rawJson.course_name || courseId,
    theme: org || "Subodha",
    language,
    adapted: {
      source: {
        org,
        courseCode,
        run,
        importedFrom: ctx.filePath ? path.basename(ctx.filePath) : "",
        importedAt: new Date(),
      },
      status: nested.length ? "ok" : "empty",
      detectedScripts,
      vendorMeta: { courseIdFormat: "course-v1", platform: "subodha" },
      nested,
    },
  };
}

function inferLanguage(scripts) {
  // Same canonical names as src/constants/languages.js
  if (scripts.includes("devanagari")) return "hindi";
  if (scripts.includes("bengali")) return "bengali";
  if (scripts.includes("gujarati")) return "gujarati";
  if (scripts.includes("oriya")) return "oriya";
  if (scripts.includes("tamil")) return "tamil";
  if (scripts.includes("telugu")) return "telugu";
  if (scripts.includes("kannada")) return "kannada";
  if (scripts.includes("malayalam")) return "malayalam";
  return "english";
}

module.exports = {
  VENDOR_ID,
  mapSubodhaCourseToImported,
  mapSubodhaBlock,
  parseCourseId,
  rewriteStaticUrls,
};
