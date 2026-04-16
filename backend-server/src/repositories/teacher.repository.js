"use strict";

const teacherDao = require("../dao/mongodb/TeacherMongoDao");

exports.findByPhoneAndTenant = async (phoneNumber, tenantId) => {
  return teacherDao.findByPhoneAndTenant(phoneNumber, tenantId);
};

exports.findByTenant = async (tenantId) => {
  return teacherDao.findByTenant(tenantId);
};

exports.removeStudentLinks = async (teacherId, studentIds) => {
  return teacherDao.removeStudentIds(
    teacherId,
    studentIds.map((studentId) => String(studentId))
  );
};

exports.linkStudents = async (teacherId, students) => {
  const teacher = await teacherDao.findById(teacherId);
  if (!teacher) {
    throw new Error("Teacher not found");
  }

  const existingStudentIds = new Set((teacher.studentId || []).map(String));
  const newStudentIds = [];
  const newlyAdded = [];
  const alreadyLinked = [];

  for (const student of students) {
    const id = String(student._id || student.id);
    if (existingStudentIds.has(id)) {
      alreadyLinked.push(student);
      continue;
    }

    newStudentIds.push(id);
    newlyAdded.push(student);
  }

  if (newStudentIds.length > 0) {
    await teacherDao.addStudentIds(teacherId, newStudentIds);
  }

  return { newlyAdded, alreadyLinked };
};

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
