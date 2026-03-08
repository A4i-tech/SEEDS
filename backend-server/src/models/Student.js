"use strict";
const mongoose = require("mongoose");

const StudentSchema = new mongoose.Schema({
  schoolId: { type: String, required: true, index: true, ref: "School" },
  name: { type: String, required: true },
  phoneNumber: { type: String, required: true, unique: true },
}, { timestamps: true });

StudentSchema.index({ schoolId: 1, phoneNumber: 1 }, { unique: true });
StudentSchema.index({ schoolId: 1 });

const Student = mongoose.model("Student", StudentSchema);
module.exports = Student;
