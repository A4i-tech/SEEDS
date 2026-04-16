const { authType, secretKey, jwtExpiresIn, passwordSaltRounds } = require("../../config/env");
const { STATUS, PASSWORD_POLICY, ROLES } = require("../../config/constants");
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

function validateRegisterPayload({ phoneNumber, password, name, role, tenantId }) {
  if (
    !phoneNumber ||
    !password ||
    !tenantId ||
    !role ||
    typeof name !== "string" ||
    name.trim().length === 0
  ) {
    return "Phone number, password, name and role are required";
  }

  if (![ROLES.TEACHER, ROLES.CONTENT_CREATOR].includes(role)) {
    return "Role must be either teacher or content_creator";
  }

  if (!validator.isMobilePhone(phoneNumber)) {
    return "Invalid phone number format";
  }

  if (!validator.isStrongPassword(password, PASSWORD_POLICY)) {
    return "Password must be at least 8 characters, and include uppercase, lowercase, number, and special character";
  }

  return null;
}

module.exports = {
  async login(req, res) {
    const { phoneNumber, password, tenantId } = req.body;
    if (!phoneNumber || !password) {
      return res
        .status(STATUS.BAD_REQUEST)
        .json({ message: "Phone number and password are required" });
    }
    try {
      const teacher = tenantId
        ? await dbAdapter.getTeacherByTenantIdAndPhoneNumber(tenantId, phoneNumber)
        : await dbAdapter.getTeacherByPhoneNumber(phoneNumber);
      if (!teacher) {
        return res
          .status(STATUS.UNAUTHORIZED)
          .json({ message: "Invalid credentials" });
      }
      if (!teacher.role) {
        return res.status(STATUS.UNAUTHORIZED).json({ message: "Invalid role for user" });
      }
      const passwordMatch = await bcrypt.compare(password, teacher.password);
      if (!passwordMatch) {
        return res.status(STATUS.UNAUTHORIZED).json({ message: "Invalid credentials" });
      }
      const teacherRole = teacher.role;
      const token = generateToken({
        id: teacher.id,
        phoneNumber: teacher.phoneNumber,
        name: teacher.name,
        tenantId: teacher.tenantId,
        role: teacherRole,
      });
      return res.status(STATUS.OK).json({
        token,
        phoneNumber,
        tenantId: teacher.tenantId,
        role: teacherRole,
      });
    } catch (error) {
      console.error("Login error:", error);
      return res.status(STATUS.INTERNAL_ERROR).json({ message: "Internal server error" });
    }
  },
  async register(req, res) {
    const { phoneNumber, password, name, role } = req.body;
    const tenantId = req.authUser.tenantId;
    const validationError = validateRegisterPayload({
      phoneNumber,
      password,
      name,
      role,
      tenantId,
    });
    if (validationError) {
      return res.status(STATUS.BAD_REQUEST).json({ message: validationError });
    }

    const trimmedName = name.trim();
    try {
      const existingTenant = await dbAdapter.getTenantById(tenantId);
      if (!existingTenant) {
        return res.status(STATUS.BAD_REQUEST).json({ message: "Tenant does not exist" });
      }
      const existingTeacher = await dbAdapter.getTeacherByTenantIdAndPhoneNumber(
        tenantId,
        phoneNumber
      );
      if (existingTeacher) {
        return res.status(STATUS.CONFLICT).json({ message: "Phone number already in use" });
      }
      const hashedPassword = await bcrypt.hash(password, Number(passwordSaltRounds));
      await dbAdapter.insertTeacher({
        phoneNumber,
        password: hashedPassword,
        tenantId,
        name: trimmedName,
        role,
      });
      return res.status(STATUS.CREATED).json({ message: "User registered successfully" });
    } catch (error) {
      console.error("Registration error:", error);
      return res.status(STATUS.INTERNAL_ERROR).json({ message: "Internal server error" });
    }
  },
};
