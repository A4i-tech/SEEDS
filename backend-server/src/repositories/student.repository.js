"use strict";

const studentDao = require("../dao/mongodb/StudentMongoDao");

exports.createStudent = (data) => studentDao.createStudent(data);

exports.getStudentsBySchoolId = (schoolId) => studentDao.getStudentsBySchoolId(schoolId);

exports.getStudentById = (studentId) => studentDao.getStudentById(studentId);

exports.updateStudent = (studentId, schoolId, updates) => studentDao.updateStudent(studentId, schoolId, updates);

exports.deleteStudent = (studentId, schoolId) => studentDao.deleteStudent(studentId, schoolId);

exports.getStudentCountBySchoolId = (schoolId) => studentDao.getStudentCountBySchoolId(schoolId);
