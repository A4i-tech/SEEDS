"use strict";
const teacherDao = require("../dao/mongodb/TeacherMongoDao");

exports.findByPhoneAndTenant = (phoneNumber, tenantId) =>
  teacherDao.findByPhoneAndTenant(phoneNumber, tenantId);

exports.findByTenant = (tenantId) => teacherDao.findByTenant(tenantId);

exports.removeStudentLinks = (teacherId, studentIds) =>
  teacherDao.removeStudentIds(teacherId, studentIds.map(String));

exports.linkStudents = async (teacherId, students) => {
  const teacher = await teacherDao.findById(teacherId);
  if (!teacher) {
    throw new Error("Teacher not found");
  }
  const existingSet = new Set((teacher.studentId || []).map(String));

  const newIds = [];
  const newlyAdded = [];
  const alreadyLinked = [];

  for (const s of students) {
    const idStr = String(s._id || s.id);
    if (existingSet.has(idStr)) {
      alreadyLinked.push(s);
    } else {
      newIds.push(idStr);
      newlyAdded.push(s);
    }
  }

  if (newIds.length > 0) {
    await teacherDao.addStudentIds(teacherId, newIds);
  }

  return { newlyAdded, alreadyLinked };
};
