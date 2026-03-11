const { secretKey, jwtExpiresIn, passwordSaltRounds } = require("../../config/env");
const { STATUS, PASSWORD_POLICY } = require("../../config/constants");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const validator = require("validator");

const teacherRepo = require("../../repositories/teacher.repository");

function generateToken(payload) {
  return jwt.sign(payload, secretKey, {
    expiresIn: jwtExpiresIn,
    issuer: "teacher",
  });
}

module.exports = {
  async login(req, res) {
    const { phoneNumber, password, schoolId } = req.body;
    if (!phoneNumber || !password || !schoolId) {
      return res
        .status(STATUS.BAD_REQUEST)
        .json({ message: "Phone number, password, and schoolId are required" });
    }
    try {
      const teacher = await teacherRepo.getTeacherBySchoolIdAndPhoneNumber(schoolId, phoneNumber);
      if (!teacher) {
        return res
          .status(STATUS.UNAUTHORIZED)
          .json({ message: "Teacher is not registered with this school" });
      }
      const passwordMatch = await bcrypt.compare(password, teacher.password);
      if (!passwordMatch) {
        return res.status(STATUS.UNAUTHORIZED).json({ message: "Invalid credentials" });
      }
      const token = generateToken({
        id: teacher._id,
        phoneNumber: teacher.phoneNumber,
        name: teacher.name,
      });
      return res.status(STATUS.OK).json({ token, phoneNumber });
    } catch (error) {
      console.error("Login error:", error);
      return res.status(STATUS.INTERNAL_ERROR).json({ message: "Internal server error" });
    }
  },
  async register(req, res) {
    const { phoneNumber, password, name } = req.body;
    const schoolId = req.userId;
    if (
      !phoneNumber ||
      !password ||
      !schoolId ||
      typeof name !== "string" ||
      name.trim().length === 0
    ) {
      return res.status(STATUS.BAD_REQUEST).json({
        message: "Phone number, password, and name are required",
      });
    }
    const trimmedName = name.trim();
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
      const existingTeacher = await teacherRepo.getTeacherBySchoolIdAndPhoneNumber(
        schoolId,
        phoneNumber
      );
      if (existingTeacher) {
        return res.status(STATUS.CONFLICT).json({ message: "Phone number already in use" });
      }
      const hashedPassword = await bcrypt.hash(password, parseInt(passwordSaltRounds));
      await teacherRepo.insertTeacher({
        phoneNumber,
        password: hashedPassword,
        schoolId,
        name: trimmedName,
      });
      return res.status(STATUS.CREATED).json({ message: "Teacher registered successfully" });
    } catch (error) {
      console.error("Registration error:", error);
      return res.status(STATUS.INTERNAL_ERROR).json({ message: "Internal server error" });
    }
  },
};
