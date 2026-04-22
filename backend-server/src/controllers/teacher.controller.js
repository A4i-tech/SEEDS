"use strict";

const validator = require("validator");
const { STATUS, PASSWORD_POLICY } = require("../config/constants");
const teacherService = require("../services/teacher.service");
const School = require("../models/School");

exports.getMe = async (req, res) => {
  try {
    const teacher = await teacherService.getTeacherById(req.userId);
    const school = teacher?.schoolId
      ? await School.findById(teacher.schoolId).select("name").lean()
      : null;

    return res.status(STATUS.OK).json({
      name: teacher.name,
      phoneNumber: teacher.phoneNumber,
      role: teacher.role,
      schoolId: teacher.schoolId,
      schoolName: school?.name || "",
    });
  } catch (error) {
    if (error.status === STATUS.NOT_FOUND) {
      return res.status(STATUS.NOT_FOUND).json({ message: "Teacher not found" });
    }
    return res.status(STATUS.INTERNAL_ERROR).json({ message: "Internal server error" });
  }
};

exports.getTeachersBySchool = async (req, res) => {
  try {
    const schoolId = req.schoolId;
    const tenantId = req.tenantId;
    const teachers = await teacherService.getTeachersBySchoolId(schoolId, tenantId);
    return res.status(STATUS.OK).json(teachers);
  } catch (error) {
    if (error.status === STATUS.NOT_FOUND) {
      return res.status(STATUS.NOT_FOUND).json({ message: "School not found" });
    }
    return res.status(STATUS.INTERNAL_ERROR).json({ message: "Internal server error" });
  }
};

exports.transferTeacher = async (req, res) => {
  try {
    const { teacherId, targetSchoolId } = req.body;
    if (!teacherId || !targetSchoolId) {
      return res
        .status(STATUS.BAD_REQUEST)
        .json({ message: "teacherId and targetSchoolId are required" });
    }
    const currentSchoolId = req.schoolId;
    const tenantId = req.tenantId;
    const teacher = await teacherService.transferTeacher(
      teacherId,
      currentSchoolId,
      targetSchoolId,
      tenantId
    );
    return res.status(STATUS.OK).json({ message: "Teacher transferred successfully", teacher });
  } catch (error) {
    if (error.status === STATUS.NOT_FOUND) {
      return res.status(STATUS.NOT_FOUND).json({ message: error.message });
    }
    return res.status(STATUS.INTERNAL_ERROR).json({ message: "Internal server error" });
  }
};

exports.register = async (req, res) => {
  const { phoneNumber, password, name, role } = req.body;
  const schoolId = req.schoolId;
  const tenantId = req.tenantId;
  const trimmedName = name != null && typeof name === "string" ? name.trim() : "";

  if (!phoneNumber || !password || !schoolId || trimmedName.length === 0 || !role) {
    return res
      .status(STATUS.BAD_REQUEST)
      .json({ message: "Phone number, password, schoolId, name, and role are required" });
  }
  if (!validator.isMobilePhone(phoneNumber)) {
    return res.status(STATUS.BAD_REQUEST).json({ message: "Invalid phone number format" });
  }
  if (!validator.isStrongPassword(password, PASSWORD_POLICY)) {
    return res.status(STATUS.BAD_REQUEST).json({
      message:
        "Password must be at least 8 characters, and include uppercase, lowercase, number, and special character",
    });
  }

  try {
    await teacherService.registerTeacher(
      phoneNumber,
      password,
      schoolId,
      trimmedName,
      role,
      tenantId
    );
    return res.status(STATUS.CREATED).json({ message: "Teacher registered successfully" });
  } catch (error) {
    if (error.status === STATUS.BAD_REQUEST) {
      return res.status(STATUS.BAD_REQUEST).json({ message: error.message });
    }
    if (error.status === STATUS.CONFLICT) {
      return res.status(STATUS.CONFLICT).json({ message: error.message });
    }
    return res.status(STATUS.INTERNAL_ERROR).json({ message: "Internal server error" });
  }
};

exports.update = async (req, res) => {
  const { teacherId } = req.params;
  const schoolId = req.schoolId;
  const { name, phoneNumber, password } = req.body;

  if (!name && !phoneNumber && !password) {
    return res
      .status(STATUS.BAD_REQUEST)
      .json({ message: "At least one field (name, phoneNumber, password) is required" });
  }

  try {
    const teacher = await teacherService.updateTeacher(teacherId, schoolId, {
      name,
      phoneNumber,
      password,
    });
    return res.status(STATUS.OK).json(teacher);
  } catch (error) {
    if (error.status === STATUS.BAD_REQUEST) {
      return res.status(STATUS.BAD_REQUEST).json({ message: error.message });
    }
    if (error.status === STATUS.NOT_FOUND) {
      return res.status(STATUS.NOT_FOUND).json({ message: error.message });
    }
    if (error.code === 11000) {
      return res
        .status(STATUS.CONFLICT)
        .json({ message: "Phone number already in use in this school" });
    }
    return res.status(STATUS.INTERNAL_ERROR).json({ message: "Internal server error" });
  }
};

exports.delete = async (req, res) => {
  const { teacherId } = req.params;
  const schoolId = req.schoolId;

  if (!teacherId) {
    return res.status(STATUS.BAD_REQUEST).json({ message: "teacherId is required" });
  }

  try {
    await teacherService.deleteTeacher(teacherId, schoolId);
    return res.status(STATUS.OK).json({ message: "Teacher deleted successfully" });
  } catch (error) {
    if (error.status === STATUS.NOT_FOUND) {
      return res.status(STATUS.NOT_FOUND).json({ message: error.message });
    }
    return res.status(STATUS.INTERNAL_ERROR).json({ message: "Internal server error" });
  }
};

exports.addStudents = async (req, res) => {
  try {
    if (!req.body.phoneNumber || !Array.isArray(req.body.students)) {
      return res
        .status(STATUS.BAD_REQUEST)
        .json({ message: "phoneNumber and students array are required" });
    }

    const result = await teacherService.addStudents({
      students: req.body.students,
      phoneNumber: req.body.phoneNumber,
      tenantId: req.tenantId,
      schoolId: req.schoolId,
    });
    return res.status(STATUS.OK).json(result);
  } catch (error) {
    return res.status(error.status || STATUS.INTERNAL_ERROR).json({ message: error.message });
  }
};

exports.getStudents = async (req, res) => {
  try {
    const result = await teacherService.getStudents({
      phoneNumber: req.body.phoneNumber,
      tenantId: req.tenantId,
    });
    return res.json(result);
  } catch (error) {
    return res.status(error.status || STATUS.INTERNAL_ERROR).json({ message: error.message });
  }
};

exports.getTeachers = async (req, res) => {
  try {
    const result = await teacherService.getTeachers({ tenantId: req.tenantId });
    return res.json(result);
  } catch (error) {
    return res.status(error.status || STATUS.INTERNAL_ERROR).json({ message: error.message });
  }
};

exports.removeStudents = async (req, res) => {
  try {
    if (!req.body.phoneNumber || !Array.isArray(req.body.students) || req.body.students.length === 0) {
      return res
        .status(STATUS.BAD_REQUEST)
        .json({ message: "phoneNumber and non-empty students array are required" });
    }

    const result = await teacherService.removeStudents({
      phoneNumber: req.body.phoneNumber,
      students: req.body.students,
      tenantId: req.tenantId,
      schoolId: req.schoolId,
    });
    return res.status(STATUS.OK).json(result);
  } catch (error) {
    return res.status(error.status || STATUS.INTERNAL_ERROR).json({ message: error.message });
  }
};

exports.updateStudent = async (req, res) => {
  try {
    const {
      phoneNumber: teacherPhoneNumber,
      currentPhoneNumber,
      name,
      studentPhoneNumber,
    } = req.body;

    if (!teacherPhoneNumber || !currentPhoneNumber || !name || !studentPhoneNumber) {
      return res.status(STATUS.BAD_REQUEST).json({
        message:
          "All fields are required: phoneNumber, currentPhoneNumber, name, studentPhoneNumber",
      });
    }

    const result = await teacherService.updateStudent({
      teacherPhoneNumber,
      currentPhoneNumber,
      name,
      studentPhoneNumber,
      tenantId: req.tenantId,
      schoolId: req.schoolId,
    });
    return res.status(STATUS.OK).json(result);
  } catch (error) {
    return res.status(error.status || STATUS.INTERNAL_ERROR).json({ message: error.message });
  }
};
