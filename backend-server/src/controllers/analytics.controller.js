"use strict";

const { STATUS } = require("../config/constants");
const analyticsService = require("../services/analytics.service");
const { toCsv } = require("../utils/csv");

const IVR_CSV_SECTIONS = {
    calls: [
        { key: "phoneNumber", header: "Phone Number" },
        { key: "callerName", header: "Caller Name" },
        { key: "callerType", header: "Caller Type" },
        { key: "schoolName", header: "School" },
        { key: "createdAt", header: "Started At" },
        { key: "stoppedAt", header: "Stopped At" },
        { key: "durationSeconds", header: "Duration (s)" },
        { key: "finalStatus", header: "Final Status" },
    ],
    byTeacher: [
        { key: "teacherName", header: "Teacher" },
        { key: "schoolName", header: "School" },
        { key: "totalCalls", header: "Total Calls" },
        { key: "averageSeconds", header: "Avg Session (s)" },
        { key: "failureRate", header: "Failure Rate" },
    ],
    bySchool: [
        { key: "schoolName", header: "School" },
        { key: "totalCalls", header: "Total Calls" },
        { key: "averageSeconds", header: "Avg Session (s)" },
        { key: "medianSeconds", header: "Median Session (s)" },
        { key: "failureRate", header: "Failure Rate" },
    ],
    contentUsage: [
        { key: "title", header: "Content" },
        { key: "playCount", header: "Play Count" },
        { key: "completedPlays", header: "Completed Plays" },
        { key: "uniqueCallers", header: "Unique Callers" },
    ],
};

const CONFERENCE_CSV_SECTIONS = {
    conferences: [
        { key: "conferenceId", header: "Conference ID" },
        { key: "teacherName", header: "Teacher" },
        { key: "schoolName", header: "School" },
        { key: "startedAt", header: "Started At" },
        { key: "endedAt", header: "Ended At" },
        { key: "durationSeconds", header: "Duration (s)" },
        { key: "studentCount", header: "Students" },
        { key: "raisedHandEvents", header: "Raised Hands" },
    ],
    byTeacher: [
        { key: "teacherName", header: "Teacher" },
        { key: "schoolName", header: "School" },
        { key: "totalConferences", header: "Conferences" },
        { key: "totalDurationSeconds", header: "Total Duration (s)" },
        { key: "averageDurationSeconds", header: "Avg Duration (s)" },
        { key: "averageClassSize", header: "Avg Class Size" },
        { key: "raisedHandEvents", header: "Raised Hands" },
    ],
};

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

function respond(req, res, result, range, csvSections, defaultSection, filePrefix) {
    if (req.query.format === "csv") {
        const section = req.query.section || defaultSection;
        const columns = csvSections[section];
        if (!columns) {
            return res.status(STATUS.BAD_REQUEST).json({
                message: `Invalid section. Valid sections: ${Object.keys(csvSections).join(", ")}`,
            });
        }
        const filename = `${filePrefix}-${section}-${range.start.toISOString().slice(0, 10)}-${range.end.toISOString().slice(0, 10)}.csv`;
        res.setHeader("Content-Type", "text/csv");
        res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
        return res.status(STATUS.OK).send(toCsv(result[section], columns));
    }
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

async function handle(req, res, getAnalytics, csvSections, defaultSection, filePrefix) {
    const range = parseRange(req, res);
    if (!range) return;
    try {
        const result = await getAnalytics(buildScope(req), range);
        return respond(req, res, result, range, csvSections, defaultSection, filePrefix);
    } catch (error) {
        if (error.code === "TEACHER_NOT_IN_SCOPE") {
            return res.status(STATUS.NOT_FOUND).json({ message: "Teacher not found" });
        }
        console.error("Analytics error:", error);
        return res.status(STATUS.INTERNAL_ERROR).json({ message: "Internal server error" });
    }
}

exports.getIvrAnalytics = (req, res) =>
    handle(req, res, analyticsService.getIvrAnalytics, IVR_CSV_SECTIONS, "calls", "ivr-analytics");

exports.getConferenceAnalytics = (req, res) =>
    handle(
        req,
        res,
        analyticsService.getConferenceAnalytics,
        CONFERENCE_CSV_SECTIONS,
        "conferences",
        "conference-analytics"
    );
