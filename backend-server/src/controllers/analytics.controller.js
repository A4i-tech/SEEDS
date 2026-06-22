"use strict";

const { STATUS } = require("../config/constants");
const analyticsService = require("../services/analytics.service");

function parseRange(req, res) {
    const { startDate, endDate } = req.query;
    if (!startDate || !endDate) {
        res.status(STATUS.BAD_REQUEST).json({ message: "Both startDate and endDate are required" });
        return null;
    }
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        res.status(STATUS.BAD_REQUEST).json({ message: "Invalid date format" });
        return null;
    }
    return { start, end };
}

function buildScope(req) {
    // school_admin requests are always scoped to their own school.
    const schoolId = req.role === "school_admin" ? req.schoolId : req.query.schoolId;
    return {
        tenantId: req.tenantId,
        schoolId: schoolId || undefined,
        teacherId: req.query.teacherId || undefined,
    };
}

function respond(req, res, result, range) {
    return res.status(STATUS.OK).json({
        startDate: range.start.toISOString(),
        endDate: range.end.toISOString(),
        filters: {
            schoolId: req.query.schoolId || (req.role === "school_admin" ? req.schoolId : null),
            teacherId: req.query.teacherId || null,
        },
        ...result,
    });
}

async function handle(req, res, getAnalytics) {
    const range = parseRange(req, res);
    if (!range) return;
    try {
        const result = await getAnalytics(buildScope(req), range);
        return respond(req, res, result, range);
    } catch (error) {
        if (error.code === "TEACHER_NOT_IN_SCOPE") {
            return res.status(STATUS.NOT_FOUND).json({ message: "Teacher not found" });
        }
        console.error("Analytics error:", error);
        return res.status(STATUS.INTERNAL_ERROR).json({ message: "Internal server error" });
    }
}

exports.getIvrAnalytics = (req, res) => handle(req, res, analyticsService.getIvrAnalytics);

exports.getConferenceAnalytics = (req, res) =>
    handle(req, res, analyticsService.getConferenceAnalytics);
