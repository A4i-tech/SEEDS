import { analyticsService } from "../../src/services/analyticsService";
import { apiFetch } from "../../src/services/api";
import { getRole } from "../../src/utils/authHelpers";
import { downloadBlob } from "../../src/utils/exportHelpers";

jest.mock("../../src/services/api", () => ({
  ...jest.requireActual("../../src/services/api"),
  apiFetch: jest.fn(),
}));
jest.mock("../../src/Constants", () => ({ SEEDS_URL: "http://test-api" }));
jest.mock("../../src/utils/authHelpers", () => ({
  getRole: jest.fn(),
  getAuthHeaders: jest.fn(() => ({ Authorization: "Bearer x" })),
}));
jest.mock("../../src/utils/exportHelpers", () => ({
  downloadBlob: jest.fn(),
}));

const START = new Date("2026-06-01T00:00:00Z");
const END = new Date("2026-06-30T23:59:59Z");
const HEADERS = { Authorization: "Bearer x" };

describe("analyticsService extended analytics", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("getIvrAnalytics", () => {
    test("uses tenant URL for tenant role", async () => {
      getRole.mockReturnValue("tenant");
      apiFetch.mockResolvedValue({ totals: {} });

      await analyticsService.getIvrAnalytics(START, END, {}, HEADERS);

      const [url, options] = apiFetch.mock.calls[0];
      expect(url).toContain("http://test-api/tenant/analytics/ivr?");
      expect(url).toContain(`startDate=${encodeURIComponent(START.toISOString())}`);
      expect(url).toContain(`endDate=${encodeURIComponent(END.toISOString())}`);
      expect(options).toEqual({ method: "GET", headers: HEADERS });
    });

    test("uses school URL for school_admin role", async () => {
      getRole.mockReturnValue("school_admin");
      apiFetch.mockResolvedValue({ totals: {} });

      await analyticsService.getIvrAnalytics(START, END, {}, HEADERS);

      expect(apiFetch.mock.calls[0][0]).toContain("http://test-api/school/analytics/ivr?");
    });

    test("includes schoolId and teacherId filters when set", async () => {
      getRole.mockReturnValue("tenant");
      apiFetch.mockResolvedValue({ totals: {} });

      await analyticsService.getIvrAnalytics(START, END, { schoolId: "s1", teacherId: "t1" }, HEADERS);

      const url = apiFetch.mock.calls[0][0];
      expect(url).toContain("schoolId=s1");
      expect(url).toContain("teacherId=t1");
    });

    test("omits empty filters", async () => {
      getRole.mockReturnValue("tenant");
      apiFetch.mockResolvedValue({ totals: {} });

      await analyticsService.getIvrAnalytics(START, END, {}, HEADERS);

      const url = apiFetch.mock.calls[0][0];
      expect(url).not.toContain("schoolId");
      expect(url).not.toContain("teacherId");
    });

    test("throws without dates", async () => {
      getRole.mockReturnValue("tenant");
      await expect(analyticsService.getIvrAnalytics(null, END)).rejects.toThrow(
        "Both startDate and endDate are required"
      );
    });
  });

  describe("getConferenceAnalytics", () => {
    test("targets the conference endpoint", async () => {
      getRole.mockReturnValue("tenant");
      apiFetch.mockResolvedValue({ totals: {} });

      await analyticsService.getConferenceAnalytics(START, END, {}, HEADERS);

      expect(apiFetch.mock.calls[0][0]).toContain("http://test-api/tenant/analytics/conference?");
    });
  });

  describe("exportAnalyticsCSV", () => {
    test("builds CSV client-side from supplied rows and triggers blob download", async () => {
      global.fetch = jest.fn();
      const rows = [
        { teacherName: "Teacher A", schoolName: "School X", totalCalls: 3, averageSeconds: 42, failureRate: 0.1 },
      ];

      analyticsService.exportAnalyticsCSV("ivr", "byTeacher", rows, START, END);

      // No backend round-trip: CSV is produced on the device.
      expect(global.fetch).not.toHaveBeenCalled();
      expect(downloadBlob).toHaveBeenCalledTimes(1);
      const [blob, filename] = downloadBlob.mock.calls[0];
      expect(blob).toBeInstanceOf(Blob);
      expect(blob.type).toContain("text/csv");
      expect(filename).toContain("ivr-analytics-byTeacher");
    });

    test("throws on unknown section without downloading", () => {
      expect(() => analyticsService.exportAnalyticsCSV("ivr", "bogus", [], START, END)).toThrow(
        "Unknown export section: ivr/bogus"
      );
      expect(downloadBlob).not.toHaveBeenCalled();
    });
  });
});
