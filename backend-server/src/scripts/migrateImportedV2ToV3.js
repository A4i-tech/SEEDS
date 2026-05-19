"use strict";
/**
 * One-shot v2 → v3 migration for ContentV3.subodhaCourse documents.
 *
 *   subodhaCourse.sections[].subsections[].units[].blocks[]   (v2 nested tree of bodies)
 *   ↓
 *   imported.tree  (structure-only, recursive containers + block refs)
 *   imported.blocks  (flat map keyed by SEEDS-stable _seedsBlockId)
 *
 * Also rewrites:
 *   type:           "subodha_course"  → "imported_content"
 *   sourcePlatform: "subodha"         → "vendor_1"
 *   dedupKey:       "subodha:*"       → "vendor_1:*"
 *
 * Idempotent: skips docs already migrated (imported set, subodhaCourse absent, type imported_content).
 *
 * Usage:
 *   node src/scripts/migrateImportedV2ToV3.js              # --dry-run is default
 *   node src/scripts/migrateImportedV2ToV3.js --apply
 */

const mongoose = require("mongoose");
const crypto = require("crypto");
const { v4: uuidv4 } = require("uuid");

const mongo = require("../config/mongo.js");
const { ContentV3 } = require("../models/ContentV3.js");
const { validateImported } = require("../importers/importedSchema.js");
const { HASHED_SOURCE_FIELDS } = require("../importers/importerCore.js");

const SCHEMA_VERSION = 1;
const VENDOR_ID = "vendor_1";

function canonicalizeForHash(value) {
  if (Array.isArray(value)) return value.map(canonicalizeForHash);
  if (value && typeof value === "object") {
    const out = {};
    for (const k of Object.keys(value).sort()) {
      if (HASHED_SOURCE_FIELDS.has(k)) out[k] = canonicalizeForHash(value[k]);
    }
    return out;
  }
  return value;
}

function computeContentHash({ tree, blocks }) {
  const canon = { tree: canonicalizeForHash(tree), blocks: {} };
  for (const id of Object.keys(blocks).sort()) {
    const b = blocks[id];
    canon.blocks[b.sourceId] = canonicalizeForHash({
      sourceId: b.sourceId, blockType: b.blockType, displayName: b.displayName, ...(b.body || {}),
    });
  }
  return crypto.createHash("sha256").update(JSON.stringify(canon)).digest("hex");
}

function mapV2BlockToV3(b) {
  // v2 type → v3 blockType
  let blockType;
  if (b.type === "problem") blockType = "quiz";
  else if (b.type === "video") blockType = "video";
  else blockType = "html";

  const body = {};
  if (blockType === "html") {
    if (b.htmlContent) body.htmlContent = b.htmlContent;
  } else if (blockType === "quiz") {
    if (b.questionText) body.questionText = b.questionText;
    if (b.explanation) body.explanation = b.explanation;
    if (Array.isArray(b.choices)) body.choices = b.choices.map((c) => ({
      label: c.label || "", correct: Boolean(c.correct),
    }));
  } else if (blockType === "video") {
    if (b.youtubeId) body.youtubeId = b.youtubeId;
    if (b.youtubeUrl) body.youtubeUrl = b.youtubeUrl;
    if (Array.isArray(b.html5Sources)) body.videoSources = b.html5Sources;
    if (b.transcriptUrl) body.transcriptUrl = b.transcriptUrl;
  }

  const vendorMeta = {};
  if (b.problemType) vendorMeta.problemType = b.problemType;
  if (b.edxVideoId) vendorMeta.edxVideoId = b.edxVideoId;

  return {
    sourceId: b.sourceId,
    blockType,
    displayName: b.displayName || "",
    body,
    ...(Object.keys(vendorMeta).length ? { vendorMeta } : {}),
    translations: b.translations || {},
    audioByLang: b.audioByLang || {},
    notes: b.notes || "",
    blockVersion: b.blockVersion || 1,
    updatedBy: b.updatedBy || "",
    updatedAt: b.updatedAt || null,
  };
}

function buildV3FromV2(subodhaCourse) {
  const tree = [];
  const blocks = {};

  const sections = Array.isArray(subodhaCourse.sections) ? subodhaCourse.sections : [];
  for (const sec of sections) {
    const secNode = {
      kind: "container",
      _seedsBlockId: uuidv4(),
      sourceId: sec.sourceId || "",
      displayName: sec.displayName || "",
      children: [],
    };
    for (const sub of sec.subsections || []) {
      const subNode = {
        kind: "container",
        _seedsBlockId: uuidv4(),
        sourceId: sub.sourceId || "",
        displayName: sub.displayName || "",
        children: [],
      };
      for (const u of sub.units || []) {
        const unitNode = {
          kind: "container",
          _seedsBlockId: uuidv4(),
          sourceId: u.sourceId || "",
          displayName: u.displayName || "",
          children: [],
        };
        for (const b of u.blocks || []) {
          const seedsBlockId = uuidv4();
          blocks[seedsBlockId] = mapV2BlockToV3(b);
          unitNode.children.push({
            kind: "block",
            _seedsBlockId: seedsBlockId,
            sourceId: b.sourceId || "",
            displayName: b.displayName || "",
          });
        }
        subNode.children.push(unitNode);
      }
      secNode.children.push(subNode);
    }
    tree.push(secNode);
  }

  return { tree, blocks };
}

function blocksDescribe(blocks) {
  const byType = {};
  let overlays = 0;
  for (const b of Object.values(blocks)) {
    byType[b.blockType] = (byType[b.blockType] || 0) + 1;
    if (b.translations && Object.keys(b.translations).length) overlays++;
    if (b.notes) overlays++;
  }
  return `${Object.keys(blocks).length} blocks (${JSON.stringify(byType)}), overlays=${overlays}`;
}

async function migrate({ apply }) {
  await mongo();
  const cv = ContentV3.collection;

  // Find every doc still on v2 shape OR previously-mirrored docs without imported yet.
  const docs = await cv.find({ subodhaCourse: { $exists: true } }).toArray();
  const stats = { read: docs.length, migrated: 0, skipped: 0, errors: 0 };

  for (const doc of docs) {
    try {
      // Idempotency check: already migrated.
      if (doc.imported && !doc.subodhaCourse && doc.type === "imported_content") {
        stats.skipped++;
        continue;
      }

      const sc = doc.subodhaCourse || {};
      const { tree, blocks } = buildV3FromV2(sc);
      const status = (sc.status === "empty" || Object.keys(blocks).length === 0) ? "empty" : "ok";

      const imported = {
        schemaVersion: SCHEMA_VERSION,
        source: {
          org: (sc.source && sc.source.org) || doc.theme?.english || "",
          courseCode: (sc.source && sc.source.courseCode) || "",
          run: (sc.source && sc.source.run) || doc.sourceVersion || "",
          importedFrom: (sc.source && sc.source.importedFrom) || "",
          importedAt: (sc.source && sc.source.importedAt) || doc.lastSyncedAt || new Date(),
        },
        status,
        detectedScripts: sc.detectedScripts || [],
        vendorMeta: { platform: "subodha", courseIdFormat: "course-v1" },
        tree,
        blocks,
      };

      const v = validateImported(imported);
      if (!v.valid) {
        throw new Error("Validation failed:\n  " + v.errors.join("\n  "));
      }

      const newContentHash = computeContentHash({ tree, blocks });
      const newDedupKey = doc.dedupKey
        ? doc.dedupKey.replace(/^subodha:/, `${VENDOR_ID}:`)
        : `${VENDOR_ID}:${imported.source.org}:${imported.source.courseCode}`;

      const update = {
        $set: {
          type: "imported_content",
          sourcePlatform: VENDOR_ID,
          dedupKey: newDedupKey,
          contentHash: newContentHash,
          lastSyncedAt: new Date(),
          imported,
        },
        $unset: { subodhaCourse: "" },
      };

      if (apply) {
        await cv.updateOne({ _id: doc._id }, update);
        stats.migrated++;
        console.log(`MIG  ${doc._id}  ${doc.title?.english || ""}  →  ${blocksDescribe(blocks)}  hash=${newContentHash.slice(0,12)}`);
      } else {
        stats.migrated++;
        console.log(`DRY  ${doc._id}  ${doc.title?.english || ""}  →  ${blocksDescribe(blocks)}  hash=${newContentHash.slice(0,12)}  dedupKey=${newDedupKey}`);
      }
    } catch (e) {
      stats.errors++;
      console.error(`ERR  ${doc._id}: ${e.message}`);
    }
  }

  console.log(`\n${apply ? "APPLY" : "DRY-RUN"} summary:`, JSON.stringify(stats));
  if (!apply) console.log("\nRe-run with --apply to commit.");
  process.exit(stats.errors ? 1 : 0);
}

if (require.main === module) {
  const apply = process.argv.includes("--apply");
  migrate({ apply }).catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

module.exports = { migrate, buildV3FromV2, mapV2BlockToV3, computeContentHash };
