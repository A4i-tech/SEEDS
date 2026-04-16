const jwt = require("jsonwebtoken");
const admin = require("firebase-admin");
const { secretKey, authType, firebaseServiceAccount } = require("../config/env");
const { STATUS, ROLES } = require("../config/constants");

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

  jwt.verify(token, secretKey, (err, user) => {
    if (err && err.name === "TokenExpiredError") {
      return res.status(STATUS.UNAUTHORIZED).json({ message: "Token expired" });
    }
    if (err) return res.sendStatus(STATUS.FORBIDDEN);
    // Backward compatibility: older tenant tokens may only carry email + id.
    const normalizedRoles = Array.isArray(user.roles)
      ? user.roles
      : user.role
        ? [user.role]
        : user.email
          ? [ROLES.TENANT]
          : [];
    const primaryRole = normalizedRoles[0];
    const tenantId = primaryRole === ROLES.TENANT ? user.id : user.tenantId;

    if (!user.id || !primaryRole || !tenantId) {
      return res.sendStatus(STATUS.FORBIDDEN);
    }

    req.user = user;
    req.authUser = {
      id: user.id,
      tenantId,
      roles: normalizedRoles,
      primaryRole,
    };

    // Backward-compatible aliases used by older route handlers.
    req.userId = req.authUser.id;
    req.userRole = req.authUser.primaryRole;
    req.tenantId = req.authUser.tenantId;
    next();
  });
}

module.exports = authenticateToken;
