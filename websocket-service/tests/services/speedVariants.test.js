const { getVariantBlobName, snapToSupportedSpeed, formatSpeedLabel } = require("../../src/services/speedVariants");

describe("formatSpeedLabel", () => {
  test("renders whole numbers with one decimal", () => {
    expect(formatSpeedLabel(1.0)).toBe("1.0");
    expect(formatSpeedLabel(2.0)).toBe("2.0");
  });

  test("renders fractional speeds as-is", () => {
    expect(formatSpeedLabel(0.75)).toBe("0.75");
    expect(formatSpeedLabel(1.25)).toBe("1.25");
    expect(formatSpeedLabel(1.5)).toBe("1.5");
  });
});

describe("getVariantBlobName", () => {
  test("returns base name unchanged for 1.0x", () => {
    expect(getVariantBlobName("content123/1.0.mp3", 1.0)).toBe("content123/1.0.mp3");
  });

  test("inserts suffix before extension", () => {
    expect(getVariantBlobName("content123/1.0.mp3", 1.5)).toBe("content123/1.0__speed_1.5.mp3");
  });

  test("whole-number speed keeps decimal", () => {
    expect(getVariantBlobName("content123/1.0.mp3", 2.0)).toBe("content123/1.0__speed_2.0.mp3");
  });

  test("handles nested paths and non-mp3 extensions", () => {
    expect(getVariantBlobName("folder/subfolder/audio.wav", 0.75)).toBe(
      "folder/subfolder/audio__speed_0.75.wav"
    );
  });

  test("handles no extension", () => {
    expect(getVariantBlobName("content123/noext", 1.25)).toBe("content123/noext__speed_1.25");
  });
});

describe("snapToSupportedSpeed", () => {
  test("returns exact match unchanged", () => {
    expect(snapToSupportedSpeed(1.5)).toBe(1.5);
  });

  test("snaps to nearest supported speed", () => {
    expect(snapToSupportedSpeed(0.6)).toBe(0.75);
    expect(snapToSupportedSpeed(1.9)).toBe(2.0);
    expect(snapToSupportedSpeed(1.1)).toBe(1.0);
  });

  test("clamps out-of-range values to nearest bound", () => {
    expect(snapToSupportedSpeed(0.1)).toBe(0.75);
    expect(snapToSupportedSpeed(5)).toBe(2.0);
  });
});
