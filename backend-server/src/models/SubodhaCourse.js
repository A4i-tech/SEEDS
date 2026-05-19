"use strict";
const mongoose = require("mongoose");
const { v4: uuidv4 } = require("uuid");

const ChoiceSchema = new mongoose.Schema(
  {
    label: { type: String, default: "" },
    correct: { type: Boolean, default: false },
  },
  { _id: false }
);

const BlockSchema = new mongoose.Schema(
  {
    sourceId: { type: String, required: true },
    type: { type: String, enum: ["html", "problem", "video"], required: true },
    displayName: { type: String, default: "" },

    // html
    htmlContent: { type: String, default: "" },

    // problem
    questionText: { type: String, default: "" },
    problemType: { type: String, default: "" },
    choices: { type: [ChoiceSchema], default: undefined },
    explanation: { type: String, default: "" },

    // video (display-only v1)
    youtubeId: { type: String, default: "" },
    youtubeUrl: { type: String, default: "" },
    html5Sources: { type: [String], default: undefined },
    transcriptUrl: { type: String, default: "" },
    edxVideoId: { type: String, default: "" },

    // editor overlays
    translations: { type: mongoose.Schema.Types.Mixed, default: {} },
    audioByLang: { type: mongoose.Schema.Types.Mixed, default: {} },
    notes: { type: String, default: "" },
    updatedBy: { type: String, default: "" },
    updatedAt: { type: Date, default: null },
    blockVersion: { type: Number, default: 1 },
  },
  { _id: false }
);

const UnitSchema = new mongoose.Schema(
  {
    sourceId: { type: String, required: true },
    displayName: { type: String, default: "" },
    blocks: { type: [BlockSchema], default: [] },
  },
  { _id: false }
);

const SubsectionSchema = new mongoose.Schema(
  {
    sourceId: { type: String, required: true },
    displayName: { type: String, default: "" },
    units: { type: [UnitSchema], default: [] },
  },
  { _id: false }
);

const SectionSchema = new mongoose.Schema(
  {
    sourceId: { type: String, required: true },
    displayName: { type: String, default: "" },
    subsections: { type: [SubsectionSchema], default: [] },
  },
  { _id: false }
);

const SourceSchema = new mongoose.Schema(
  {
    platform: { type: String, default: "subodha" },
    courseId: { type: String, required: true },
    org: { type: String, default: "" },
    courseCode: { type: String, default: "" },
    run: { type: String, default: "" },
    importedFrom: { type: String, default: "" },
    importedAt: { type: Date, default: () => new Date() },
    payloadHash: { type: String, default: "" },
  },
  { _id: false }
);

const SubodhaCourseSchema = new mongoose.Schema(
  {
    _id: { type: String, default: () => uuidv4() },
    dedupKey: { type: String, required: true },
    source: { type: SourceSchema, required: true },
    tenantId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: "Tenant" },
    courseName: { type: String, default: "" },
    language: { type: String, default: "" },
    detectedScripts: { type: [String], default: [] },
    status: { type: String, enum: ["ok", "empty"], default: "ok" },
    sections: { type: [SectionSchema], default: [] },
    createdBy: { type: String, default: "" },
    creation_time: { type: Number, default: -1 },
    isDeleted: { type: Boolean, default: false },
  },
  { collection: "subodhaCourses" }
);

SubodhaCourseSchema.index({ dedupKey: 1, isDeleted: 1 }, { unique: false });
SubodhaCourseSchema.index({ tenantId: 1, isDeleted: 1, creation_time: -1 });

const SubodhaCourse = mongoose.model("SubodhaCourse", SubodhaCourseSchema);

module.exports = { SubodhaCourse };
