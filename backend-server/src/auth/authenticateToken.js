const jwt = require("jsonwebtoken");
const admin = require("firebase-admin");
const { secretKey, authType, firebaseServiceAccount } = require("../config/env");
const { STATUS } = require("../config/constants");
const School = require("../models/School");

// Ensure secretKey is defined for native auth
if (
  authType === "native" &&
  (!secretKey || typeof secretKey !== "string" || secretKey.trim() === "")
) {
  throw new Error("SECRET_KEY environment variable must be defined and non-empty");
}

// Ensure Firebase is initialized for Firebase auth
if (authType === "firebase" && !admin.apps.length) {
  let serviceAccount = JSON.parse(firebaseServiceAccount);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const TENANT_ROLE = "tenant";
const SCHOOL_ADMIN_ROLE = "school_admin";

/**
 * Authenticate the token and set the user information in the request object
 * @param {Object} req - The request object
 * @param {Object} res - The response object
 * @param {Function} next - The next function
 */
async function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  if (!token) return res.sendStatus(STATUS.UNAUTHORIZED);
  try {
    const user = jwt.verify(token, secretKey);

    req.user = user;
    req.userId = user.id;
    req.role = user.role || user.iss;

    if (user.schoolId) req.schoolId = user.schoolId;
    if (user.tenantId) req.tenantId = user.tenantId;
    if (user.iss === TENANT_ROLE) req.tenantId = user.id;
    if (user.iss === SCHOOL_ADMIN_ROLE && !req.schoolId) req.schoolId = user.id;

    // Teacher tokens carry only schoolId — resolve tenantId from the school
    if (user.schoolId && !user.tenantId && user.iss !== TENANT_ROLE) {
      const school = await School.findById(user.schoolId).select("tenantId").lean();
      if (!school) return res.sendStatus(STATUS.UNAUTHORIZED);
      req.tenantId = school.tenantId;
    }

    next();
  } catch (err) {
    return res.sendStatus(STATUS.FORBIDDEN);
  }
}

/**
 * Authorize the user based on the allowed roles
 * @param {...string} allowedRoles - The allowed roles
 * @returns {Function} - The middleware function
 */
function authorizeRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(STATUS.UNAUTHORIZED).json({ message: "Authentication required" });
    }

    if (!allowedRoles.includes(req.role)) {
      return res.status(STATUS.FORBIDDEN).json({ message: "Unauthorized" });
    }
    next();
  };
}

module.exports = {
  authenticateToken,
  authorizeRole,
};
