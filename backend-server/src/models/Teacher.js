"use strict";
const mongoose = require("mongoose");

const TeacherSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true, ref: "School" },
    name: { type: String, required: true, trim: true, minlength: 1, maxlength: 120 },
    phoneNumber: { type: String, required: true, unique: true },
    password: { type: String, required: true, minlength: 8 },
    role: { type: String, enum: ["content_creator", "teacher"], default: "teacher" },
  },
  { timestamps: true }
);

TeacherSchema.index({ schoolId: 1, phoneNumber: 1 }, { unique: true });

const Teacher = mongoose.model("Teacher", TeacherSchema);

module.exports = Teacher;
