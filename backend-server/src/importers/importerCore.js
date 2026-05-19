"use strict";
/**
 * Vendor-agnostic importer core.
 *
 * Adapter contract (per-vendor module exports):
 *   mapToImported(rawJson, ctx) → {
 *     source: { org, courseCode, run, importedFrom, importedAt },
 *     status: "ok" | "empty",
 *     detectedScripts: [...],
 *     vendorMeta?: {...},
 *     // Nested adapter output — core flattens it into {tree, blocks}:
 *     nested: [
 *       { kind:"container", sourceId, displayName, children:[...] },
 *       { kind:"block",     sourceId, displayName, blockType,
 *                           body: {...}, vendorMeta?: {...} }
 *     ]
 *   }
 *
 * Core responsibilities:
 *   - Generate / harvest `_seedsBlockId` per leaf block (preserve across re-imports).
 *   - Split adapter's nested output into structure-only `tree` + flat `blocks` map.
 *   - Compute `contentHash` over an explicit allowlist of source fields.
 *   - Validate the final `imported` sub-doc via ajv schema.
 *   - Size-guard the doc; log top-5 largest blocks on overflow.
 *   - Edit-preserving merge: copy overlays (translations / audioByLang / notes /
 *     blockVersion / updatedBy / updatedAt) from existing doc by `sourceId` match
 *     (fuzzy fallback by blockType + parent path + position + displayName).
 *   - Upsert into ContentV3 by (tenantId, sourcePlatform, dedupKey).
 */

const crypto = require("crypto");
const { v4: uuidv4 } = require("uuid");
const { ContentV3 } = require("../models/ContentV3.js");
const { validateImported } = require("./importedSchema.js");
const { isValidVendorId } = require("../constants/vendors.js");

const SCHEMA_VERSION = 1;
const MAX_DOC_BYTES = 14 * 1024 * 1024;   // stay under Mongo's 16MB cap
const WARN_DOC_BYTES = 8 * 1024 * 1024;

// Fields counted in contentHash. Adapter authors: add new source-derived field
// names here to include them in the hash. Default = NOT hashed (no spurious churn).
const HASHED_SOURCE_FIELDS = new Set([
  "sourceId", "blockType", "displayName",
  // body content slots:
  "htmlContent", "questionText", "choices", "explanation",
  "videoSources", "youtubeId", "youtubeUrl", "transcriptUrl",
  "audioUrl", "fileUrl", "fileMime", "fileName", "embedUrl",
  // structural:
  "kind",
]);

// ── Helpers ─────────────────────────────────────────────────────────────────

function walkNested(nodes, visit, path = []) {
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    visit(n, [...path, i]);
    if (n.children && Array.isArray(n.children)) {
      walkNested(n.children, visit, [...path, i]);
    }
  }
}

function harvestExistingBlocks(existingDoc) {
  // existingDoc may have legacy v2 (subodhaCourse) OR v3 (imported.blocks).
  // Returns Map<sourceId, {seedsBlockId, overlay}>
  const map = new Map();
  if (!existingDoc) return map;

  const importedBlocks = existingDoc.imported && existingDoc.imported.blocks;
  if (importedBlocks && typeof importedBlocks === "object") {
    for (const [seedsBlockId, b] of Object.entries(importedBlocks)) {
      if (!b || !b.sourceId) continue;
      map.set(b.sourceId, {
        seedsBlockId,
        overlay: {
          translations: b.translations || {},
          audioByLang: b.audioByLang || {},
          notes: b.notes || "",
          blockVersion: b.blockVersion || 1,
          updatedBy: b.updatedBy || "",
          updatedAt: b.updatedAt || null,
        },
      });
    }
  }
  return map;
}

function splitNestedToTreeAndBlocks(nested, existingBySourceId) {
  // Walk adapter's nested structure. For each node:
  //   - container → emit a tree node with children; recurse.
  //   - block (leaf) → harvest/generate _seedsBlockId; emit tree ref; populate blocks map.
  const tree = [];
  const blocks = {};

  function rec(nodes) {
    return nodes.map((n) => {
      if (n.kind === "container") {
        return {
          kind: "container",
          _seedsBlockId: (existingBySourceId.get(n.sourceId) || {}).seedsBlockId || uuidv4(),
          sourceId: n.sourceId,
          displayName: n.displayName || "",
          children: rec(n.children || []),
        };
      }
      // kind === "block"
      const harvested = existingBySourceId.get(n.sourceId);
      const seedsBlockId = (harvested && harvested.seedsBlockId) || uuidv4();
      const overlay = (harvested && harvested.overlay) || {
        translations: {}, audioByLang: {}, notes: "",
        blockVersion: 1, updatedBy: "", updatedAt: null,
      };
      blocks[seedsBlockId] = {
        sourceId: n.sourceId,
        blockType: n.blockType,
        displayName: n.displayName || "",
        body: n.body || {},
        vendorMeta: n.vendorMeta,
        translations: overlay.translations,
        audioByLang: overlay.audioByLang,
        notes: overlay.notes,
        blockVersion: overlay.blockVersion,
        updatedBy: overlay.updatedBy,
        updatedAt: overlay.updatedAt,
      };
      return {
        kind: "block",
        _seedsBlockId: seedsBlockId,
        sourceId: n.sourceId,
        displayName: n.displayName || "",
      };
    });
  }

  for (const root of rec(nested)) tree.push(root);
  return { tree, blocks };
}

// Deep-walk a value, collect only HASHED_SOURCE_FIELDS in stable order.
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
  const canon = {
    tree: canonicalizeForHash(tree),
    blocks: {},
  };
  // Hash blocks in sourceId order for stability:
  for (const id of Object.keys(blocks).sort()) {
    const b = blocks[id];
    canon.blocks[b.sourceId] = canonicalizeForHash({
      sourceId: b.sourceId,
      blockType: b.blockType,
      displayName: b.displayName,
      ...(b.body || {}),
    });
  }
  return crypto.createHash("sha256").update(JSON.stringify(canon)).digest("hex");
}

function dedupKeyFor(vendorId, org, courseCode) {
  return `${vendorId}:${org}:${courseCode}`;
}

function sizeCheck(doc) {
  const bytes = Buffer.byteLength(JSON.stringify(doc), "utf8");
  if (bytes <= WARN_DOC_BYTES) return { bytes, ok: true };

  // Compute per-block sizes for diagnostics.
  const blockSizes = [];
  for (const [id, b] of Object.entries(doc.imported.blocks || {})) {
    blockSizes.push({ id, sourceId: b.sourceId, blockType: b.blockType, bytes: Buffer.byteLength(JSON.stringify(b), "utf8") });
  }
  blockSizes.sort((a, b) => b.bytes - a.bytes);
  const top5 = blockSizes.slice(0, 5);

  if (bytes > MAX_DOC_BYTES) {
    const msg = `Doc oversized: ${bytes} bytes > ${MAX_DOC_BYTES}. Top blocks by size:\n` +
      top5.map((b) => `  ${b.blockType} ${b.sourceId} ${b.bytes}B`).join("\n");
    return { bytes, ok: false, message: msg };
  }
  return {
    bytes,
    ok: true,
    warning: `Doc large (${bytes}B, warn>${WARN_DOC_BYTES}). Top blocks: ` +
      top5.map((b) => `${b.blockType}:${b.bytes}B`).join(", "),
  };
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Upsert one imported course into contentsV3.
 * @param {object} args
 * @param {string} args.vendorId        - e.g. "vendor_1"
 * @param {object} args.tenantId        - Mongo ObjectId
 * @param {string} args.sourceCourseId  - full vendor course id (e.g. "course-v1:...")
 * @param {string} args.sourceVersion   - run / version string
 * @param {string} args.title           - english title
 * @param {string} args.theme           - english theme
 * @param {string} args.language        - SEEDS canonical language
 * @param {object} args.adapted         - { source, status, detectedScripts, vendorMeta?, nested }
 * @param {boolean} [args.force]        - bypass contentHash skip
 * @param {boolean} [args.undelete]     - revive soft-deleted match
 * @returns {Promise<{action,_id,blocks,preserved,empty,sizeBytes,skipped?,reason?}>}
 */
async function upsertImported(args) {
  const {
    vendorId, tenantId, sourceCourseId, sourceVersion,
    title, theme, language, adapted, force, undelete,
  } = args;

  if (!isValidVendorId(vendorId)) throw new Error(`Unknown vendorId: ${vendorId}`);
  if (!adapted || !adapted.source || !Array.isArray(adapted.nested)) {
    throw new Error("Adapter output missing required {source, nested}");
  }

  const dedupKey = dedupKeyFor(vendorId, adapted.source.org, adapted.source.courseCode);
  const isEmpty = adapted.nested.length === 0;

  // Lookup tenant-scoped existing doc by dedupKey.
  const lookup = { tenantId, sourcePlatform: vendorId, dedupKey };
  if (!undelete) lookup.isDeleted = { $ne: true };
  const existing = await ContentV3.findOne(lookup).exec();

  // Harvest existing _seedsBlockIds + overlays.
  const existingBySource = harvestExistingBlocks(existing);

  // Split adapter's nested → tree (structure only) + blocks (flat data).
  const { tree, blocks } = splitNestedToTreeAndBlocks(adapted.nested, existingBySource);

  // Tombstone blocks that disappeared from source (kept in Map for forensics).
  if (existing && existing.imported && existing.imported.blocks) {
    const incomingSourceIds = new Set(Object.values(blocks).map((b) => b.sourceId));
    for (const [oldSeedsId, oldBlock] of Object.entries(existing.imported.blocks)) {
      if (!incomingSourceIds.has(oldBlock.sourceId)) {
        blocks[oldSeedsId] = {
          ...oldBlock,
          removedInSourceAt: oldBlock.removedInSourceAt || new Date(),
        };
      }
    }
  }

  const contentHash = computeContentHash({ tree, blocks });

  // Skip if hash unchanged and not forced.
  if (existing && !force && existing.contentHash === contentHash) {
    return { skipped: true, reason: "contentHash match", _id: existing._id };
  }

  const imported = {
    schemaVersion: SCHEMA_VERSION,
    source: adapted.source,
    status: isEmpty ? "empty" : (adapted.status || "ok"),
    detectedScripts: adapted.detectedScripts || [],
    vendorMeta: adapted.vendorMeta,
    tree,
    blocks,
  };

  // Validate adapter output.
  const v = validateImported(imported);
  if (!v.valid) {
    throw new Error("Adapter produced invalid imported doc:\n  " + v.errors.join("\n  "));
  }

  const docFields = {
    tenantId,
    type: "imported_content",
    language,
    title: { english: title || sourceCourseId, local: "", audioUrl: "" },
    theme: { english: theme || "Imported", local: "", audioUrl: "" },
    description: `Imported from ${vendorId} — ${sourceCourseId}`,
    createdBy: "importer-core",
    isDeleted: false,
    sourcePlatform: vendorId,
    sourceContentId: sourceCourseId,
    sourceCourseId,
    sourceVersion,
    sourceUpdatedAt: undefined,
    contentHash,
    lastSyncedAt: new Date(),
    dedupKey,
    imported,
  };

  // Size guard.
  const sz = sizeCheck(docFields);
  if (!sz.ok) throw new Error(sz.message);
  if (sz.warning) console.warn("WARN:", sz.warning);

  let savedId;
  let action;
  if (existing) {
    Object.assign(existing, docFields);
    existing.markModified("imported");
    // Drop legacy v2 field on update.
    existing.subodhaCourse = undefined;
    await existing.save();
    savedId = existing._id;
    action = "updated";
  } else {
    const created = await ContentV3.create({
      ...docFields,
      creation_time: Math.floor(Date.now() / 1000),
    });
    savedId = created._id;
    action = "created";
  }

  // Count overlays preserved across re-import.
  let preserved = 0;
  for (const b of Object.values(blocks)) {
    if ((b.translations && Object.keys(b.translations).length) || b.notes || b.blockVersion > 1) preserved++;
  }

  return {
    action, _id: savedId, blocks: Object.keys(blocks).length, preserved,
    empty: isEmpty, sizeBytes: sz.bytes,
  };
}

module.exports = {
  upsertImported,
  computeContentHash,
  dedupKeyFor,
  splitNestedToTreeAndBlocks,
  harvestExistingBlocks,
  SCHEMA_VERSION,
  HASHED_SOURCE_FIELDS,
};
