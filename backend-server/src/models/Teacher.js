"use strict";
const mongoose = require("mongoose");

const TeacherSchema = new mongoose.Schema({
  tenantId: {type: String, required: true, index: true},
  phoneNumber: {type: String, required: true, index: true, unique: true},
  password: {type: String, required: true},
  studentId: {type: [String], default: []},
});

const Teacher = mongoose.model("Teacher", TeacherSchema);

module.exports = Teacher;