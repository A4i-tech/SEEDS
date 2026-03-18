"use strict";
const mongoose = require("mongoose");

const TeacherSchema = new mongoose.Schema({
  tenantId: { type: String, required: true, index: true },
  name: { type: String, required: true },
  phoneNumber: { type: String, required: true, index: true },
  password: { type: String, required: true },
  studentId: { type: [String], default: [] },
});

TeacherSchema.index({ tenantId: 1, phoneNumber: 1 }, { unique: true });

const Teacher = mongoose.model("Teacher", TeacherSchema);

module.exports = Teacher;
