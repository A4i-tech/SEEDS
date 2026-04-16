"use strict";
const mongoose = require("mongoose");

const TeacherSchema = new mongoose.Schema(
  {
    tenantId: { type: String, required: true, trim: true, index: true },
    name: { type: String, required: true, trim: true, minlength: 1, maxlength: 120 },
    phoneNumber: {
      type: String,
      required: true,
      trim: true,
      index: true,
      unique: true,
    },
    password: { type: String, required: true, minlength: 8 },
    role: { type: String, enum: ["teacher", "content_creator"], default: "teacher", required: true },
    studentId: { type: [String], default: [] },
  },
  { timestamps: true }
);

const Teacher = mongoose.model("Teacher", TeacherSchema);

module.exports = Teacher;
