"use strict";

const bcrypt = require("bcryptjs");
const validator = require("validator");

const teacherRepository = require("../repositories/teacher.repository");
const schoolRepository = require("../repositories/school.repository");
const classRepository = require("../repositories/class.repository");
const { STATUS, PASSWORD_POLICY } = require("../config/constants");
const { passwordSaltRounds } = require("../config/env");

/**
 * Get a teacher by ID
 * @param {string} teacherId - The teacher id
 * @returns {Promise<Object>} - The teacher (without password)
 */
exports.getTeacherById = async (teacherId) => {
  const teacher = await teacherRepository.getTeacherById(teacherId);
  if (!teacher) {
    const err = new Error("Teacher not found");
    err.status = STATUS.NOT_FOUND;
    throw err;
  }
  return teacher;
};

/**
 * Get the teacher profile used by /teacher/me, including school name.
 * @param {string} teacherId - The teacher id
 * @param {string} tenantId - The tenant id from the authenticated request
 * @returns {Promise<Object>} - The teacher profile payload
 */
exports.getTeacherProfileById = async (teacherId, tenantId) => {
  const teacher = await exports.getTeacherById(teacherId);
  const school = teacher.schoolId
    ? await schoolRepository.getSchoolById(teacher.schoolId, tenantId)
    : null;

  return {
    name: teacher.name,
    phoneNumber: teacher.phoneNumber,
    role: teacher.role,
    schoolId: teacher.schoolId,
    schoolName: school?.name || "",
  };
};

/**
 * Get all teachers in a school (validates school belongs to tenant)
 * @param {string} schoolId - The school id
 * @param {string} tenantId - The tenant id
 * @returns {Promise<Object[]>} - The teachers
 */
exports.getTeachersBySchoolId = async (schoolId, tenantId) => {
  const school = await schoolRepository.getSchoolById(schoolId, tenantId);
  if (!school) {
    const err = new Error("School not found");
    err.status = STATUS.NOT_FOUND;
    throw err;
  }
  return teacherRepository.getTeachersBySchoolId(schoolId);
};

/**
 * Transfer a teacher to another school within the same tenant
 * @param {string} teacherId - The teacher id
 * @param {string} currentSchoolId - The school the admin is acting on behalf of
 * @param {string} targetSchoolId - The target school id
 * @param {string} tenantId - The tenant id
 * @returns {Promise<Object>} - The updated teacher
 */
exports.transferTeacher = async (teacherId, currentSchoolId, targetSchoolId, tenantId) => {
  const teacherInSource = await teacherRepository.getTeacherById(teacherId);
  if (!teacherInSource || teacherInSource.schoolId.toString() !== currentSchoolId) {
    const err = new Error("Teacher not found in your school");
    err.status = STATUS.NOT_FOUND;
    throw err;
  }
  const targetSchool = await schoolRepository.getSchoolById(targetSchoolId, tenantId);
  if (!targetSchool) {
    const err = new Error("Target school not found");
    err.status = STATUS.NOT_FOUND;
    throw err;
  }
  await classRepository.deleteClassesByTeacherAndSchool(teacherId, currentSchoolId);
  const teacher = await teacherRepository.transferTeacher(
    teacherId,
    currentSchoolId,
    targetSchoolId
  );
  if (!teacher) {
    const err = new Error("Teacher not found");
    err.status = STATUS.NOT_FOUND;
    throw err;
  }
  return teacher;
};

/**
 * Register a new teacher in a school
 */
exports.registerTeacher = async (phoneNumber, password, schoolId, name, role, tenantId) => {
  const school = await schoolRepository.getSchoolById(schoolId, tenantId);
  if (!school) {
    const err = new Error("Invalid school");
    err.status = STATUS.BAD_REQUEST;
    throw err;
  }
  const existing = await teacherRepository.getTeacherBySchoolIdAndPhoneNumber(
    schoolId,
    phoneNumber
  );
  if (existing) {
    const err = new Error("Phone number already in use in this school");
    err.status = STATUS.CONFLICT;
    throw err;
  }
  const hashedPassword = await bcrypt.hash(password, parseInt(passwordSaltRounds));
  return teacherRepository.insertTeacher({
    phoneNumber,
    password: hashedPassword,
    schoolId,
    name,
    role,
  });
};

/**
 * Update a teacher's name, phone number, and/or password
 */
exports.updateTeacher = async (teacherId, schoolId, { name, phoneNumber, password }) => {
  const updates = {};
  if (name) updates.name = name.trim();
  if (phoneNumber) {
    if (!validator.isMobilePhone(phoneNumber)) {
      const err = new Error("Invalid phone number format");
      err.status = STATUS.BAD_REQUEST;
      throw err;
    }
    updates.phoneNumber = phoneNumber;
  }
  if (password) {
    if (!validator.isStrongPassword(password, PASSWORD_POLICY)) {
      const err = new Error(
        "Password must be at least 8 characters, and include uppercase, lowercase, number, and special character"
      );
      err.status = STATUS.BAD_REQUEST;
      throw err;
    }
    updates.password = await bcrypt.hash(password, parseInt(passwordSaltRounds));
  }
  const teacher = await teacherRepository.updateTeacher(teacherId, schoolId, updates);
  if (!teacher) {
    const err = new Error("Teacher not found");
    err.status = STATUS.NOT_FOUND;
    throw err;
  }
  return teacher;
};

/**
 * Delete a teacher from a school
 */
exports.deleteTeacher = async (teacherId, schoolId) => {
  const teacher = await teacherRepository.getTeacherById(teacherId);
  if (!teacher || teacher.schoolId.toString() !== schoolId) {
    const err = new Error("Teacher not found");
    err.status = STATUS.NOT_FOUND;
    throw err;
  }

  await classRepository.deleteClassesByTeacherAndSchool(teacherId, schoolId);
  const deleted = await teacherRepository.deleteTeacher(teacherId, schoolId);
  if (!deleted) {
    const err = new Error("Teacher not found");
    err.status = STATUS.NOT_FOUND;
    throw err;
  }

  return deleted;
};
