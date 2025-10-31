"use strict";
const mongoose = require("mongoose");

const StudentSchema = new mongoose.Schema({
  name: { type: String },
  phone_number: { type: String }
}, { _id: false });

const TeacherSchema = new mongoose.Schema({
  tenantName: {type: String, required: true, index: true},
  phoneNumber: {type: String, required: true, index: true, unique: true},
  password: {type: String, required: true},
  students: [StudentSchema]
});

const Teacher = mongoose.model("Teacher", TeacherSchema);
function getTeacherByPhoneNumber(phoneNumber) {
  return Teacher.findOne({ phoneNumber: phoneNumber });
}
function setStudentsByPhoneNumber(phoneNumber, students) {
  return Teacher.findOneAndUpdate(
    { phoneNumber: phoneNumber },
    { students: students },
    { new: true, runValidators: true }
  );
}
module.exports = {Teacher, getTeacherByPhoneNumber, setStudentsByPhoneNumber};