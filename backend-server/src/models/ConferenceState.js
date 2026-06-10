"use strict";
const mongoose = require("mongoose");

// Documents are written by ConferenceV2 (Python); schema kept open intentionally.
const ConferenceStateSchema = new mongoose.Schema(
  { _id: String },
  { collection: "conferenceState", strict: false }
);

module.exports = mongoose.model("ConferenceState", ConferenceStateSchema);
