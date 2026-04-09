"use strict";

const { STATUS } = require("../config/constants");
const studentService = require("../services/student.service");

exports.createStudent = async (req, res) => {
    const { name, phoneNumber } = req.body;
    const schoolId = req.schoolId;
    if (!name || typeof name !== "string" || name.trim().length === 0 || !phoneNumber) {
        return res.status(STATUS.BAD_REQUEST).json({ message: "name and phoneNumber are required" });
    }
    try {
        const student = await studentService.createStudent(name.trim(), phoneNumber, schoolId);
        return res.status(STATUS.CREATED).json(student);
    } catch (error) {
        if (error.code === 11000) {
            return res.status(STATUS.CONFLICT).json({ message: "Phone number already in use in this school" });
        }
        return res.status(STATUS.INTERNAL_ERROR).json({ message: "Internal server error" });
    }
};

exports.getStudents = async (req, res) => {
    try {
        const students = await studentService.getStudentsBySchoolId(req.schoolId);
        return res.status(STATUS.OK).json(students);
    } catch (error) {
        return res.status(STATUS.INTERNAL_ERROR).json({ message: "Internal server error" });
    }
};

exports.updateStudent = async (req, res) => {
    const { studentId } = req.params;
    const { name, phoneNumber } = req.body;
    if (!name && !phoneNumber) {
        return res.status(STATUS.BAD_REQUEST).json({ message: "name or phoneNumber is required" });
    }
    const updates = {};
    if (name) updates.name = name.trim();
    if (phoneNumber) updates.phoneNumber = phoneNumber;
    try {
        const student = await studentService.updateStudent(studentId, req.schoolId, updates);
        return res.status(STATUS.OK).json(student);
    } catch (error) {
        if (error.status === STATUS.NOT_FOUND) {
            return res.status(STATUS.NOT_FOUND).json({ message: error.message });
        }
        if (error.code === 11000) {
            return res.status(STATUS.CONFLICT).json({ message: "Phone number already in use in this school" });
        }
        return res.status(STATUS.INTERNAL_ERROR).json({ message: "Internal server error" });
    }
};

exports.deleteStudent = async (req, res) => {
    const { studentId } = req.params;
    try {
        await studentService.deleteStudent(studentId, req.schoolId);
        return res.status(STATUS.OK).json({ message: "Student deleted successfully" });
    } catch (error) {
        if (error.status === STATUS.NOT_FOUND) {
            return res.status(STATUS.NOT_FOUND).json({ message: error.message });
        }
        return res.status(STATUS.INTERNAL_ERROR).json({ message: "Internal server error" });
    }
};
