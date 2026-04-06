"use strict";

const { secretKey, jwtExpiresIn, passwordSaltRounds } = require("../../config/env");
const { STATUS, PASSWORD_POLICY } = require("../../config/constants");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const validator = require("validator");

const schoolRepository = require("../../repositories/school.repository");

const SCHOOL_ADMIN_ROLE = "school_admin";

function generateToken(payload) {
  return jwt.sign(payload, secretKey, {
    expiresIn: jwtExpiresIn,
    issuer: SCHOOL_ADMIN_ROLE,
  });
}

module.exports = {
  async login(req, res) {
    const { email, password } = req.body;
    if (!email || !password) {
      return res
        .status(STATUS.BAD_REQUEST)
        .json({ message: "Email and password are required" });
    }
    try {
      const school = await schoolRepository.getSchoolByEmail(email);
      if (!school || !school.password) {
        return res.status(STATUS.UNAUTHORIZED).json({ message: "Invalid credentials" });
      }
      if (!school.isActive) {
        return res.status(STATUS.UNAUTHORIZED).json({ message: "Account is inactive" });
      }
      const passwordMatch = await bcrypt.compare(password, school.password);
      if (!passwordMatch) {
        return res.status(STATUS.UNAUTHORIZED).json({ message: "Invalid credentials" });
      }
      const schoolId = school._id.toString();
      const token = generateToken({
        id: schoolId,
        email: school.email,
        name: school.name,
        schoolId,
        tenantId: school.tenantId,
        role: SCHOOL_ADMIN_ROLE,
      });
      return res.status(STATUS.OK).json({
        token,
        schoolId,
        schoolName: school.name,
      });
    } catch (error) {
      console.error("School admin login error:", error);
      return res.status(STATUS.INTERNAL_ERROR).json({ message: "Internal server error" });
    }
  },

  async getMe(req, res) {
    try {
      const school = await schoolRepository.getSchoolById(req.userId, req.tenantId);
      if (!school) {
        return res.status(STATUS.NOT_FOUND).json({ message: "School not found" });
      }
      return res.status(STATUS.OK).json(school);
    } catch (error) {
      console.error("School admin getMe error:", error);
      return res.status(STATUS.INTERNAL_ERROR).json({ message: "Internal server error" });
    }
  },

  async update(req, res) {
    const schoolId = req.schoolId;
    const tenantId = req.tenantId;
    const { name, email, password } = req.body;

    if (!name && !email && !password) {
      return res.status(STATUS.BAD_REQUEST).json({ message: "At least one field (name, email, password) is required" });
    }

    const updates = {};
    if (name) updates.name = name.trim();
    if (email) {
      const trimmedEmail = email.trim();
      if (!validator.isEmail(trimmedEmail)) {
        return res.status(STATUS.BAD_REQUEST).json({ message: "Must be a valid email" });
      }
      updates.email = trimmedEmail;
    }
    if (password) {
      if (!validator.isStrongPassword(password, PASSWORD_POLICY)) {
        return res.status(STATUS.BAD_REQUEST).json({
          message: "Password must be at least 8 characters, and include uppercase, lowercase, number, and special character",
        });
      }
      updates.password = await bcrypt.hash(password, parseInt(passwordSaltRounds));
    }

    try {
      const school = await schoolRepository.getSchoolById(schoolId, tenantId);
      if (!school) {
        return res.status(STATUS.NOT_FOUND).json({ message: "School not found" });
      }
      Object.assign(school, updates);
      const updated = await schoolRepository.updateSchool(school);
      return res.status(STATUS.OK).json(updated);
    } catch (error) {
      if (error.code === 11000) {
        return res.status(STATUS.CONFLICT).json({ message: "Email already in use" });
      }
      console.error("Update school error:", error);
      return res.status(STATUS.INTERNAL_ERROR).json({ message: "Internal server error" });
    }
  },
};
