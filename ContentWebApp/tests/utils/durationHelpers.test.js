import { formatSeconds, formatRate } from "../../src/utils/durationHelpers";

describe("durationHelpers", () => {
  describe("formatSeconds", () => {
    test("formats minutes and seconds", () => {
      expect(formatSeconds(95)).toBe("1m 35s");
      expect(formatSeconds(0)).toBe("0m 0s");
    });

    test("formats hours above one hour", () => {
      expect(formatSeconds(3720)).toBe("1h 2m");
    });

    test("rounds fractional seconds", () => {
      expect(formatSeconds(95.6)).toBe("1m 36s");
    });

    test("returns dash for null/undefined/negative", () => {
      expect(formatSeconds(null)).toBe("—");
      expect(formatSeconds(undefined)).toBe("—");
      expect(formatSeconds(-30)).toBe("—");
    });
  });

  describe("formatRate", () => {
    test("formats 0..1 rate as percentage", () => {
      expect(formatRate(0.5)).toBe("50%");
      expect(formatRate(0.1667)).toBe("16.7%");
      expect(formatRate(0)).toBe("0%");
    });

    test("returns dash for null", () => {
      expect(formatRate(null)).toBe("—");
    });
  });
});
