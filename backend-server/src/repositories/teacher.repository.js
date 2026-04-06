"use strict";

const teacherDao = require("../dao/mongodb/TeacherMongoDao");

exports.getTeacherById = async (teacherId) => {
  return teacherDao.getTeacherById(teacherId);
};

exports.getTeacherByPhoneNumber = async (phoneNumber) => {
  return teacherDao.getTeacherByPhoneNumber(phoneNumber);
};

exports.getTeachersBySchoolId = async (schoolId) => {
  return teacherDao.getTeachersBySchoolId(schoolId);
};

exports.transferTeacher = async (teacherId, currentSchoolId, targetSchoolId) => {
  return teacherDao.transferTeacher(teacherId, currentSchoolId, targetSchoolId);
};

exports.getTeacherCountBySchoolId = async (schoolId) => {
  return teacherDao.getTeacherCountBySchoolId(schoolId);
};

exports.getTeacherBySchoolIdAndPhoneNumber = async (schoolId, phoneNumber) => {
  return teacherDao.getTeacherBySchoolIdAndPhoneNumber(schoolId, phoneNumber);
};

exports.insertTeacher = async (data) => {
  return teacherDao.insertTeacher(data);
};

exports.updateTeacher = async (teacherId, schoolId, updates) => {
  return teacherDao.updateTeacher(teacherId, schoolId, updates);
};

exports.deleteTeacher = async (teacherId, schoolId) => {
  return teacherDao.deleteTeacher(teacherId, schoolId);
};
