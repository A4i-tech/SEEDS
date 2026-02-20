import { isMp3File } from "../../src/utils/fileValidators";

describe("isMp3File", () => {
  test("returns true for .mp3 filename", () => {
    const mockFile = { name: "audio.mp3", type: "audio/mpeg" };
    expect(isMp3File(mockFile)).toBe(true);
  });

  test("returns false for audio/mpeg MIME type without .mp3 extension", () => {
    const mockFile = { name: "audio.unknown", type: "audio/mpeg" };
    expect(isMp3File(mockFile)).toBe(false);
  });

  test("returns false for non-mp3 extension and non-mpeg MIME type", () => {
    const mockFile = { name: "audio.wav", type: "audio/wav" };
    expect(isMp3File(mockFile)).toBe(false);
  });

  test("returns false for null or undefined file", () => {
    expect(isMp3File(null)).toBe(false);
    expect(isMp3File(undefined)).toBe(false);
  });
});

