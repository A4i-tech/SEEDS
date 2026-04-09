"use strict";

const studentDao = require("../dao/mongodb/StudentMongoDao");

exports.findByPhones = (phones) => studentDao.findByPhones(phones);

exports.findOneByPhone = (phoneNumber) => studentDao.findOneByPhone(phoneNumber);

exports.findManyByIds = (ids) => studentDao.findByIds(ids);

exports.updateById = (id, data) => studentDao.updateById(id, data);

exports.bulkUpdateNames = (updates) => studentDao.bulkUpdateNames(updates);

exports.insertManySafe = (data) => studentDao.insertMany(data);

exports.createStudent = (data) => studentDao.createStudent(data);

exports.getStudentsBySchoolId = (schoolId) => studentDao.getStudentsBySchoolId(schoolId);

exports.getStudentById = (studentId) => studentDao.getStudentById(studentId);

exports.updateStudent = (studentId, schoolId, updates) => studentDao.updateStudent(studentId, schoolId, updates);

exports.deleteStudent = (studentId, schoolId) => studentDao.deleteStudent(studentId, schoolId);

exports.getStudentCountBySchoolId = (schoolId) => studentDao.getStudentCountBySchoolId(schoolId);
