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
  },
  { _id: false }
);

const ContentSchema = new mongoose.Schema(
  {
    _id: {
      type: String,
      default: () => require("uuid").v4(),
    },
    tenantId: { type: String, required: true, index: true, ref: "Tenant" },
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
  },
  { collection: "contentsV3" }
);

ContentSchema.index({ tenantId: 1, isDeleted: 1, creation_time: -1 });
ContentSchema.index({ tenantId: 1, language: 1});


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
