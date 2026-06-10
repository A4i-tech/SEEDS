"use strict";

const schoolRepository = require("../repositories/school.repository");
const teacherRepository = require("../repositories/teacher.repository");
const studentRepository = require("../repositories/student.repository");
const ivrV2LogRepository = require("../repositories/ivrV2Log.repository");
const conferenceStateRepository = require("../repositories/conferenceState.repository");
const { ContentV3 } = require("../models/ContentV3");

const SUCCESS_STATUSES = ["completed"];
const FAILURE_STATUSES = ["failed", "busy", "unanswered", "rejected", "cancelled", "timeout"];

const CLASS_SIZE_BUCKETS = [
    { label: "1-5", min: 1, max: 5 },
    { label: "6-10", min: 6, max: 10 },
    { label: "11-20", min: 11, max: 20 },
    { label: "21-50", min: 21, max: 50 },
    { label: "50+", min: 51, max: Infinity },
];

const ACTION_CONFERENCE_START = "Conference-Start";
const ACTION_CONFERENCE_END = "Conference-End";
const ACTION_RAISE_HAND = "Student-RaiseHandStateChange";

/** Last 10 digits of a phone number, ignoring formatting and country code. */
function normalizePhone(phone) {
    const digits = String(phone || "").replace(/\D/g, "");
    return digits.slice(-10);
}

/** All plausible stored representations of a phone number, for $in queries. */
function phoneCandidates(phone) {
    const raw = String(phone || "").trim();
    const digits = raw.replace(/\D/g, "");
    const last10 = digits.slice(-10);
    if (!last10) return [];
    return [...new Set([raw, digits, last10, `91${last10}`, `+91${last10}`])];
}

function median(values) {
    if (!values.length) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function average(values) {
    if (!values.length) return null;
    return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/** Parse date strings written by the Python services (ISO, with or without "T"). */
function parseDate(value) {
    if (!value) return null;
    const date = new Date(String(value).replace(" ", "T"));
    return isNaN(date.getTime()) ? null : date;
}

/** Final status from call_status_updates ({isoTimestamp: status}); ISO keys sort chronologically. */
function finalCallStatus(callStatusUpdates) {
    const keys = Object.keys(callStatusUpdates || {});
    if (!keys.length) return null;
    keys.sort();
    return callStatusUpdates[keys[keys.length - 1]];
}

/** Classify a call as completed | failed | dropped from its final status. */
function classifyCall(finalStatus) {
    if (SUCCESS_STATUSES.includes(finalStatus)) return "completed";
    if (FAILURE_STATUSES.includes(finalStatus)) return "failed";
    return "dropped";
}

/** Session length in seconds: Vonage-reported duration, else stopped_at - created_at. */
function sessionSeconds(log) {
    const reported = parseInt(log.duration, 10);
    if (Number.isFinite(reported) && reported > 0) return reported;
    const start = parseDate(log.created_at);
    const end = parseDate(log.stopped_at);
    if (start && end && end > start) return (end - start) / 1000;
    return null;
}

function bucketClassSize(size) {
    const bucket = CLASS_SIZE_BUCKETS.find((b) => size >= b.min && size <= b.max);
    return bucket ? bucket.label : null;
}

/** Extract per-conference metrics from a conferenceState document. */
function extractConferenceMetrics(doc) {
    const history = Array.isArray(doc.action_history) ? doc.action_history : [];
    const startAction = history.find((a) => a.action_type === ACTION_CONFERENCE_START);
    const endActions = history.filter((a) => a.action_type === ACTION_CONFERENCE_END);
    const endAction = endActions.length ? endActions[endActions.length - 1] : null;

    const startedAt = startAction ? parseDate(startAction.timestamp) : null;
    const endedAt = endAction ? parseDate(endAction.timestamp) : null;
    const durationSeconds =
        startedAt && endedAt && endedAt > startedAt ? (endedAt - startedAt) / 1000 : null;

    const participants = Object.values(doc.participants || {});
    const studentCount = participants.filter((p) => p && p.role === "Student").length;
    const raisedHandEvents = history.filter(
        (a) => a.action_type === ACTION_RAISE_HAND && a.metadata && a.metadata.raised_hand === true
    ).length;

    return {
        conferenceId: doc._id,
        startedAt: startedAt ? startedAt.toISOString() : null,
        endedAt: endedAt ? endedAt.toISOString() : null,
        durationSeconds,
        studentCount,
        raisedHandEvents,
        isRunning: doc.is_running === true,
        neverStarted: !startAction,
    };
}

/**
 * Build a phone → person map for all teachers and students in scope.
 * Teachers win collisions. Returns { map, schools, teachers }.
 */
async function buildAttributionMap(tenantId, schoolId) {
    let schools = await schoolRepository.getSchools(tenantId);
    if (schoolId) {
        schools = schools.filter((s) => String(s._id) === String(schoolId));
    }

    const map = new Map();
    const teachers = [];
    await Promise.all(
        schools.map(async (school) => {
            const [schoolTeachers, schoolStudents] = await Promise.all([
                teacherRepository.getTeachersBySchoolId(school._id),
                studentRepository.getStudentsBySchoolId(school._id),
            ]);
            for (const student of schoolStudents) {
                const key = normalizePhone(student.phoneNumber);
                if (key) {
                    map.set(key, {
                        kind: "student",
                        id: String(student._id),
                        name: student.name,
                        schoolId: String(school._id),
                        schoolName: school.name,
                    });
                }
            }
            for (const teacher of schoolTeachers) {
                teachers.push({ ...((teacher.toObject && teacher.toObject()) || teacher), schoolId: school._id });
                const key = normalizePhone(teacher.phoneNumber);
                if (key) {
                    map.set(key, {
                        kind: "teacher",
                        id: String(teacher._id),
                        name: teacher.name,
                        schoolId: String(school._id),
                        schoolName: school.name,
                    });
                }
            }
        })
    );
    return { map, schools, teachers };
}

/** Map stream URLs to contents (exact match, then prefix match). */
async function buildContentUrlIndex(tenantId) {
    const contents = await ContentV3.find({ tenantId, isDeleted: false })
        .select("title theme audioContent")
        .lean();
    const index = [];
    for (const content of contents) {
        const title = (content.title && content.title.english) || "";
        const urls = [
            content.title && content.title.audioUrl,
            content.theme && content.theme.audioUrl,
            ...(content.audioContent || []).map((a) => a.audioUrl),
        ].filter(Boolean);
        for (const url of urls) {
            index.push({ url, contentId: String(content._id), title });
        }
    }
    return index;
}

function matchContent(streamUrl, contentIndex) {
    const exact = contentIndex.find((entry) => entry.url === streamUrl);
    if (exact) return exact;
    return contentIndex.find((entry) => streamUrl.startsWith(entry.url)) || null;
}

function roundOrNull(value, decimals = 1) {
    if (value === null || value === undefined) return null;
    const factor = 10 ** decimals;
    return Math.round(value * factor) / factor;
}

/**
 * IVR analytics for a tenant, optionally scoped to a school and/or teacher.
 * @param {{tenantId: string, schoolId?: string, teacherId?: string}} scope
 * @param {{start: Date, end: Date}} range
 */
exports.getIvrAnalytics = async (scope, range) => {
    const { tenantId, schoolId, teacherId } = scope;
    const { map, schools } = await buildAttributionMap(tenantId, schoolId);

    let phoneNumbers = null;
    if (teacherId) {
        const teacher = await teacherRepository.getTeacherById(teacherId);
        const inScope =
            teacher && schools.some((s) => String(s._id) === String(teacher.schoolId));
        if (!inScope) {
            const error = new Error("Teacher not found in scope");
            error.code = "TEACHER_NOT_IN_SCOPE";
            throw error;
        }
        phoneNumbers = phoneCandidates(teacher.phoneNumber);
    }

    let logs = await ivrV2LogRepository.findForAnalytics({
        tenantId,
        startStr: range.start.toISOString(),
        endStr: range.end.toISOString(),
        phoneNumbers,
    });

    const attributed = logs.map((log) => ({
        log,
        person: map.get(normalizePhone(log.phone_number)) || null,
    }));
    const rows = schoolId
        ? attributed.filter((r) => r.person && r.person.schoolId === String(schoolId))
        : attributed;

    const durations = [];
    const statusBreakdown = {};
    let completedCalls = 0;
    let failedCalls = 0;
    let droppedCalls = 0;
    let unattributedCalls = 0;
    const bySchool = new Map();
    const byTeacher = new Map();
    const byContent = new Map();
    const calls = [];

    for (const { log, person } of rows) {
        const finalStatus = finalCallStatus(log.call_status_updates) || "unknown";
        const classification = classifyCall(finalStatus);
        statusBreakdown[finalStatus] = (statusBreakdown[finalStatus] || 0) + 1;
        if (classification === "completed") completedCalls += 1;
        else if (classification === "failed") failedCalls += 1;
        else droppedCalls += 1;
        if (!person) unattributedCalls += 1;

        const seconds = sessionSeconds(log);
        if (seconds !== null) durations.push(seconds);

        if (person) {
            const schoolEntry = bySchool.get(person.schoolId) || {
                schoolId: person.schoolId,
                schoolName: person.schoolName,
                totalCalls: 0,
                durations: [],
                failedOrDropped: 0,
            };
            schoolEntry.totalCalls += 1;
            if (seconds !== null) schoolEntry.durations.push(seconds);
            if (classification !== "completed") schoolEntry.failedOrDropped += 1;
            bySchool.set(person.schoolId, schoolEntry);

            if (person.kind === "teacher") {
                const teacherEntry = byTeacher.get(person.id) || {
                    teacherId: person.id,
                    teacherName: person.name,
                    schoolId: person.schoolId,
                    schoolName: person.schoolName,
                    totalCalls: 0,
                    durations: [],
                    failedOrDropped: 0,
                };
                teacherEntry.totalCalls += 1;
                if (seconds !== null) teacherEntry.durations.push(seconds);
                if (classification !== "completed") teacherEntry.failedOrDropped += 1;
                byTeacher.set(person.id, teacherEntry);
            }
        }

        for (const playback of log.stream_playback || []) {
            if (!playback.stream_url) continue;
            const usage = byContent.get(playback.stream_url) || {
                streamUrl: playback.stream_url,
                playCount: 0,
                completedPlays: 0,
                callers: new Set(),
            };
            usage.playCount += 1;
            if (playback.done_at) usage.completedPlays += 1;
            usage.callers.add(log.phone_number);
            byContent.set(playback.stream_url, usage);
        }

        calls.push({
            phoneNumber: log.phone_number,
            callerName: person ? person.name : null,
            callerType: person ? person.kind : null,
            schoolName: person ? person.schoolName : null,
            createdAt: log.created_at,
            stoppedAt: log.stopped_at,
            durationSeconds: seconds,
            finalStatus,
        });
    }

    const contentIndex = await buildContentUrlIndex(tenantId);
    const contentUsage = [...byContent.values()]
        .map((usage) => {
            const content = matchContent(usage.streamUrl, contentIndex);
            return {
                contentId: content ? content.contentId : null,
                title: content ? content.title : usage.streamUrl.split("/").pop(),
                streamUrl: usage.streamUrl,
                playCount: usage.playCount,
                completedPlays: usage.completedPlays,
                uniqueCallers: usage.callers.size,
            };
        })
        .sort((a, b) => b.playCount - a.playCount);

    const totalCalls = rows.length;
    return {
        totals: {
            totalCalls,
            completedCalls,
            failedCalls,
            droppedCalls,
            dropFailureRate: totalCalls
                ? roundOrNull((failedCalls + droppedCalls) / totalCalls, 4)
                : null,
            unattributedCalls,
        },
        sessionLength: {
            averageSeconds: roundOrNull(average(durations)),
            medianSeconds: roundOrNull(median(durations)),
            totalSeconds: roundOrNull(durations.reduce((sum, v) => sum + v, 0)),
        },
        statusBreakdown,
        bySchool: [...bySchool.values()].map((entry) => ({
            schoolId: entry.schoolId,
            schoolName: entry.schoolName,
            totalCalls: entry.totalCalls,
            averageSeconds: roundOrNull(average(entry.durations)),
            medianSeconds: roundOrNull(median(entry.durations)),
            failureRate: roundOrNull(entry.failedOrDropped / entry.totalCalls, 4),
        })),
        byTeacher: [...byTeacher.values()].map((entry) => ({
            teacherId: entry.teacherId,
            teacherName: entry.teacherName,
            schoolId: entry.schoolId,
            schoolName: entry.schoolName,
            totalCalls: entry.totalCalls,
            averageSeconds: roundOrNull(average(entry.durations)),
            failureRate: roundOrNull(entry.failedOrDropped / entry.totalCalls, 4),
        })),
        contentUsage,
        calls,
    };
};

/**
 * Conference analytics for a tenant, optionally scoped to a school and/or teacher.
 * @param {{tenantId: string, schoolId?: string, teacherId?: string}} scope
 * @param {{start: Date, end: Date}} range
 */
exports.getConferenceAnalytics = async (scope, range) => {
    const { tenantId, schoolId, teacherId } = scope;
    const { map, schools, teachers } = await buildAttributionMap(tenantId, schoolId);

    let scopedTeachers = teachers;
    if (teacherId) {
        scopedTeachers = teachers.filter((t) => String(t._id) === String(teacherId));
        if (!scopedTeachers.length) {
            const error = new Error("Teacher not found in scope");
            error.code = "TEACHER_NOT_IN_SCOPE";
            throw error;
        }
    }

    const candidates = [...new Set(scopedTeachers.flatMap((t) => phoneCandidates(t.phoneNumber)))];
    const docs = candidates.length
        ? await conferenceStateRepository.findByTeacherPhonesInDateRange(
              candidates,
              range.start.toISOString(),
              range.end.toISOString()
          )
        : [];

    const durations = [];
    const classSizes = [];
    let completedConferences = 0;
    let liveConferences = 0;
    let neverStarted = 0;
    let totalRaisedHands = 0;
    const byTeacher = new Map();
    const conferences = [];

    for (const doc of docs) {
        const metrics = extractConferenceMetrics(doc);
        const person = map.get(normalizePhone(doc.teacher_phone_number)) || null;

        if (metrics.isRunning) liveConferences += 1;
        else if (metrics.neverStarted) neverStarted += 1;
        else completedConferences += 1;

        if (metrics.durationSeconds !== null) durations.push(metrics.durationSeconds);
        if (metrics.studentCount > 0) classSizes.push(metrics.studentCount);
        totalRaisedHands += metrics.raisedHandEvents;

        const teacherKey = person ? person.id : normalizePhone(doc.teacher_phone_number);
        const teacherEntry = byTeacher.get(teacherKey) || {
            teacherId: person ? person.id : null,
            teacherName: person ? person.name : doc.teacher_phone_number,
            schoolId: person ? person.schoolId : null,
            schoolName: person ? person.schoolName : null,
            totalConferences: 0,
            durations: [],
            classSizes: [],
            raisedHandEvents: 0,
        };
        teacherEntry.totalConferences += 1;
        if (metrics.durationSeconds !== null) teacherEntry.durations.push(metrics.durationSeconds);
        if (metrics.studentCount > 0) teacherEntry.classSizes.push(metrics.studentCount);
        teacherEntry.raisedHandEvents += metrics.raisedHandEvents;
        byTeacher.set(teacherKey, teacherEntry);

        conferences.push({
            conferenceId: metrics.conferenceId,
            teacherName: person ? person.name : doc.teacher_phone_number,
            schoolName: person ? person.schoolName : null,
            startedAt: metrics.startedAt,
            endedAt: metrics.endedAt,
            durationSeconds: metrics.durationSeconds,
            studentCount: metrics.studentCount,
            raisedHandEvents: metrics.raisedHandEvents,
            isRunning: metrics.isRunning,
        });
    }

    const distribution = CLASS_SIZE_BUCKETS.map((bucket) => ({
        bucket: bucket.label,
        count: classSizes.filter((size) => size >= bucket.min && size <= bucket.max).length,
    }));

    const totalConferences = docs.length;
    return {
        totals: { totalConferences, completedConferences, liveConferences, neverStarted },
        duration: {
            averageSeconds: roundOrNull(average(durations)),
            medianSeconds: roundOrNull(median(durations)),
            totalSeconds: roundOrNull(durations.reduce((sum, v) => sum + v, 0)),
        },
        classSize: {
            average: roundOrNull(average(classSizes)),
            median: roundOrNull(median(classSizes)),
            distribution,
        },
        raisedHands: {
            totalEvents: totalRaisedHands,
            averagePerConference: totalConferences
                ? roundOrNull(totalRaisedHands / totalConferences)
                : null,
        },
        byTeacher: [...byTeacher.values()].map((entry) => ({
            teacherId: entry.teacherId,
            teacherName: entry.teacherName,
            schoolId: entry.schoolId,
            schoolName: entry.schoolName,
            totalConferences: entry.totalConferences,
            totalDurationSeconds: roundOrNull(entry.durations.reduce((sum, v) => sum + v, 0)),
            averageDurationSeconds: roundOrNull(average(entry.durations)),
            averageClassSize: roundOrNull(average(entry.classSizes)),
            raisedHandEvents: entry.raisedHandEvents,
        })),
        conferences,
    };
};

// Exported for unit tests.
exports.normalizePhone = normalizePhone;
exports.phoneCandidates = phoneCandidates;
exports.median = median;
exports.parseDate = parseDate;
exports.finalCallStatus = finalCallStatus;
exports.classifyCall = classifyCall;
exports.sessionSeconds = sessionSeconds;
exports.bucketClassSize = bucketClassSize;
exports.extractConferenceMetrics = extractConferenceMetrics;
