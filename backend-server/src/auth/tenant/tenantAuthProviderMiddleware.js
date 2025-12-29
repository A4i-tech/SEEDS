const {
  authType,
  secretKey,
  jwtExpiresIn,
  passwordSaltRounds,
} = require("../../config/env");
const { STATUS, PASSWORD_POLICY } = require("../../config/constants");
const validator = require("validator");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");

const nativeDb = require("../dbAdapters/nativeDb");
const firebaseDb = require("../dbAdapters/firebaseDb");

const dbAdapter = authType === "firebase" ? firebaseDb : nativeDb;

function generateToken(payload) {
  return jwt.sign(payload, secretKey, {
    expiresIn: jwtExpiresIn,
    issuer: "tenant",
  });
}

module.exports = {
  getLoginType: () => authType,
  supportsRegistration: () => true,
  async login(req, res) {
    const { email, password } = req.body;
    if (!email || !password) {
      return res
        .status(STATUS.BAD_REQUEST)
        .json({ message: "Email and password are required" });
    }
    try {
      const tenant = await dbAdapter.getTenantByEmail(email);
      if (!tenant) {
        return res
          .status(STATUS.UNAUTHORIZED)
          .json({ message: "Invalid credentials" });
      }
      const passwordMatch = await bcrypt.compare(password, tenant.password);
      if (!passwordMatch) {
        return res
          .status(STATUS.UNAUTHORIZED)
          .json({ message: "Invalid credentials" });
      }
      const token = generateToken({
        id: tenant._id || tenant.id,
        email: tenant.email,
        name: tenant.tenantName,
      });
      return res
        .status(STATUS.OK)
        .json({
          token,
          id: tenant._id || tenant.id,
          tenantName: tenant.tenantName,
        });
    } catch (error) {
      console.error("Login error:", error);
      return res
        .status(STATUS.INTERNAL_ERROR)
        .json({ message: "Internal server error" });
    }
  },
  async register(req, res) {
    const { email, password, tenantName } = req.body;
    if (!email || !password || !tenantName) {
      return res
        .status(STATUS.BAD_REQUEST)
        .json({ message: "All three fields required" });
    }
    if (!validator.isEmail(email)) {
      return res
        .status(STATUS.BAD_REQUEST)
        .json({ message: "Invalid email format" });
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
      const existingTenant = await dbAdapter.getTenantByEmail(email);
      if (existingTenant) {
        return res
          .status(STATUS.CONFLICT)
          .json({ message: "Email already exists" });
      }
      const hashedPassword = await bcrypt.hash(
        password,
        parseInt(passwordSaltRounds),
      );
      await dbAdapter.insertTenant({
        email,
        password: hashedPassword,
        tenantName,
      });
      return res
        .status(STATUS.CREATED)
        .json({ message: "Tenant registered successfully" });
    } catch (error) {
      console.error("Registration error:", error);
      return res
        .status(STATUS.INTERNAL_ERROR)
        .json({ message: "Internal server error" });
    }
  },
  async getAllTenants(req, res) {
    const tenants = await dbAdapter.getAllTenants();
    return res.status(STATUS.OK).json(tenants);
  },
  async changePassword(req, res) {
    const { tenantId, newPassword } = req.body;
    if (!tenantId || !newPassword) {
      return res
        .status(STATUS.BAD_REQUEST)
        .json({ message: "Tenant ID and new password are required" });
    }
    if (!validator.isStrongPassword(newPassword, PASSWORD_POLICY)) {
      return res
        .status(STATUS.BAD_REQUEST)
        .json({
          message:
            "Password must be at least 8 characters, and include uppercase, lowercase, number, and special character",
        });
    }
    try {
      const tenant = await dbAdapter.getTenantById(tenantId);
      if (!tenant) {
        return res
          .status(STATUS.NOT_FOUND)
          .json({ message: "Tenant not found" });
      }
      const isSamePassword = await bcrypt.compare(newPassword, tenant.password);
      if (isSamePassword) {
        return res
          .status(STATUS.BAD_REQUEST)
          .json({ message: "Password cannot be old password" });
      }

      const hashedPassword = await bcrypt.hash(
        newPassword,
        parseInt(passwordSaltRounds),
      );
      await dbAdapter.updateTenantPassword(tenantId, hashedPassword);
      return res
        .status(STATUS.OK)
        .json({ message: "Password changed successfully" });
    } catch (error) {
      console.error("Change password error:", error);
      return res
        .status(STATUS.INTERNAL_ERROR)
        .json({ message: "Internal server error" });
    }
  },
  async getTenantById(tenantId) {
    return dbAdapter.getTenantById(tenantId);
  },
};
