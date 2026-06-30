"use strict";

const { STATUS } = require("../config/constants");
const tenantService = require("../services/tenant.service");
const logger = require("../logger");

exports.getMe = async (req, res) => {
    const tenantId = req.userId;
    try {
        const tenant = await tenantService.getTenantById(tenantId);
        if (!tenant) {
            return res.status(STATUS.NOT_FOUND).json({ message: "Tenant not found" });
        }
        return res.status(STATUS.OK).json({ email: tenant.email, tenantName: tenant.tenantName });
    } catch (error) {
        logger.error("Get tenant error:", error);
        return res.status(STATUS.INTERNAL_ERROR).json({ message: "Internal server error" });
    }
};

exports.getAnalytics = async (req, res) => {
    const { startDate, endDate } = req.body;
    const tenantId = req.userId;

    if (!startDate || !endDate) {
        return res.status(STATUS.BAD_REQUEST).json({ message: "Both startDate and endDate are required" });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        return res.status(STATUS.BAD_REQUEST).json({ message: "Invalid date format" });
    }

    try {
        const data = await tenantService.getTenantAnalytics(tenantId, start, end);
        return res.status(STATUS.OK).json({ startDate, endDate, count: data.length, data });
    } catch (error) {
        logger.error("Tenant analytics error:", error);
        return res.status(STATUS.INTERNAL_ERROR).json({ message: "Internal server error" });
    }
};
