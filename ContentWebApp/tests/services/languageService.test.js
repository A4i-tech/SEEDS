import { languageService } from "../../src/services/languageService";
import { SEEDS_URL } from "../../src/Constants";
import { apiFetch } from "../../src/services/api";

jest.mock("../../src/services/api", () => ({
  apiFetch: jest.fn(),
}));

describe("languageService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("listLanguages", () => {
    it("fetches the static catalog from /v1/languages", async () => {
      apiFetch.mockResolvedValue({
        languages: [
          { code: "hi", standard: "ISO 639-1", name: "Hindi" },
          { code: "bn", standard: "ISO 639-1", name: "Bengali" },
        ],
      });

      const out = await languageService.listLanguages();

      expect(apiFetch).toHaveBeenCalledWith(
        `${SEEDS_URL}/v1/languages`,
        expect.objectContaining({ method: "GET" })
      );
      expect(out).toEqual([
        { code: "hi", standard: "ISO 639-1", name: "Hindi" },
        { code: "bn", standard: "ISO 639-1", name: "Bengali" },
      ]);
    });
  });
});
