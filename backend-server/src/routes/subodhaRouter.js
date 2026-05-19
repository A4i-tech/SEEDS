"use strict";
const express = require("express");
const path = require("path");
const sanitizeHtml = require("sanitize-html");

const { SubodhaCourse } = require("../models/SubodhaCourse.js");
const BlobService = require("../services/BlobService.js");
const { tryCatchWrapper } = require(path.join("..", "util.js"));
const { authorizeRole } = require("../auth/authenticateToken");
const { CANONICAL_LANGUAGES } = require("../constants/languages.js");
const { STATUS, ROLES } = require("../config/constants");

const { TENANT: TENANT_ROLE, CONTENT_CREATOR: CONTENT_CREATOR_ROLE, TEACHER: TEACHER_ROLE } = ROLES;
const SCHOOL_ADMIN_ROLE = "school_admin";

const router = express.Router();
const blobService = new BlobService();

const SANITIZE_OPTS = {
  allowedTags: sanitizeHtml.defaults.allowedTags.concat(["h1", "h2", "img", "figure", "figcaption", "u", "sub", "sup"]),
  allowedAttributes: {
    ...sanitizeHtml.defaults.allowedAttributes,
    "*": ["id", "class", "style", "lang", "dir"],
    img: ["src", "alt", "title", "width", "height"],
    a: ["href", "name", "target", "rel"],
  },
  allowedSchemes: ["http", "https", "data", "mailto"],
  disallowedTagsMode: "discard",
};

function cleanHtml(input) {
  if (typeof input !== "string" || !input) return input;
  return sanitizeHtml(input, SANITIZE_OPTS);
}

function sanitizeBlockPatch(patch) {
  if (!patch || typeof patch !== "object") return {};
  const out = {};
  for (const [k, v] of Object.entries(patch)) {
    if (k === "htmlContent" || k === "questionText" || k === "explanation") {
      out[k] = cleanHtml(v);
    } else if (k === "choices" && Array.isArray(v)) {
      out[k] = v.map((c) => ({
        label: cleanHtml(c.label || ""),
        correct: Boolean(c.correct),
      }));
    } else if (["displayName", "notes"].includes(k)) {
      out[k] = typeof v === "string" ? v : "";
    }
  }
  return out;
}

function sanitizeTranslation(t) {
  if (!t || typeof t !== "object") return {};
  const out = {};
  for (const [k, v] of Object.entries(t)) {
    if (k === "htmlContent" || k === "questionText" || k === "explanation" || k === "transcriptText" || k === "displayName") {
      out[k] = typeof v === "string" ? cleanHtml(v) : "";
    } else if (k === "choices" && Array.isArray(v)) {
      out[k] = v.map((c) => ({ label: cleanHtml(c.label || ""), correct: Boolean(c.correct) }));
    }
  }
  return out;
}

const EDIT_ROLES = [TENANT_ROLE, SCHOOL_ADMIN_ROLE, CONTENT_CREATOR_ROLE];
const READ_ROLES = [TENANT_ROLE, SCHOOL_ADMIN_ROLE, CONTENT_CREATOR_ROLE, TEACHER_ROLE];

router.get(
  "/courses",
  authorizeRole(...READ_ROLES),
  tryCatchWrapper(async (req, res) => {
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const filter = { tenantId: req.tenantId, isDeleted: { $ne: true } };
    const [total, rows] = await Promise.all([
      SubodhaCourse.countDocuments(filter),
      SubodhaCourse.find(filter)
        .select("_id courseName language status detectedScripts source.org source.courseCode source.run source.importedAt sections")
        .sort({ creation_time: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean()
        .exec(),
    ]);
    const items = rows.map((c) => ({
      _id: c._id,
      courseName: c.courseName,
      language: c.language,
      status: c.status,
      detectedScripts: c.detectedScripts,
      org: c.source?.org,
      courseCode: c.source?.courseCode,
      run: c.source?.run,
      importedAt: c.source?.importedAt,
      sectionsCount: Array.isArray(c.sections) ? c.sections.length : 0,
    }));
    return res.json({ page, limit, total, items });
  }),
);

router.get(
  "/courses/:id",
  authorizeRole(...READ_ROLES),
  tryCatchWrapper(async (req, res) => {
    const doc = await SubodhaCourse.findOne({ _id: req.params.id, tenantId: req.tenantId, isDeleted: { $ne: true } }).lean().exec();
    if (!doc) return res.status(STATUS.NOT_FOUND).json({ error: "Course not found" });
    return res.json(doc);
  }),
);

function findBlock(doc, blockSourceId) {
  for (let si = 0; si < doc.sections.length; si++) {
    const sec = doc.sections[si];
    for (let ssi = 0; ssi < sec.subsections.length; ssi++) {
      const sub = sec.subsections[ssi];
      for (let ui = 0; ui < sub.units.length; ui++) {
        const unit = sub.units[ui];
        for (let bi = 0; bi < unit.blocks.length; bi++) {
          if (unit.blocks[bi].sourceId === blockSourceId) {
            return { si, ssi, ui, bi, block: unit.blocks[bi] };
          }
        }
      }
    }
  }
  return null;
}

router.patch(
  "/courses/:id/block",
  authorizeRole(...EDIT_ROLES),
  tryCatchWrapper(async (req, res) => {
    const { blockSourceId, expectedBlockVersion, patch } = req.body || {};
    if (!blockSourceId || typeof expectedBlockVersion !== "number") {
      return res.status(STATUS.BAD_REQUEST).json({ error: "blockSourceId and expectedBlockVersion required" });
    }
    const doc = await SubodhaCourse.findOne({ _id: req.params.id, tenantId: req.tenantId, isDeleted: { $ne: true } });
    if (!doc) return res.status(STATUS.NOT_FOUND).json({ error: "Course not found" });
    const loc = findBlock(doc, blockSourceId);
    if (!loc) return res.status(STATUS.NOT_FOUND).json({ error: "Block not found" });
    if ((loc.block.blockVersion || 1) !== expectedBlockVersion) {
      return res.status(STATUS.CONFLICT).json({
        error: "blockVersion mismatch — reload the editor",
        currentBlockVersion: loc.block.blockVersion || 1,
      });
    }
    const clean = sanitizeBlockPatch(patch);
    Object.assign(loc.block, clean);
    loc.block.blockVersion = (loc.block.blockVersion || 1) + 1;
    loc.block.updatedAt = new Date();
    loc.block.updatedBy = req.userId || "";
    doc.markModified(`sections.${loc.si}.subsections.${loc.ssi}.units.${loc.ui}.blocks.${loc.bi}`);
    await doc.save();
    return res.json({ ok: true, block: loc.block });
  }),
);

router.put(
  "/courses/:id/block/translation",
  authorizeRole(...EDIT_ROLES),
  tryCatchWrapper(async (req, res) => {
    const { blockSourceId, lang, translation, expectedBlockVersion } = req.body || {};
    if (!blockSourceId || !lang || !translation) {
      return res.status(STATUS.BAD_REQUEST).json({ error: "blockSourceId, lang, translation required" });
    }
    if (!CANONICAL_LANGUAGES.includes(lang)) {
      return res.status(STATUS.BAD_REQUEST).json({ error: `lang must be one of ${CANONICAL_LANGUAGES.join(",")}` });
    }
    const doc = await SubodhaCourse.findOne({ _id: req.params.id, tenantId: req.tenantId, isDeleted: { $ne: true } });
    if (!doc) return res.status(STATUS.NOT_FOUND).json({ error: "Course not found" });
    const loc = findBlock(doc, blockSourceId);
    if (!loc) return res.status(STATUS.NOT_FOUND).json({ error: "Block not found" });
    if (typeof expectedBlockVersion === "number" && (loc.block.blockVersion || 1) !== expectedBlockVersion) {
      return res.status(STATUS.CONFLICT).json({
        error: "blockVersion mismatch — reload the editor",
        currentBlockVersion: loc.block.blockVersion || 1,
      });
    }
    if (!loc.block.translations || typeof loc.block.translations !== "object") loc.block.translations = {};
    loc.block.translations[lang] = sanitizeTranslation(translation);
    loc.block.blockVersion = (loc.block.blockVersion || 1) + 1;
    loc.block.updatedAt = new Date();
    loc.block.updatedBy = req.userId || "";
    doc.markModified(`sections.${loc.si}.subsections.${loc.ssi}.units.${loc.ui}.blocks.${loc.bi}.translations`);
    doc.markModified(`sections.${loc.si}.subsections.${loc.ssi}.units.${loc.ui}.blocks.${loc.bi}.blockVersion`);
    await doc.save();
    return res.json({ ok: true, block: loc.block });
  }),
);

router.put(
  "/courses/:id/block/audio",
  authorizeRole(...EDIT_ROLES),
  tryCatchWrapper(async (req, res) => {
    const { blockSourceId, lang, audioUrl } = req.body || {};
    if (!blockSourceId || !lang || typeof audioUrl !== "string") {
      return res.status(STATUS.BAD_REQUEST).json({ error: "blockSourceId, lang, audioUrl required" });
    }
    if (!CANONICAL_LANGUAGES.includes(lang)) {
      return res.status(STATUS.BAD_REQUEST).json({ error: `lang must be one of ${CANONICAL_LANGUAGES.join(",")}` });
    }
    const doc = await SubodhaCourse.findOne({ _id: req.params.id, tenantId: req.tenantId, isDeleted: { $ne: true } });
    if (!doc) return res.status(STATUS.NOT_FOUND).json({ error: "Course not found" });
    const loc = findBlock(doc, blockSourceId);
    if (!loc) return res.status(STATUS.NOT_FOUND).json({ error: "Block not found" });
    if (!loc.block.audioByLang || typeof loc.block.audioByLang !== "object") loc.block.audioByLang = {};
    loc.block.audioByLang[lang] = audioUrl;
    loc.block.blockVersion = (loc.block.blockVersion || 1) + 1;
    loc.block.updatedAt = new Date();
    loc.block.updatedBy = req.userId || "";
    doc.markModified(`sections.${loc.si}.subsections.${loc.ssi}.units.${loc.ui}.blocks.${loc.bi}.audioByLang`);
    doc.markModified(`sections.${loc.si}.subsections.${loc.ssi}.units.${loc.ui}.blocks.${loc.bi}.blockVersion`);
    await doc.save();
    return res.json({ ok: true, block: loc.block });
  }),
);

router.get(
  "/sasToken",
  authorizeRole(...EDIT_ROLES),
  tryCatchWrapper(async (req, res) => {
    const containerName = "input-container";
    const blobName = req.query.blobName;
    if (!blobName || !blobName.toLowerCase().endsWith(".mp3")) {
      return res.status(STATUS.BAD_REQUEST).json({ error: "Only .mp3 files are allowed." });
    }
    const sasToken = await blobService.getUploadSASToken(blobName, containerName);
    const container_client = blobService.getContainerClient(containerName);
    return res.json({
      sasToken: `${container_client.getBlockBlobClient(blobName).url}?${sasToken}`,
    });
  }),
);

module.exports = router;
