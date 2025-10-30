"use strict";
const mongoose = require("mongoose");

const TeacherSchema = new mongoose.Schema({
  tenantName: {type: String, required: true, index: true},
  phoneNumber: {type: String, required: true, index: true, unique: true},
  password: {type: String, required: true},
  students: [String]
});

var Teacher = (module.exports = mongoose.model("Teacher", TeacherSchema));

module.exports.getTeacherById = phoneNumber => {
  return Teacher.findOne(
    {phoneNumber}
  ).exec()
}

module.exports.setStudentsByTeacherId = (phoneNumber, students) => {
  return Teacher.findOneAndUpdate(
    {phoneNumber},
    {$set: {students}},
    {new: true}
  ).exec()
}
