"use strict";

const { secretKey, jwtExpiresIn } = require("../../config/env");
const { STATUS } = require("../../config/constants");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");

const teacherRepository = require("../../repositories/teacher.repository");

function generateToken(payload) {
  return jwt.sign(payload, secretKey, {
    expiresIn: jwtExpiresIn,
    issuer: "teacher",
  });
}

module.exports = {
  async login(req, res) {
    const { phoneNumber, password } = req.body;
    if (!phoneNumber || !password) {
      return res
        .status(STATUS.BAD_REQUEST)
        .json({ message: "Phone number and password are required" });
    }
    try {
      const teacher = await teacherRepository.getTeacherByPhoneNumber(phoneNumber);
      if (!teacher) {
        return res.status(STATUS.UNAUTHORIZED).json({ message: "Invalid credentials" });
      }
      const passwordMatch = await bcrypt.compare(password, teacher.password);
      if (!passwordMatch) {
        return res.status(STATUS.UNAUTHORIZED).json({ message: "Invalid credentials" });
      }
      const token = generateToken({
        id: teacher._id || teacher.id,
        phoneNumber: teacher.phoneNumber,
        name: teacher.name,
        schoolId: teacher.schoolId,
        role: teacher.role,
      });
      return res.status(STATUS.OK).json({ token });
    } catch (error) {
      console.error("Login error:", error);
      return res.status(STATUS.INTERNAL_ERROR).json({ message: "Internal server error" });
    }
  },
};
