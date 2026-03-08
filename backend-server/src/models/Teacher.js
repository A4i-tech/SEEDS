"use strict";
const mongoose = require("mongoose");

const TeacherSchema = new mongoose.Schema({
  schoolId: { type: String, required: true, index: true, ref: "School" },
  name: { type: String, required: true },
  phoneNumber: { type: String, required: true, index: true },
  password: { type: String, required: true },
  role: { type: String, enum: ["content_creator", "teacher"], default: "teacher" },
}, { timestamps: true });

TeacherSchema.index({ schoolId: 1, phoneNumber: 1 }, { unique: true });

const Teacher = mongoose.model("Teacher", TeacherSchema);

module.exports = Teacher;
