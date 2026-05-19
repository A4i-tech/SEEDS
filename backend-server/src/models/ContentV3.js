"use strict";
const mongoose = require("mongoose");

const TextContentSchema = new mongoose.Schema(
  {
    english: { type: String, required: true },
    local: { type: String, default: "" },
    audioUrl: { type: String, default: "" },
  },
  { _id: false }
);

const AudioContentSchema = new mongoose.Schema(
  {
    description: { type: String, default: "" },
    audioUrl: { type: String, required: true },
    durationSeconds: { type: Number, default: null },
  },
  { _id: false }
);

const ContentSchema = new mongoose.Schema(
  {
    _id: {
      type: String,
      default: () => require("uuid").v4(),
    },
    tenantId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true, ref: "Tenant" },
    description: { type: String, default: "" },
    type: { type: String, required: true },
    language: { type: String, required: true },
    title: { type: TextContentSchema, required: true },
    theme: { type: TextContentSchema, required: true },
    audioContent: { type: [AudioContentSchema], default: [] },
    schoolId: { type: String, default: null, index: true },
    createdBy: { type: String, default: "" },
    isPullModel: { type: Boolean, default: false },
    isTeacherApp: { type: Boolean, default: false },
    isDeleted: { type: Boolean, default: false },
    creation_time: { type: Number, default: -1 },

    // Subodha LMS integration — identity + idempotency contract per
    // subodha_exploration/INTEGRATION_DOC_DIFF.md SC5 / SC17.
    // All optional; only populated on type === "subodha_course" docs.
    sourcePlatform:  { type: String, default: undefined },
    sourceContentId: { type: String, default: undefined },
    sourceCourseId:  { type: String, default: undefined },
    sourceVersion:   { type: String, default: undefined },
    sourceUpdatedAt: { type: Date,   default: undefined },
    contentHash:     { type: String, default: undefined },
    lastSyncedAt:    { type: Date,   default: undefined },
    dedupKey:        { type: String, default: undefined },
    // v3 vendor-neutral tree (replaces v2 `subodhaCourse`).
    // Holds { schemaVersion, source, status, detectedScripts, vendorMeta, tree[], blocks{} }.
    // Tree is structure-only; per-block bodies + overlays live under `blocks` keyed by SEEDS-stable uuid.
    imported:        { type: mongoose.Schema.Types.Mixed, default: undefined },
    // Legacy v2 field — populated only on docs not yet migrated. Drop after migration verified.
    subodhaCourse:   { type: mongoose.Schema.Types.Mixed, default: undefined },
  },
  { collection: "contentsV3" }
);

ContentSchema.index({ tenantId: 1, isDeleted: 1, creation_time: -1 });
ContentSchema.index({ tenantId: 1, language: 1 });
ContentSchema.index(
  { tenantId: 1, sourcePlatform: 1, sourceContentId: 1 },
  { unique: true, partialFilterExpression: { sourcePlatform: { $exists: true } } }
);
ContentSchema.index(
  { sourcePlatform: 1, contentHash: 1 },
  { sparse: true }
);
ContentSchema.index(
  { tenantId: 1, dedupKey: 1, type: 1 },
  { sparse: true }
);

const ContentV3 = mongoose.model("ContentV3", ContentSchema);

const getContent = () => {
  return ContentV3.find().sort({ _id: -1 }).exec();
};

const getContentsByIds = (ids) => {
  return ContentV3.find({ id: { $in: ids } }).exec();
};

const getContentById = _id => {
  return ContentV3.findOne({ _id }).exec()
}

module.exports = {
  TextContentSchema,
  getContent,
  getContentsByIds,
  getContentById,
  ContentV3,
};
