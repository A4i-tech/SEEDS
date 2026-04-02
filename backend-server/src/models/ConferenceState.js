"use strict";
const mongoose = require("mongoose");

const ActionHistorySchema = new mongoose.Schema(
  {
    timestamp: { type: String },
    action_type: { type: String },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    owner: { type: String },
  },
  { _id: false }
);

const ConferenceStateSchema = new mongoose.Schema(
  {
    _id: { type: String },
    teacher_phone_number: { type: String },
    is_running: { type: Boolean },
    participants: { type: mongoose.Schema.Types.Mixed, default: {} },
    action_history: { type: [ActionHistorySchema], default: [] },
    auto_end_state: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { collection: "conferenceState", strict: false }
);

const ConferenceState = mongoose.model(
  "ConferenceState",
  ConferenceStateSchema
);

module.exports = ConferenceState;
