"use strict";

const bcrypt = require("bcryptjs");
const validator = require("validator");

const teacherRepository = require("../repositories/teacher.repository");
const schoolRepository = require("../repositories/school.repository");
const classRepository = require("../repositories/class.repository");
const studentRepository = require("../repositories/student.repository");
const { STATUS, PASSWORD_POLICY } = require("../config/constants");
const { passwordSaltRounds } = require("../config/env");

function normalizeStudents(students) {
  const normalized = [];

  for (const student of students) {
    if (!student?.name || !student?.phoneNumber) {
      continue;
    }

    const name = student.name.trim();
    const phoneNumber = student.phoneNumber.trim();
    if (!name || !phoneNumber) {
      continue;
    }

    normalized.push({
      name,
      phoneNumber,
      updateName: Boolean(student.updateName),
    });
  }

  return normalized;
}

exports.addStudents = async ({ students = [], phoneNumber, tenantId, schoolId }) => {
  if (!Array.isArray(students) || students.length === 0) {
    const err = new Error("Students array is required and cannot be empty");
    err.status = STATUS.BAD_REQUEST;
    throw err;
  }

  const teacher = await teacherRepository.findByPhoneAndTenant(phoneNumber, tenantId);
  if (!teacher) {
    const err = new Error("Teacher not found with the provided phone number");
    err.status = STATUS.NOT_FOUND;
    throw err;
  }
  if (schoolId && String(teacher.schoolId) !== String(schoolId)) {
    const err = new Error("Teacher not found with the provided phone number");
    err.status = STATUS.NOT_FOUND;
    throw err;
  }

  const normalizedStudents = normalizeStudents(students);
  if (normalizedStudents.length === 0) {
    const err = new Error("No valid student entries provided");
    err.status = STATUS.BAD_REQUEST;
    throw err;
  }

  const existingStudents = await studentRepository.findByPhones(
    normalizedStudents.map((student) => student.phoneNumber)
  );
  const existingByPhone = new Map(
    existingStudents.map((student) => [student.phoneNumber, student])
  );

  const toInsert = [];
  const toUpdate = [];
  const duplicates = [];
  const resolved = [];

  for (const student of normalizedStudents) {
    const existingStudent = existingByPhone.get(student.phoneNumber);
    if (!existingStudent) {
      toInsert.push({
        name: student.name,
        phoneNumber: student.phoneNumber,
        schoolId: teacher.schoolId || undefined,
      });
      continue;
    }

    if (existingStudent.name === student.name) {
      resolved.push(existingStudent);
      continue;
    }

    if (student.updateName) {
      toUpdate.push({ _id: existingStudent._id, name: student.name });
      resolved.push({ ...existingStudent, name: student.name });
      continue;
    }

    duplicates.push({
      phoneNumber: student.phoneNumber,
      existingName: existingStudent.name,
      submittedName: student.name,
    });
  }

  if (toUpdate.length > 0) {
    await studentRepository.bulkUpdateNames(toUpdate);
  }

  const insertedStudents =
    toInsert.length > 0 ? await studentRepository.insertManySafe(toInsert) : [];
  const allStudents = [...resolved, ...insertedStudents];
  const { newlyAdded, alreadyLinked } = await teacherRepository.linkStudents(
    teacher._id,
    allStudents
  );

  return {
    students: newlyAdded.map((student) => ({
      name: student.name,
      phoneNumber: student.phoneNumber,
    })),
    ...(duplicates.length > 0 ? { duplicates } : {}),
    ...(alreadyLinked.length > 0
      ? {
          alreadyLinked: alreadyLinked.map((student) => ({
            name: student.name,
            phoneNumber: student.phoneNumber,
          })),
        }
      : {}),
  };
};

exports.getStudents = async ({ phoneNumber, tenantId }) => {
  const teacher = await teacherRepository.findByPhoneAndTenant(phoneNumber, tenantId);
  if (!teacher) {
    const err = new Error("Teacher not found");
    err.status = STATUS.NOT_FOUND;
    throw err;
  }

  const studentIds = Array.isArray(teacher.studentId) ? teacher.studentId : [];
  if (studentIds.length === 0) {
    return [];
  }

  const students = await studentRepository.findManyByIds(studentIds);
  return students.map((student) => ({
    name: student.name,
    phoneNumber: student.phoneNumber,
  }));
};

exports.getTeachers = async ({ tenantId }) => {
  const teachers = await teacherRepository.findByTenant(tenantId);
  if (!teachers || teachers.length === 0) {
    return [];
  }

  const studentIdSet = new Set();
  for (const teacher of teachers) {
    for (const studentId of teacher.studentId || []) {
      if (studentId) {
        studentIdSet.add(String(studentId));
      }
    }
  }

  const students =
    studentIdSet.size > 0
      ? await studentRepository.findManyByIds(Array.from(studentIdSet))
      : [];
  const studentById = {};
  for (const student of students) {
    studentById[String(student._id)] = student;
  }

  return teachers.map((teacher) => ({
    _id: teacher._id,
    name: teacher.name,
    phoneNumber: teacher.phoneNumber,
    students: (teacher.studentId || [])
      .map((studentId) => {
        const student = studentById[String(studentId)];
        return student
          ? { name: student.name, phoneNumber: student.phoneNumber }
          : null;
      })
      .filter(Boolean),
  }));
};

exports.removeStudents = async ({ phoneNumber, students, tenantId, schoolId }) => {
  if (!Array.isArray(students) || students.length === 0) {
    const err = new Error("Students array is required and cannot be empty");
    err.status = STATUS.BAD_REQUEST;
    throw err;
  }

  const teacher = await teacherRepository.findByPhoneAndTenant(phoneNumber, tenantId);
  if (!teacher) {
    const err = new Error("Teacher not found");
    err.status = STATUS.NOT_FOUND;
    throw err;
  }
  if (schoolId && String(teacher.schoolId) !== String(schoolId)) {
    const err = new Error("Teacher not found");
    err.status = STATUS.NOT_FOUND;
    throw err;
  }

  const phoneNumbers = students.map((student) => student.phoneNumber).filter(Boolean);
  const foundStudents = await studentRepository.findByPhones(phoneNumbers);

  if (foundStudents.length > 0) {
    await teacherRepository.removeStudentLinks(
      teacher._id,
      foundStudents.map((student) => student._id)
    );
  }

  return {
    message: "Students removed successfully",
    removedCount: foundStudents.length,
  };
};

exports.updateStudent = async ({
  teacherPhoneNumber,
  currentPhoneNumber,
  name,
  studentPhoneNumber,
  tenantId,
  schoolId,
}) => {
  const teacher = await teacherRepository.findByPhoneAndTenant(
    teacherPhoneNumber,
    tenantId
  );
  if (!teacher) {
    const err = new Error("Teacher not found");
    err.status = STATUS.NOT_FOUND;
    throw err;
  }
  if (schoolId && String(teacher.schoolId) !== String(schoolId)) {
    const err = new Error("Teacher not found");
    err.status = STATUS.NOT_FOUND;
    throw err;
  }

  const student = await studentRepository.findOneByPhone(currentPhoneNumber);
  if (!student) {
    const err = new Error("Student not found");
    err.status = STATUS.NOT_FOUND;
    throw err;
  }

  const ownsStudent = (teacher.studentId || []).some(
    (studentId) => String(studentId) === String(student._id)
  );
  if (!ownsStudent) {
    const err = new Error("Student does not belong to this teacher");
    err.status = STATUS.FORBIDDEN;
    throw err;
  }

  const nextName = name.trim();
  const nextPhoneNumber = studentPhoneNumber.trim();
  if (!nextName || !nextPhoneNumber) {
    const err = new Error("Name and phone number are required");
    err.status = STATUS.BAD_REQUEST;
    throw err;
  }

  if (nextPhoneNumber !== currentPhoneNumber) {
    const existingStudent = await studentRepository.findOneByPhone(nextPhoneNumber);
    if (existingStudent && String(existingStudent._id) !== String(student._id)) {
      const err = new Error("A phone number already exists");
      err.status = STATUS.CONFLICT;
      throw err;
    }
  }

  const updatedStudent = await studentRepository.updateById(student._id, {
    name: nextName,
    phoneNumber: nextPhoneNumber,
  });

  return {
    name: updatedStudent.name,
    phoneNumber: updatedStudent.phoneNumber,
  };
};

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
  const teachers = await teacherRepository.getTeachersBySchoolId(schoolId);
  const studentIdSet = new Set();

  for (const teacher of teachers) {
    for (const studentId of teacher.studentId || []) {
      if (studentId) {
        studentIdSet.add(String(studentId));
      }
    }
  }

  const students =
    studentIdSet.size > 0
      ? await studentRepository.findManyByIds(Array.from(studentIdSet))
      : [];
  const studentById = {};

  for (const student of students) {
    studentById[String(student._id)] = student;
  }

  return teachers.map((teacher) => ({
    _id: teacher._id,
    name: teacher.name,
    phoneNumber: teacher.phoneNumber,
    role: teacher.role,
    students: (teacher.studentId || [])
      .map((studentId) => {
        const student = studentById[String(studentId)];
        return student
          ? { _id: student._id, name: student.name, phoneNumber: student.phoneNumber }
          : null;
      })
      .filter(Boolean),
  }));
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
    tenantId,
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
