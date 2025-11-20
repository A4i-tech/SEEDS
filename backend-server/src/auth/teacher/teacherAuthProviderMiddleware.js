const {
  authType,
  secretKey,
  jwtExpiresIn,
  passwordSaltRounds,
} = require("../../config/env");
const { STATUS, PASSWORD_POLICY } = require("../../config/constants");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const validator = require("validator");

const nativeDb = require("../dbAdapters/nativeDb");
const firebaseDb = require("../dbAdapters/firebaseDb");

const dbAdapter = authType === "firebase" ? firebaseDb : nativeDb;

function generateToken(payload) {
  return jwt.sign(payload, secretKey, {
    expiresIn: jwtExpiresIn,
    issuer: "teacher",
  });
}

module.exports = {
  async login(req, res) {
    const { phoneNumber, password, tenantId } = req.body;
    if (!phoneNumber || !password || !tenantId) {
      return res
        .status(STATUS.BAD_REQUEST)
        .json({ message: "Phone number, password, and tenantId are required" });
    }
    try {
      const teacher = await dbAdapter.getTeacherByTenantIdAndPhoneNumber(
        tenantId,
        phoneNumber,
      );
      if (!teacher) {
        return res
          .status(STATUS.UNAUTHORIZED)
          .json({ message: "Teacher is not registered with this tenant" });
      }
      const passwordMatch = await bcrypt.compare(password, teacher.password);
      if (!passwordMatch) {
        return res
          .status(STATUS.UNAUTHORIZED)
          .json({ message: "Invalid credentials" });
      }
      const token = generateToken({
        id: teacher._id || teacher.id,
        phoneNumber: teacher.phoneNumber,
        name: teacher.name,
      });
      return res.status(STATUS.OK).json({ token, phoneNumber });
    } catch (error) {
      console.error("Login error:", error);
      return res
        .status(STATUS.INTERNAL_ERROR)
        .json({ message: "Internal server error" });
    }
  },
  async register(req, res) {
    const { phoneNumber, password, tenantId } = req.body;
    if (!phoneNumber || !password || !tenantId) {
      return res
        .status(STATUS.BAD_REQUEST)
        .json({
          message: "Phone number, password, and tenantName are required",
        });
    }
    if (!validator.isMobilePhone(phoneNumber)) {
      return res
        .status(STATUS.BAD_REQUEST)
        .json({ message: "Invalid phone number format" });
    }
    if (!validator.isStrongPassword(password, PASSWORD_POLICY)) {
      return res
        .status(STATUS.BAD_REQUEST)
        .json({
          message:
            "Password must be at least 8 characters, and include uppercase, lowercase, number, and special character",
        });
    }
    try {
      const existingTenant = await dbAdapter.getTenantById(tenantId);
      if (!existingTenant) {
        return res
          .status(STATUS.BAD_REQUEST)
          .json({ message: "Tenant does not exist" });
      }
      const existingTeacher =
        await dbAdapter.getTeacherByTenantIdAndPhoneNumber(
          tenantId,
          phoneNumber,
        );
      if (existingTeacher) {
        return res
          .status(STATUS.CONFLICT)
          .json({ message: "Phone number already in use" });
      }
      const hashedPassword = await bcrypt.hash(
        password,
        parseInt(passwordSaltRounds),
      );
      await dbAdapter.insertTeacher({
        phoneNumber,
        password: hashedPassword,
        tenantId,
      });
      return res
        .status(STATUS.CREATED)
        .json({ message: "Teacher registered successfully" });
    } catch (error) {
      console.error("Registration error:", error);
      return res
        .status(STATUS.INTERNAL_ERROR)
        .json({ message: "Internal server error" });
    }
  },
};
