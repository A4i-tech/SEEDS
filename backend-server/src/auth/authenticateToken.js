const jwt = require("jsonwebtoken");
const admin = require("firebase-admin");
const { secretKey, authType, firebaseServiceAccount } = require("../config/env");
const { STATUS } = require("../config/constants");

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
    if (err) return res.sendStatus(STATUS.FORBIDDEN);
    req.user = user;
    req.userId = user.id;
    req.userRole = user.role || "tenant";
    req.tenantId = user.tenantId || user.id;
    next();
  });
}

module.exports = authenticateToken;
