const jwt = require("jsonwebtoken");
const { secretKey } = require("../config/env");
const { STATUS } = require("../config/constants");

function authenticateTenant(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  if (!token) return res.sendStatus(STATUS.UNAUTHORIZED);

  jwt.verify(token, secretKey, (err, user) => {
    if (err) return res.sendStatus(STATUS.FORBIDDEN);
    if (user.iss !== "tenant") return res.sendStatus(STATUS.FORBIDDEN);
    req.user = user;
    req.userId = user.id;
    req.tenantId = user.id;
    next();
  });
}

module.exports = authenticateTenant;
