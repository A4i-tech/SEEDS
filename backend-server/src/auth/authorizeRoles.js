"use strict";

const { STATUS } = require("../config/constants");

function authorizeRoles(...allowedRoles) {
  return (req, res, next) => {
    const roles = req.authUser.roles;
    const isAuthorized = roles.some((role) => allowedRoles.includes(role));
    if (!isAuthorized) {
      return res.status(STATUS.FORBIDDEN).json({ message: "Forbidden" });
    }
    return next();
  };
}

module.exports = authorizeRoles;
