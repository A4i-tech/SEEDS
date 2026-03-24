const teacherService = require("../services/teacher.service");
const { STATUS } = require("../config/constants");

exports.addStudents = async (req, res) => {
  try {
    if (!req.body.phoneNumber || !Array.isArray(req.body.students)) {
      return res.status(STATUS.BAD_REQUEST).json({ message: "phoneNumber and students array are required" });
    }
    const result = await teacherService.addStudents({
      students: req.body.students,
      phoneNumber: req.body.phoneNumber,
      tenantId: req.tenantId,
    });
    res.status(STATUS.OK).json(result);
  } catch (err) {
    res.status(err.status || STATUS.INTERNAL_ERROR).json({ message: err.message });
  }
};

exports.getStudents = async (req, res) => {
  try {
    const result = await teacherService.getStudents({
      phoneNumber: req.body.phoneNumber,
      tenantId: req.tenantId,
    });
    return res.json(result);
  } catch (err) {
    return res.status(err.status || STATUS.INTERNAL_ERROR).json({ message: err.message });
  }
};

exports.getTeachers = async (req, res) => {
  try {
    const result = await teacherService.getTeachers({ tenantId: req.tenantId });
    return res.json(result);
  } catch (err) {
    return res.status(err.status || STATUS.INTERNAL_ERROR).json({ message: err.message });
  }
};

exports.removeStudents = async (req, res) => {
  try {
    if (!req.body.phoneNumber || !Array.isArray(req.body.students) || req.body.students.length === 0) {
      return res.status(STATUS.BAD_REQUEST).json({ message: "phoneNumber and non-empty students array are required" });
    }
    
    const result = await teacherService.removeStudents({
      phoneNumber: req.body.phoneNumber,
      students: req.body.students,
      tenantId: req.tenantId,
    });
    return res.status(STATUS.OK).json(result);
  } catch (err) {
    return res.status(err.status || STATUS.INTERNAL_ERROR).json({ message: err.message });
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

    if(!teacherPhoneNumber || !currentPhoneNumber || !name || !studentPhoneNumber) {
      return res.status(STATUS.BAD_REQUEST).json({ message: "All fields are required: phoneNumber, currentPhoneNumber, name, studentPhoneNumber" });
    }

    const result = await teacherService.updateStudent({
      teacherPhoneNumber,
      currentPhoneNumber,
      name,
      studentPhoneNumber,
      tenantId: req.tenantId,
    });
    return res.status(STATUS.OK).json(result);
  } catch (err) {
    return res.status(err.status || STATUS.INTERNAL_ERROR).json({ message: err.message });
  }
};
