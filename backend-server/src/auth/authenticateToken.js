const jwt = require("jsonwebtoken");
const admin = require("firebase-admin");
const { secretKey, authType, firebaseServiceAccount } = require("../config/env");
const { STATUS, ROLES } = require("../config/constants");
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

function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  if (!token) return res.sendStatus(STATUS.UNAUTHORIZED);
  let user;
  try {
    user = jwt.verify(token, secretKey);
  } catch (error) {
    return res.sendStatus(STATUS.FORBIDDEN);
  }

  const normalizedRoles = Array.isArray(user.roles)
    ? user.roles
    : user.role
      ? [user.role]
      : user.iss
        ? [user.iss]
        : user.email
          ? [ROLES.TENANT]
          : [];
  const primaryRole = normalizedRoles[0];
  const resolvedUserId = user.id || user.teacherId || user.schoolId;

  if (!resolvedUserId || !primaryRole) {
    return res.sendStatus(STATUS.FORBIDDEN);
  }

  req.user = user;
  req.userId = resolvedUserId;
  req.role = user.role || user.iss || primaryRole;

  if (user.schoolId) req.schoolId = user.schoolId;
  if (user.tenantId) req.tenantId = user.tenantId;
  if (req.role === ROLES.TENANT) req.tenantId = user.tenantId || user.id;
  if (req.role === "school_admin") req.schoolId = user.schoolId || user.id;

  const finalize = () => {
    req.authUser = {
      id: req.userId,
      tenantId: req.tenantId || null,
      schoolId: req.schoolId || null,
      roles: normalizedRoles.length ? normalizedRoles : [req.role],
      primaryRole: req.role,
    };
    req.userRole = req.role;
    return next();
  };

  if (req.schoolId && !req.tenantId && req.role !== ROLES.TENANT) {
    return School.findById(req.schoolId)
      .select("tenantId")
      .lean()
      .then((school) => {
        if (!school) {
          return res.sendStatus(STATUS.UNAUTHORIZED);
        }
        req.tenantId = school.tenantId;
        return finalize();
      })
      .catch(() => res.sendStatus(STATUS.FORBIDDEN));
  }

  return finalize();
}

function authorizeRole(...allowedRoles) {
  return (req, res, next) => {
    const requestRole = req.role || req.userRole || req.authUser?.primaryRole;
    if (!req.user) {
      return res.status(STATUS.UNAUTHORIZED).json({ message: "Authentication required" });
    }

    if (!allowedRoles.includes(requestRole)) {
      return res.status(STATUS.FORBIDDEN).json({ message: "Unauthorized" });
    }

    next();
  };
}

module.exports = authenticateToken;
module.exports.authenticateToken = authenticateToken;
module.exports.authorizeRole = authorizeRole;
