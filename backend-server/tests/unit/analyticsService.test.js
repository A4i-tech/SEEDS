const {
    normalizePhone,
    phoneCandidates,
    median,
    parseDate,
    finalCallStatus,
    classifyCall,
    sessionSeconds,
    bucketClassSize,
    extractConferenceMetrics,
} = require("../../src/services/analytics.service");

describe("analytics service helpers", () => {
    describe("normalizePhone", () => {
        test("strips country code and formatting to last 10 digits", () => {
            expect(normalizePhone("+919876543210")).toBe("9876543210");
            expect(normalizePhone("919876543210")).toBe("9876543210");
            expect(normalizePhone("9876543210")).toBe("9876543210");
            expect(normalizePhone("+91 98765-43210")).toBe("9876543210");
        });

        test("handles empty and short values", () => {
            expect(normalizePhone("")).toBe("");
            expect(normalizePhone(null)).toBe("");
            expect(normalizePhone("12345")).toBe("12345");
        });
    });

    describe("phoneCandidates", () => {
        test("returns unique stored-format variants", () => {
            const candidates = phoneCandidates("+91 9876543210");
            expect(candidates).toEqual(
                expect.arrayContaining(["9876543210", "919876543210", "+919876543210"])
            );
        });

        test("returns empty for blank input", () => {
            expect(phoneCandidates("")).toEqual([]);
        });
    });

    describe("median", () => {
        test("odd count returns middle value", () => {
            expect(median([5, 1, 3])).toBe(3);
        });

        test("even count returns mean of middle values", () => {
            expect(median([1, 2, 3, 4])).toBe(2.5);
        });

        test("empty returns null", () => {
            expect(median([])).toBeNull();
        });
    });

    describe("parseDate", () => {
        test("parses ISO strings with T", () => {
            expect(parseDate("2026-06-01T10:00:00.123456").getTime()).toBeGreaterThan(0);
        });

        test("parses space-separated datetime strings", () => {
            expect(parseDate("2026-06-01 10:00:00.123456").getTime()).toBeGreaterThan(0);
        });

        test("returns null for empty or invalid", () => {
            expect(parseDate(null)).toBeNull();
            expect(parseDate("not-a-date")).toBeNull();
        });
    });

    describe("finalCallStatus", () => {
        test("returns status at latest timestamp key", () => {
            const updates = {
                "2026-06-01T10:00:00": "started",
                "2026-06-01T10:00:05": "answered",
                "2026-06-01T10:05:00": "completed",
            };
            expect(finalCallStatus(updates)).toBe("completed");
        });

        test("returns null for empty map", () => {
            expect(finalCallStatus({})).toBeNull();
            expect(finalCallStatus(null)).toBeNull();
        });

        test("flattens nested entries from dotted $set writes", () => {
            const updates = {
                "2026-01-12T10:02:36": { "173000+00:00": "started" },
                "2026-01-12T10:04:41": { "696000+00:00": "completed" },
            };
            expect(finalCallStatus(updates)).toBe("completed");
        });
    });

    describe("classifyCall", () => {
        test("completed is success", () => {
            expect(classifyCall("completed")).toBe("completed");
        });

        test.each(["failed", "busy", "unanswered", "rejected", "cancelled", "timeout"])(
            "%s is failure",
            (status) => {
                expect(classifyCall(status)).toBe("failed");
            }
        );

        test("disconnected and non-terminal statuses are dropped", () => {
            expect(classifyCall("disconnected")).toBe("dropped");
            expect(classifyCall("answered")).toBe("dropped");
            expect(classifyCall(null)).toBe("dropped");
        });
    });

    describe("sessionSeconds", () => {
        test("prefers reported duration", () => {
            expect(sessionSeconds({ duration: "120" })).toBe(120);
        });

        test("falls back to stopped_at - created_at", () => {
            const log = {
                duration: "",
                created_at: "2026-06-01T10:00:00",
                stopped_at: "2026-06-01T10:02:00",
            };
            expect(sessionSeconds(log)).toBe(120);
        });

        test("returns null when nothing usable", () => {
            expect(sessionSeconds({ duration: "", created_at: "2026-06-01T10:00:00" })).toBeNull();
        });
    });

    describe("bucketClassSize", () => {
        test.each([
            [1, "1-5"],
            [5, "1-5"],
            [6, "6-10"],
            [15, "11-20"],
            [50, "21-50"],
            [51, "50+"],
        ])("%i → %s", (size, expected) => {
            expect(bucketClassSize(size)).toBe(expected);
        });
    });

    describe("extractConferenceMetrics", () => {
        const baseDoc = {
            _id: "conf-1",
            is_running: false,
            participants: {
                "+911111111111": { role: "Teacher" },
                "+912222222222": { role: "Student" },
                "+913333333333": { role: "Student" },
            },
            action_history: [
                { timestamp: "2026-06-01T10:00:00", action_type: "Conference-Created", metadata: {}, owner: "t" },
                { timestamp: "2026-06-01T10:01:00", action_type: "Conference-Start", metadata: {}, owner: "t" },
                {
                    timestamp: "2026-06-01T10:10:00",
                    action_type: "Student-RaiseHandStateChange",
                    metadata: { raised_hand: true },
                    owner: "s",
                },
                {
                    timestamp: "2026-06-01T10:11:00",
                    action_type: "Student-RaiseHandStateChange",
                    metadata: { raised_hand: false },
                    owner: "s",
                },
                { timestamp: "2026-06-01T10:31:00", action_type: "Conference-End", metadata: {}, owner: "t" },
            ],
        };

        test("computes duration, class size, and raised hands", () => {
            const metrics = extractConferenceMetrics(baseDoc);
            expect(metrics.durationSeconds).toBe(1800);
            expect(metrics.studentCount).toBe(2);
            expect(metrics.raisedHandEvents).toBe(1);
            expect(metrics.neverStarted).toBe(false);
            expect(metrics.isRunning).toBe(false);
        });

        test("conference without end has null duration", () => {
            const doc = {
                ...baseDoc,
                action_history: baseDoc.action_history.filter(
                    (a) => a.action_type !== "Conference-End"
                ),
            };
            const metrics = extractConferenceMetrics(doc);
            expect(metrics.durationSeconds).toBeNull();
            expect(metrics.endedAt).toBeNull();
        });

        test("conference never started is flagged", () => {
            const doc = {
                ...baseDoc,
                action_history: [baseDoc.action_history[0]],
            };
            const metrics = extractConferenceMetrics(doc);
            expect(metrics.neverStarted).toBe(true);
            expect(metrics.startedAt).toBeNull();
        });

        test("handles missing participants and history", () => {
            const metrics = extractConferenceMetrics({ _id: "x" });
            expect(metrics.studentCount).toBe(0);
            expect(metrics.raisedHandEvents).toBe(0);
            expect(metrics.neverStarted).toBe(true);
        });
    });
});
