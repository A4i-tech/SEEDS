import { brailleAsciiToUnicode } from "../../src/utils/brailleAscii";

describe("brailleAsciiToUnicode", () => {
  test("blank maps to the empty braille cell U+2800", () => {
    expect(brailleAsciiToUnicode(" ")).toBe("⠀");
  });

  test("'A' maps to dot-1 (U+2801)", () => {
    expect(brailleAsciiToUnicode("A")).toBe("⠁");
  });

  test("lowercases input before mapping", () => {
    expect(brailleAsciiToUnicode("a")).toBe(brailleAsciiToUnicode("A"));
  });

  test("every mapped glyph is in the braille block", () => {
    const out = brailleAsciiToUnicode("HELLO WORLD");
    for (const ch of out) {
      const cp = ch.codePointAt(0);
      expect(cp).toBeGreaterThanOrEqual(0x2800);
      expect(cp).toBeLessThanOrEqual(0x28ff);
    }
  });
});
