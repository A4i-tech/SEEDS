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
    issuer: "content-creator",
  });
}

async function registerWithTenantId(tenantId, { email, password, name }, res) {
  if (!email || !password || !tenantId || !name) {
    return res.status(STATUS.BAD_REQUEST).json({
      message: "Email, password, tenantId, and name are required",
    });
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
    const tenant = await dbAdapter.getTenantById(tenantId);
    if (!tenant) {
      return res.status(STATUS.NOT_FOUND).json({
        message: "Tenant not found",
      });
    }

    const existingCreator = await dbAdapter.getContentCreatorByEmail(email);
    if (existingCreator) {
      return res.status(STATUS.CONFLICT).json({
        message: "Email already exists",
      });
    }

    const hashedPassword = await bcrypt.hash(password, parseInt(passwordSaltRounds, 10));
    const created = await dbAdapter.insertContentCreator({
      email,
      password: hashedPassword,
      tenantId,
      name,
    });

    return res.status(STATUS.CREATED).json({
      message: "Content creator registered successfully",
      id: created._id || created.id,
    });
  } catch (error) {
    console.error("Content creator registration error:", error);
    return res
      .status(STATUS.INTERNAL_ERROR)
      .json({ message: "Internal server error" });
  }
}

module.exports = {
  async register(req, res) {
    const { email, password, tenantId, name } = req.body;
    return registerWithTenantId(tenantId, { email, password, name }, res);
  },

  async registerForTenant(req, res) {
    const { email, password, name } = req.body;
    return registerWithTenantId(req.tenantId, { email, password, name }, res);
  },

  async login(req, res) {
    const { email, password } = req.body;

    if (!email || !password) {
      return res
        .status(STATUS.BAD_REQUEST)
        .json({ message: "Email and password are required" });
    }

    try {
      const creator = await dbAdapter.getContentCreatorByEmail(email);
      if (!creator) {
        return res
          .status(STATUS.UNAUTHORIZED)
          .json({ message: "Invalid credentials" });
      }

      const passwordMatch = await bcrypt.compare(password, creator.password);
      if (!passwordMatch) {
        return res
          .status(STATUS.UNAUTHORIZED)
          .json({ message: "Invalid credentials" });
      }

      const tenant = await dbAdapter.getTenantById(creator.tenantId);
      if (!tenant) {
        return res.status(STATUS.UNAUTHORIZED).json({
          message: "Tenant for this content creator no longer exists",
        });
      }

      const token = generateToken({
        id: creator._id || creator.id,
        email: creator.email,
        name: creator.name,
        tenantId: creator.tenantId,
        role: "content_creator",
      });

      return res.status(STATUS.OK).json({
        token,
        id: creator._id || creator.id,
        name: creator.name,
        email: creator.email,
        tenantId: creator.tenantId,
        tenantName: tenant.tenantName,
        role: "content_creator",
      });
    } catch (error) {
      console.error("Content creator login error:", error);
      return res
        .status(STATUS.INTERNAL_ERROR)
        .json({ message: "Internal server error" });
    }
  },

  async getContentCreatorById(id) {
    return dbAdapter.getContentCreatorById(id);
  },

  async getContentCreatorsByTenantId(tenantId) {
    return dbAdapter.getContentCreatorsByTenantId(tenantId);
  },
};
