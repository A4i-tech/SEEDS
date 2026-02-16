"use strict";

const mongoose = require("mongoose");

const contentCreatorSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, index: true },
    password: { type: String, required: true },
    name: { type: String, required: true },
    tenantId: { type: String, required: true, index: true },
  },
  { timestamps: true },
);

const ContentCreator = mongoose.model("ContentCreator", contentCreatorSchema);
module.exports = ContentCreator;
