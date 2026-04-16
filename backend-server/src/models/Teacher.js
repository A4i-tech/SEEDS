"use strict";
const mongoose = require("mongoose");

const TeacherSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: "School", index: true },
    tenantId: { type: String, trim: true, index: true },
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

TeacherSchema.pre("validate", function validateLocation(next) {
  if (!this.schoolId && !this.tenantId) {
    this.invalidate("schoolId", "Either schoolId or tenantId is required");
  }
  next();
});

TeacherSchema.index({ schoolId: 1, phoneNumber: 1 }, { unique: true, sparse: true });
TeacherSchema.index({ tenantId: 1, phoneNumber: 1 }, { unique: true, sparse: true });

const Teacher = mongoose.model("Teacher", TeacherSchema);

module.exports = Teacher;
