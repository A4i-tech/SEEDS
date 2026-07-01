const request = require("supertest");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const { setup, teardown, clearDatabase } = require("./integrationSetup");

const app = require("../../src/index");

const SECRET_KEY = process.env.SECRET_KEY;

const tenantId = new mongoose.Types.ObjectId();
const otherTenantId = new mongoose.Types.ObjectId();
const schoolAId = new mongoose.Types.ObjectId();
const schoolBId = new mongoose.Types.ObjectId();
const teacherAId = new mongoose.Types.ObjectId();
const teacherBId = new mongoose.Types.ObjectId();
const studentId = new mongoose.Types.ObjectId();

const STREAM_URL = "https://blob.example.com/audio/math-lesson.mp3";

function tenantToken() {
    return jwt.sign({ id: tenantId.toString(), role: "tenant", iss: "tenant" }, SECRET_KEY, {
        expiresIn: "1h",
    });
}

function schoolAdminToken(schoolId = schoolAId) {
    return jwt.sign(
        {
            id: schoolId.toString(),
            schoolId: schoolId.toString(),
            tenantId: tenantId.toString(),
            role: "school_admin",
            iss: "school_admin",
        },
        SECRET_KEY,
        { expiresIn: "1h" }
    );
}

async function seed() {
    const db = mongoose.connection;
    await db.collection("schools").insertMany([
        { _id: schoolAId, tenantId, name: "School A", email: "a@example.com", isActive: true },
        { _id: schoolBId, tenantId, name: "School B", email: "b@example.com", isActive: true },
    ]);
    await db.collection("teachers").insertMany([
        {
            _id: teacherAId,
            schoolId: schoolAId,
            name: "Teacher A",
            phoneNumber: "9876543210",
            password: "irrelevant",
            role: "teacher",
        },
        {
            _id: teacherBId,
            schoolId: schoolBId,
            name: "Teacher B",
            phoneNumber: "9123456789",
            password: "irrelevant",
            role: "teacher",
        },
    ]);
    await db.collection("students").insertOne({
        _id: studentId,
        schoolId: schoolAId,
        name: "Student S",
        phoneNumber: "9000000000",
    });
    await db.collection("contentsV3").insertOne({
        _id: "content-1",
        tenantId,
        type: "audio",
        language: "en",
        title: { english: "Math Lesson", local: "", audioUrl: "" },
        theme: { english: "Math", local: "", audioUrl: "" },
        audioContent: [{ description: "", audioUrl: STREAM_URL, durationSeconds: 60 }],
        isDeleted: false,
    });

    // Shapes below mirror what IVRv2 (pydantic JSON round-trip) writes.
    await db.collection("ivrv2logs").insertMany([
        {
            // Teacher A, completed, with content playback
            phone_number: "919876543210",
            fsm_id: "fsm-1",
            current_state_id: "state-9",
            created_at: "2026-06-01T10:00:00.000000",
            stopped_at: "2026-06-01T10:05:00.000000",
            duration: "300",
            user_actions: [],
            stream_playback: [
                {
                    play_id: "p1",
                    stream_url: STREAM_URL,
                    started_at: "2026-06-01T10:00:10",
                    stopped_at: "2026-06-01T10:01:10",
                    done_at: "2026-06-01T10:01:10",
                },
                {
                    play_id: "p2",
                    stream_url: STREAM_URL,
                    started_at: "2026-06-01T10:02:00",
                    stopped_at: null,
                    done_at: null,
                },
            ],
            experience_data: {},
            call_status_updates: {
                "2026-06-01T10:00:00": "started",
                "2026-06-01T10:00:05": "answered",
                "2026-06-01T10:05:00": "completed",
            },
            tenant_id: tenantId.toString(),
            school_id: null,
        },
        {
            // Student (School A), unanswered → failed, no usable duration
            phone_number: "919000000000",
            fsm_id: "fsm-1",
            current_state_id: "state-1",
            created_at: "2026-06-02T11:00:00.000000",
            stopped_at: null,
            duration: "",
            user_actions: [],
            stream_playback: [],
            experience_data: {},
            call_status_updates: { "2026-06-02T11:00:30": "unanswered" },
            tenant_id: tenantId.toString(),
            school_id: null,
        },
        {
            // Teacher B (School B), completed
            phone_number: "919123456789",
            fsm_id: "fsm-1",
            current_state_id: "state-9",
            created_at: "2026-06-03T09:00:00.000000",
            stopped_at: "2026-06-03T09:01:40.000000",
            duration: "100",
            user_actions: [],
            stream_playback: [],
            experience_data: {},
            call_status_updates: { "2026-06-03T09:01:40": "completed" },
            tenant_id: tenantId.toString(),
            school_id: null,
        },
        {
            // Unattributed caller, disconnected → dropped
            phone_number: "917777777777",
            fsm_id: "fsm-1",
            current_state_id: "state-2",
            created_at: "2026-06-04T08:00:00.000000",
            stopped_at: "2026-06-04T08:00:50.000000",
            duration: "50",
            user_actions: [],
            stream_playback: [],
            experience_data: {},
            call_status_updates: { "2026-06-04T08:00:50": "disconnected" },
            tenant_id: tenantId.toString(),
            school_id: null,
        },
        {
            // Other tenant — must never appear
            phone_number: "919876543210",
            fsm_id: "fsm-1",
            current_state_id: "state-9",
            created_at: "2026-06-01T10:00:00.000000",
            stopped_at: null,
            duration: "999",
            user_actions: [],
            stream_playback: [],
            experience_data: {},
            call_status_updates: { "2026-06-01T10:00:00": "completed" },
            tenant_id: otherTenantId.toString(),
            school_id: null,
        },
    ]);
}

const RANGE = "startDate=2026-06-01T00:00:00Z&endDate=2026-06-30T23:59:59Z";

describe("IVR Analytics - Integration Tests", () => {
    beforeAll(setup);
    afterAll(teardown);
    beforeEach(async () => {
        await clearDatabase();
        await seed();
    });

    test("returns 401 without token", async () => {
        const res = await request(app).get(`/tenant/analytics/ivr?${RANGE}`);
        expect(res.status).toBe(401);
    });

    test("returns 403 for school_admin on tenant route", async () => {
        const res = await request(app)
            .get(`/tenant/analytics/ivr?${RANGE}`)
            .set("Authorization", `Bearer ${schoolAdminToken()}`);
        expect(res.status).toBe(403);
    });

    test("returns 400 on missing or invalid dates", async () => {
        const noDates = await request(app)
            .get("/tenant/analytics/ivr")
            .set("Authorization", `Bearer ${tenantToken()}`);
        expect(noDates.status).toBe(400);

        const badDates = await request(app)
            .get("/tenant/analytics/ivr?startDate=nope&endDate=alsonope")
            .set("Authorization", `Bearer ${tenantToken()}`);
        expect(badDates.status).toBe(400);
    });

    test("tenant gets full IVR metrics", async () => {
        const res = await request(app)
            .get(`/tenant/analytics/ivr?${RANGE}`)
            .set("Authorization", `Bearer ${tenantToken()}`);

        expect(res.status).toBe(200);
        expect(res.body.totals).toEqual({
            totalCalls: 4,
            completedCalls: 2,
            failedCalls: 1,
            droppedCalls: 1,
            dropFailureRate: 0.5,
            unattributedCalls: 1,
        });
        expect(res.body.sessionLength).toEqual({
            averageSeconds: 150,
            medianSeconds: 100,
            totalSeconds: 450,
        });
        expect(res.body.statusBreakdown).toEqual({
            completed: 2,
            unanswered: 1,
            disconnected: 1,
        });

        const schoolA = res.body.bySchool.find((s) => s.schoolName === "School A");
        const schoolB = res.body.bySchool.find((s) => s.schoolName === "School B");
        expect(schoolA.totalCalls).toBe(2);
        expect(schoolB.totalCalls).toBe(1);

        expect(res.body.byTeacher).toHaveLength(2);
        const teacherA = res.body.byTeacher.find((t) => t.teacherName === "Teacher A");
        expect(teacherA.totalCalls).toBe(1);
        expect(teacherA.averageSeconds).toBe(300);

        expect(res.body.contentUsage).toEqual([
            {
                contentId: "content-1",
                title: "Math Lesson",
                streamUrl: STREAM_URL,
                playCount: 2,
                completedPlays: 1,
                uniqueCallers: 1,
            },
        ]);
        expect(res.body.calls).toHaveLength(4);
    });

    test("tenant schoolId filter restricts to that school's calls", async () => {
        const res = await request(app)
            .get(`/tenant/analytics/ivr?${RANGE}&schoolId=${schoolAId}`)
            .set("Authorization", `Bearer ${tenantToken()}`);

        expect(res.status).toBe(200);
        expect(res.body.totals.totalCalls).toBe(2);
        expect(res.body.totals.unattributedCalls).toBe(0);
        expect(res.body.bySchool).toHaveLength(1);
        expect(res.body.bySchool[0].schoolName).toBe("School A");
    });

    test("tenant teacherId filter restricts to that teacher's calls", async () => {
        const res = await request(app)
            .get(`/tenant/analytics/ivr?${RANGE}&teacherId=${teacherAId}`)
            .set("Authorization", `Bearer ${tenantToken()}`);

        expect(res.status).toBe(200);
        expect(res.body.totals.totalCalls).toBe(1);
        expect(res.body.byTeacher).toHaveLength(1);
        expect(res.body.byTeacher[0].teacherName).toBe("Teacher A");
    });

    test("unknown teacherId returns 404", async () => {
        const res = await request(app)
            .get(`/tenant/analytics/ivr?${RANGE}&teacherId=${new mongoose.Types.ObjectId()}`)
            .set("Authorization", `Bearer ${tenantToken()}`);
        expect(res.status).toBe(404);
    });

    test("school_admin sees only own school", async () => {
        const res = await request(app)
            .get(`/school/analytics/ivr?${RANGE}`)
            .set("Authorization", `Bearer ${schoolAdminToken(schoolAId)}`);

        expect(res.status).toBe(200);
        expect(res.body.totals.totalCalls).toBe(2);
        expect(res.body.byTeacher).toHaveLength(1);
        expect(res.body.byTeacher[0].teacherName).toBe("Teacher A");
        expect(res.body.bySchool).toHaveLength(1);
    });

    test("school_admin cannot use tenant role route and date range excludes out-of-range calls", async () => {
        const res = await request(app)
            .get(
                "/school/analytics/ivr?startDate=2026-07-01T00:00:00Z&endDate=2026-07-31T23:59:59Z"
            )
            .set("Authorization", `Bearer ${schoolAdminToken(schoolAId)}`);
        expect(res.status).toBe(200);
        expect(res.body.totals.totalCalls).toBe(0);
    });
});
