"use strict";
const mongoose = require("mongoose");

const UserActionSchema = new mongoose.Schema(
  {
    action_type: { type: String },
    timestamp: { type: Date },
    details: { type: mongoose.Schema.Types.Mixed },
  },
  { _id: false },
);

const StreamPlaybackInfoSchema = new mongoose.Schema(
  {
    stream_id: { type: String },
    started_at: { type: Date },
    ended_at: { type: Date },
    duration: { type: Number },
  },
  { _id: false },
);

const IvrV2LogSchema = new mongoose.Schema({
  phone_number: { type: String, required: true },
  fsm_id: { type: String, required: true },
  current_state_id: { type: String, required: true },
  created_at: { type: Date, required: true, default: Date.now },
  stopped_at: { type: Date, default: null },
  duration: { type: String, default: "" },
  user_actions: { type: [UserActionSchema], default: [] },
  stream_playback: { type: [StreamPlaybackInfoSchema], default: [] },
  experience_data: { type: mongoose.Schema.Types.Mixed, default: {} },
  call_status_updates: { type: mongoose.Schema.Types.Mixed, default: {} },
  tenant_id: { type: String, required: true },
});

var IvrV2Log = mongoose.model("IvrV2Log", IvrV2LogSchema);

module.exports = IvrV2Log;
