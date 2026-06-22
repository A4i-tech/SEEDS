const request = require("supertest");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const { setup, teardown, clearDatabase } = require("./integrationSetup");

const app = require("../../src/index");

const SECRET_KEY = process.env.SECRET_KEY;

const tenantId = new mongoose.Types.ObjectId();
const schoolAId = new mongoose.Types.ObjectId();
const schoolBId = new mongoose.Types.ObjectId();
const teacherAId = new mongoose.Types.ObjectId();
const teacherBId = new mongoose.Types.ObjectId();

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

function raiseHand(timestamp, raised) {
    return {
        timestamp,
        action_type: "Student-RaiseHandStateChange",
        metadata: { phone_number: "+912222222222", raised_hand: raised, raised_at: 1 },
        owner: "+912222222222",
    };
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

    // Shapes below mirror what ConferenceV2 persists.
    await db.collection("conferenceState").insertMany([
        {
            // Teacher A: 30 min, 2 students, 1 raised hand
            _id: "conf-1",
            is_running: false,
            teacher_phone_number: "+919876543210",
            participants: {
                "+919876543210": { name: "Teacher", phone_number: "+919876543210", role: "Teacher" },
                "+912222222222": { name: "S1", phone_number: "+912222222222", role: "Student" },
                "+913333333333": { name: "S2", phone_number: "+913333333333", role: "Student" },
            },
            action_history: [
                { timestamp: "2026-06-01T10:00:00", action_type: "Conference-Created", metadata: {}, owner: "t" },
                { timestamp: "2026-06-01T10:01:00", action_type: "Conference-Start", metadata: {}, owner: "t" },
                raiseHand("2026-06-01T10:10:00", true),
                raiseHand("2026-06-01T10:11:00", false),
                { timestamp: "2026-06-01T10:31:00", action_type: "Conference-End", metadata: {}, owner: "t" },
            ],
        },
        {
            // Teacher A: still running
            _id: "conf-2",
            is_running: true,
            teacher_phone_number: "+919876543210",
            participants: {
                "+919876543210": { name: "Teacher", phone_number: "+919876543210", role: "Teacher" },
                "+912222222222": { name: "S1", phone_number: "+912222222222", role: "Student" },
            },
            action_history: [
                { timestamp: "2026-06-05T09:00:00", action_type: "Conference-Created", metadata: {}, owner: "t" },
                { timestamp: "2026-06-05T09:01:00", action_type: "Conference-Start", metadata: {}, owner: "t" },
            ],
        },
        {
            // Teacher B: 10 min, 6 students
            _id: "conf-3",
            is_running: false,
            teacher_phone_number: "+919123456789",
            participants: {
                "+919123456789": { name: "Teacher", phone_number: "+919123456789", role: "Teacher" },
                ...Object.fromEntries(
                    Array.from({ length: 6 }, (_, i) => [
                        `+9144444444${i}0`,
                        { name: `S${i}`, phone_number: `+9144444444${i}0`, role: "Student" },
                    ])
                ),
            },
            action_history: [
                { timestamp: "2026-06-02T14:00:00", action_type: "Conference-Created", metadata: {}, owner: "t" },
                { timestamp: "2026-06-02T14:01:00", action_type: "Conference-Start", metadata: {}, owner: "t" },
                { timestamp: "2026-06-02T14:11:00", action_type: "Conference-End", metadata: {}, owner: "t" },
            ],
        },
        {
            // Out of date range — must not appear
            _id: "conf-old",
            is_running: false,
            teacher_phone_number: "+919876543210",
            participants: {},
            action_history: [
                { timestamp: "2026-01-01T10:00:00", action_type: "Conference-Created", metadata: {}, owner: "t" },
            ],
        },
    ]);
}

const RANGE = "startDate=2026-06-01T00:00:00Z&endDate=2026-06-30T23:59:59Z";

describe("Conference Analytics - Integration Tests", () => {
    beforeAll(setup);
    afterAll(teardown);
    beforeEach(async () => {
        await clearDatabase();
        await seed();
    });

    test("returns 401 without token and 403 for wrong role", async () => {
        const noToken = await request(app).get(`/tenant/analytics/conference?${RANGE}`);
        expect(noToken.status).toBe(401);

        const wrongRole = await request(app)
            .get(`/tenant/analytics/conference?${RANGE}`)
            .set("Authorization", `Bearer ${schoolAdminToken()}`);
        expect(wrongRole.status).toBe(403);
    });

    test("returns 400 on missing dates", async () => {
        const res = await request(app)
            .get("/tenant/analytics/conference")
            .set("Authorization", `Bearer ${tenantToken()}`);
        expect(res.status).toBe(400);
    });

    test("tenant gets full conference metrics", async () => {
        const res = await request(app)
            .get(`/tenant/analytics/conference?${RANGE}`)
            .set("Authorization", `Bearer ${tenantToken()}`);

        expect(res.status).toBe(200);
        expect(res.body.totals).toEqual({
            totalConferences: 3,
            completedConferences: 2,
            liveConferences: 1,
            neverStarted: 0,
        });
        expect(res.body.duration).toEqual({
            averageSeconds: 1200,
            medianSeconds: 1200,
            totalSeconds: 2400,
        });
        expect(res.body.classSize.average).toBe(3);
        expect(res.body.classSize.median).toBe(2);
        const buckets = Object.fromEntries(
            res.body.classSize.distribution.map((b) => [b.bucket, b.count])
        );
        expect(buckets["1-5"]).toBe(2);
        expect(buckets["6-10"]).toBe(1);

        expect(res.body.raisedHands).toEqual({ totalEvents: 1, averagePerConference: 0.3 });

        expect(res.body.byTeacher).toHaveLength(2);
        const teacherA = res.body.byTeacher.find((t) => t.teacherName === "Teacher A");
        expect(teacherA.totalConferences).toBe(2);
        expect(teacherA.totalDurationSeconds).toBe(1800);
        expect(teacherA.raisedHandEvents).toBe(1);
        expect(teacherA.schoolName).toBe("School A");

        expect(res.body.conferences).toHaveLength(3);
        const conf1 = res.body.conferences.find((c) => c.conferenceId === "conf-1");
        expect(conf1.durationSeconds).toBe(1800);
        expect(conf1.studentCount).toBe(2);
        expect(conf1.startedAt).toBeTruthy();
        expect(conf1.endedAt).toBeTruthy();
    });

    test("tenant teacherId filter restricts results", async () => {
        const res = await request(app)
            .get(`/tenant/analytics/conference?${RANGE}&teacherId=${teacherBId}`)
            .set("Authorization", `Bearer ${tenantToken()}`);

        expect(res.status).toBe(200);
        expect(res.body.totals.totalConferences).toBe(1);
        expect(res.body.byTeacher[0].teacherName).toBe("Teacher B");
    });

    test("school_admin sees only own school's conferences", async () => {
        const res = await request(app)
            .get(`/school/analytics/conference?${RANGE}`)
            .set("Authorization", `Bearer ${schoolAdminToken(schoolAId)}`);

        expect(res.status).toBe(200);
        expect(res.body.totals.totalConferences).toBe(2);
        expect(res.body.byTeacher).toHaveLength(1);
        expect(res.body.byTeacher[0].teacherName).toBe("Teacher A");
    });
});
