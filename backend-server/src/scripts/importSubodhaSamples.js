"use strict";
/**
 * Import sampled Subodha LMS course JSONs into Mongo.
 *
 * Usage:
 *   node src/scripts/importSubodhaSamples.js \
 *     --tenantId <ObjectId> \
 *     [--source /abs/path/to/subodha_exploration/pipeline/out] \
 *     [--force]
 *
 * Idempotent: re-runs with unchanged payload are skipped (payloadHash match).
 * Re-imports preserve editor overlays (translations, audioByLang, notes, blockVersion).
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const mongo = require("../config/mongo.js");
const { SubodhaCourse } = require("../models/SubodhaCourse.js");
const { ContentV3 } = require("../models/ContentV3.js");
const { detectScripts, inferLanguageFromScripts } = require("../constants/languages.js");

const SUBODHA_CONTENT_TYPE = "subodha_course";

const SUBODHA_BASE = "https://subodha-lms.visionempowertrust.org";

function parseArgs(argv) {
  const out = { force: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--force") out.force = true;
    else if (a.startsWith("--")) {
      const k = a.slice(2);
      const v = argv[i + 1];
      out[k] = v;
      i++;
    }
  }
  return out;
}

function parseCourseId(courseId) {
  // course-v1:{org}+{courseCode}+{run}
  const m = /^course-v1:([^+]+)\+([^+]+)\+(.+)$/.exec(courseId || "");
  if (!m) return { org: "", courseCode: "", run: "" };
  return { org: m[1], courseCode: m[2], run: m[3] };
}

function dedupKeyFor(platform, org, courseCode) {
  return `${platform}:${org}:${courseCode}`;
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

function mapBlock(srcBlock) {
  const type = srcBlock.type === "html" || srcBlock.type === "problem" || srcBlock.type === "video" ? srcBlock.type : "html";
  const out = {
    sourceId: srcBlock.id,
    type,
    displayName: srcBlock.display_name || "",
    translations: {},
    audioByLang: {},
    notes: "",
    blockVersion: 1,
  };
  if (type === "html") {
    out.htmlContent = rewriteStaticUrls(srcBlock.html_content || "");
  } else if (type === "problem") {
    out.questionText = rewriteStaticUrls(srcBlock.question_text || "");
    out.problemType = srcBlock.problem_type || "";
    out.choices = Array.isArray(srcBlock.choices)
      ? srcBlock.choices.map((c) => ({
          label: c.label || c.text || "",
          correct: Boolean(c.is_correct ?? c.correct),
        }))
      : [];
    out.explanation = rewriteStaticUrls(srcBlock.explanation || "");
  } else if (type === "video") {
    out.youtubeId = srcBlock.youtube_id || "";
    out.youtubeUrl = srcBlock.youtube_url || "";
    out.html5Sources = Array.isArray(srcBlock.html5_sources) ? srcBlock.html5_sources : [];
    out.transcriptUrl = srcBlock.transcript_url || "";
    out.edxVideoId = srcBlock.edx_video_id || "";
  }
  return out;
}

function mapCourseTree(course) {
  return (course.sections || []).map((sec) => ({
    sourceId: sec.id,
    displayName: sec.display_name || "",
    subsections: (sec.subsections || []).map((sub) => ({
      sourceId: sub.id,
      displayName: sub.display_name || "",
      units: (sub.units || []).map((u) => ({
        sourceId: u.id,
        displayName: u.display_name || "",
        blocks: (u.blocks || []).map(mapBlock),
      })),
    })),
  }));
}

// walk existing doc blocks → return Map<sourceId, overlay>
function harvestOverlays(existingDoc) {
  const map = new Map();
  if (!existingDoc) return map;
  for (const sec of existingDoc.sections || []) {
    for (const sub of sec.subsections || []) {
      for (const u of sub.units || []) {
        for (const b of u.blocks || []) {
          const hasOverlay =
            (b.translations && Object.keys(b.translations).length) ||
            (b.audioByLang && Object.keys(b.audioByLang).length) ||
            b.notes ||
            (b.blockVersion && b.blockVersion > 1);
          if (hasOverlay) {
            map.set(b.sourceId, {
              translations: b.translations || {},
              audioByLang: b.audioByLang || {},
              notes: b.notes || "",
              blockVersion: b.blockVersion || 1,
              updatedBy: b.updatedBy || "",
              updatedAt: b.updatedAt || null,
            });
          }
        }
      }
    }
  }
  return map;
}

function applyOverlays(sections, overlays) {
  let preserved = 0;
  for (const sec of sections) {
    for (const sub of sec.subsections) {
      for (const u of sub.units) {
        for (const b of u.blocks) {
          const o = overlays.get(b.sourceId);
          if (o) {
            b.translations = o.translations;
            b.audioByLang = o.audioByLang;
            b.notes = o.notes;
            b.blockVersion = o.blockVersion;
            b.updatedBy = o.updatedBy;
            b.updatedAt = o.updatedAt;
            preserved++;
          }
        }
      }
    }
  }
  return preserved;
}

async function importOneFile(filePath, tenantId, force) {
  const raw = fs.readFileSync(filePath, "utf8");
  const course = JSON.parse(raw);
  const courseId = course.course_id;
  if (!courseId) return { skipped: true, reason: "no course_id", file: filePath };

  const { org, courseCode, run } = parseCourseId(courseId);
  const dedupKey = dedupKeyFor("subodha", org, courseCode);
  const payloadHash = crypto.createHash("sha256").update(raw).digest("hex");
  const isEmpty = !Array.isArray(course.sections) || course.sections.length === 0;

  const existing = await SubodhaCourse.findOne({ dedupKey, tenantId }).exec();
  if (existing && !force && existing.source && existing.source.payloadHash === payloadHash) {
    return { skipped: true, reason: "payloadHash match", file: filePath, _id: existing._id };
  }

  const sections = mapCourseTree(course);
  const overlays = harvestOverlays(existing);
  const preserved = applyOverlays(sections, overlays);

  const text = collectText(course);
  const scripts = detectScripts(text);
  const language = inferLanguageFromScripts(scripts) || "english";

  const payload = {
    dedupKey,
    tenantId,
    courseName: course.course_name || "",
    language,
    detectedScripts: scripts,
    status: isEmpty ? "empty" : "ok",
    sections,
    source: {
      platform: "subodha",
      courseId,
      org,
      courseCode,
      run,
      importedFrom: path.basename(filePath),
      importedAt: new Date(),
      payloadHash,
    },
  };

  let savedId;
  let action;
  if (existing) {
    Object.assign(existing, payload);
    existing.markModified("sections");
    existing.markModified("source");
    await existing.save();
    savedId = existing._id;
    action = "updated";
  } else {
    const doc = await SubodhaCourse.create({ ...payload, creation_time: Date.now() });
    savedId = doc._id;
    action = "created";
  }

  // Mirror as ContentV3 row so the course shows in /content list and tab.
  // Skip empty courses — no point listing a placeholder.
  if (!isEmpty) {
    const contentDoc = {
      _id: savedId, // share id with SubodhaCourse for direct redirect
      tenantId,
      type: SUBODHA_CONTENT_TYPE,
      language,
      title: { english: course.course_name || courseId, local: "", audioUrl: "" },
      theme: { english: org || "Subodha", local: "", audioUrl: "" },
      description: `Imported from Subodha LMS — ${courseId}`,
      createdBy: "subodha-importer",
      creation_time: Date.now(),
      isDeleted: false,
    };
    await ContentV3.updateOne({ _id: savedId }, { $set: contentDoc }, { upsert: true });
  }

  return { upserted: action, _id: savedId, preserved, empty: isEmpty, file: filePath };
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args.tenantId) {
    console.error("Required: --tenantId <ObjectId>");
    process.exit(2);
  }
  const sourceDir =
    args.source ||
    path.resolve(__dirname, "../../../subodha_exploration/pipeline/out");
  if (!fs.existsSync(sourceDir)) {
    console.error(`Source dir not found: ${sourceDir}`);
    process.exit(2);
  }

  const files = fs
    .readdirSync(sourceDir)
    .filter((f) => f.endsWith(".json") && f !== "all.json")
    .map((f) => path.join(sourceDir, f));

  console.log(`Importing ${files.length} files from ${sourceDir} for tenantId=${args.tenantId}`);
  await mongo();

  const stats = { upserted: 0, created: 0, updated: 0, skipped: 0, empty: 0, preserved: 0, errors: 0 };
  for (const f of files) {
    try {
      const r = await importOneFile(f, args.tenantId, args.force);
      if (r.skipped) {
        stats.skipped++;
        console.log(`SKIP  ${path.basename(f)} — ${r.reason}`);
      } else {
        stats.upserted++;
        if (r.upserted === "created") stats.created++;
        if (r.upserted === "updated") stats.updated++;
        if (r.empty) stats.empty++;
        stats.preserved += r.preserved || 0;
        console.log(
          `${r.upserted === "created" ? "ADD " : "UPD "} ${path.basename(f)} — _id=${r._id}${
            r.empty ? " EMPTY" : ""
          }${r.preserved ? `  preserved=${r.preserved}` : ""}`,
        );
      }
    } catch (e) {
      stats.errors++;
      console.error(`ERR  ${path.basename(f)}: ${e.message}`);
    }
  }
  console.log("\nSummary:", JSON.stringify(stats));
  process.exit(stats.errors ? 1 : 0);
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

module.exports = { importOneFile, mapBlock, mapCourseTree, dedupKeyFor, rewriteStaticUrls, parseCourseId };
