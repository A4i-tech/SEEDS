"use strict";

const studentRepository = require("../repositories/student.repository");
const { STATUS } = require("../config/constants");

exports.createStudent = async (name, phoneNumber, schoolId) => {
    return studentRepository.createStudent({ name, phoneNumber, schoolId });
};

exports.getStudentsBySchoolId = async (schoolId) => {
    return studentRepository.getStudentsBySchoolId(schoolId);
};

exports.updateStudent = async (studentId, schoolId, updates) => {
    const student = await studentRepository.updateStudent(studentId, schoolId, updates);
    if (!student) {
        const err = new Error("Student not found");
        err.status = STATUS.NOT_FOUND;
        throw err;
    }
    return student;
};

exports.deleteStudent = async (studentId, schoolId) => {
    const student = await studentRepository.deleteStudent(studentId, schoolId);
    if (!student) {
        const err = new Error("Student not found");
        err.status = STATUS.NOT_FOUND;
        throw err;
    }
};
