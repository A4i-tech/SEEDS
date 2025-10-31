"use strict";
const mongoose = require("mongoose");

const TeacherSchema = new mongoose.Schema({
  tenantName: {type: String, required: true, index: true},
  phoneNumber: {type: String, required: true, index: true, unique: true},
  password: {type: String, required: true},
  students: [String]
});

const Teacher = mongoose.model("Teacher", TeacherSchema);
function getTeacherById(id) {
  return Teacher.findById(id);
}
function setStudentsByTeacherId(teacherId, students) {
  return Teacher.findByIdAndUpdate(
    teacherId,
    {students: students},
    {new: true}
  );
}
module.exports = {Teacher, getTeacherById, setStudentsByTeacherId};