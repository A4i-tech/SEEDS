"use strict";
/**
 * One-shot migration: lift every legacy `subodhaCourses` doc into its existing
 * ContentV3 mirror row (shared _id), populating top-level SC5 identity fields +
 * nested subodhaCourse sub-doc. Idempotent: re-runs are no-ops once contentHash
 * matches.
 *
 * Usage:
 *   node src/scripts/migrateSubodhaToContentV3.js [--drop]
 *
 *   --drop : after successful migration, drop the legacy `subodhaCourses` collection.
 */

const mongoose = require("mongoose");
const crypto = require("crypto");

const mongo = require("../config/mongo.js");
const { ContentV3 } = require("../models/ContentV3.js");

const SOURCE_PLATFORM = "subodha";
const SUBODHA_CONTENT_TYPE = "subodha_course";

function computeContentHash(sections) {
  const normalized = (sections || []).map((sec) => ({
    sourceId: sec.sourceId,
    displayName: sec.displayName,
    subsections: (sec.subsections || []).map((sub) => ({
      sourceId: sub.sourceId,
      displayName: sub.displayName,
      units: (sub.units || []).map((u) => ({
        sourceId: u.sourceId,
        displayName: u.displayName,
        blocks: (u.blocks || []).map((b) => {
          const { translations, audioByLang, notes, blockVersion, updatedBy, updatedAt, ...rest } = b || {};
          return rest;
        }),
      })),
    })),
  }));
  return crypto.createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
}

async function migrate({ drop }) {
  await mongo();
  const db = mongoose.connection.db;
  const legacy = db.collection("subodhaCourses");
  const legacyDocs = await legacy.find({}).toArray();

  const stats = { read: legacyDocs.length, updated: 0, created: 0, skipped: 0, missingMirror: 0 };

  for (const old of legacyDocs) {
    const source = old.source || {};
    const courseId = source.courseId;
    const sections = Array.isArray(old.sections) ? old.sections : [];
    const contentHash = computeContentHash(sections);

    const subodhaCourse = {
      source: {
        org: source.org,
        courseCode: source.courseCode,
        run: source.run,
        importedFrom: source.importedFrom,
        importedAt: source.importedAt,
      },
      status: old.status || (sections.length ? "ok" : "empty"),
      detectedScripts: old.detectedScripts || [],
      sections,
    };

    const setFields = {
      type: SUBODHA_CONTENT_TYPE,
      language: old.language || "english",
      title: { english: old.courseName || courseId || "Subodha Course", local: "", audioUrl: "" },
      theme: { english: source.org || "Subodha", local: "", audioUrl: "" },
      description: courseId ? `Imported from Subodha LMS — ${courseId}` : "Imported from Subodha LMS",
      createdBy: "subodha-importer",
      isDeleted: false,
      sourcePlatform: SOURCE_PLATFORM,
      sourceContentId: courseId,
      sourceCourseId: courseId,
      sourceVersion: source.run,
      contentHash,
      lastSyncedAt: source.importedAt || new Date(),
      dedupKey: old.dedupKey,
      subodhaCourse,
    };

    const existing = await ContentV3.findOne({ _id: old._id }).exec();
    if (existing) {
      if (existing.contentHash === contentHash && existing.subodhaCourse) {
        stats.skipped++;
        continue;
      }
      Object.assign(existing, setFields);
      existing.markModified("subodhaCourse");
      await existing.save();
      stats.updated++;
    } else {
      stats.missingMirror++;
      await ContentV3.create({
        _id: old._id,
        tenantId: old.tenantId,
        creation_time: old.creation_time || Math.floor(Date.now() / 1000),
        ...setFields,
      });
      stats.created++;
    }
  }

  console.log("Migration summary:", JSON.stringify(stats));

  if (drop) {
    if (stats.read === 0) {
      console.log("Nothing to drop — legacy collection empty.");
    } else {
      await legacy.drop();
      console.log("Dropped legacy collection 'subodhaCourses'.");
    }
  } else {
    console.log("Skipped drop (pass --drop after verification).");
  }

  process.exit(0);
}

if (require.main === module) {
  const drop = process.argv.includes("--drop");
  migrate({ drop }).catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

module.exports = { migrate, computeContentHash };
