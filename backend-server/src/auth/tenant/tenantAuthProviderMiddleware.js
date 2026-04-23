const {
  authType,
  secretKey,
  jwtExpiresIn,
  passwordSaltRounds,
} = require("../../config/env");
const { STATUS, PASSWORD_POLICY, ROLES } = require("../../config/constants");
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
        role: tenant.role,
      });
      return res.status(STATUS.OK).json({
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
      return res.status(STATUS.BAD_REQUEST).json({
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
        role: ROLES.TENANT,
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
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword) {
      return res
        .status(STATUS.BAD_REQUEST)
        .json({
          message: "Current password is required for security verification",
        });
    }

    if (!newPassword) {
      return res
        .status(STATUS.BAD_REQUEST)
        .json({ message: "New password is required" });
    }

    const tenantId = req.tenantId;

    if (!validator.isStrongPassword(newPassword, PASSWORD_POLICY)) {
      return res.status(STATUS.BAD_REQUEST).json({
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

      // Verify current password
      const isCurrentPasswordCorrect = await bcrypt.compare(
        currentPassword,
        tenant.password,
      );
      if (!isCurrentPasswordCorrect) {
        return res
          .status(STATUS.UNAUTHORIZED)
          .json({ message: "Current password is incorrect" });
      }

      // Check if new password is same as current password
      const isSamePassword = await bcrypt.compare(newPassword, tenant.password);
      if (isSamePassword) {
        return res
          .status(STATUS.BAD_REQUEST)
          .json({
            message: "New password must be different from current password",
          });
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
