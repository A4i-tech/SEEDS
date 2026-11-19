import { translationService } from "../../src/services/translationService";
import { apiFetch, buildQueryString } from "../../src/services/api";

jest.mock("../../src/services/api", () => ({
  apiFetch: jest.fn(),
  buildQueryString: jest.requireActual("../../src/services/api").buildQueryString,
}));
jest.mock("../../src/utils/authHelpers", () => ({ getAuthHeaders: () => ({}) }));

const FIVE_MIN = 5 * 60 * 1000;

beforeEach(() => {
  jest.clearAllMocks();
});

test("generateForReview passes the 5-minute timeout override", async () => {
  apiFetch.mockResolvedValue({});
  await translationService.generateForReview({ siteId: "s1", route: "/", lang: "fr" });
  const [, options] = apiFetch.mock.calls[0];
  expect(options.timeoutMs).toBe(FIVE_MIN);
});

test("bulkApproveTranslations passes the 5-minute timeout override", async () => {
  apiFetch.mockResolvedValue({});
  await translationService.bulkApproveTranslations({ siteId: "s1", route: "/", lang: "fr" });
  const [, options] = apiFetch.mock.calls[0];
  expect(options.timeoutMs).toBe(FIVE_MIN);
});

test("extractItems does not override the default timeout", async () => {
  apiFetch.mockResolvedValue({});
  await translationService.extractItems("s1", []);
  const [, options] = apiFetch.mock.calls[0];
  expect(options.timeoutMs).toBeUndefined();
});
