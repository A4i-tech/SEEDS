import { textbookRemediationService } from "../../src/services/textbookRemediationService";
import { apiFetch } from "../../src/services/api";
import { SEEDS_URL } from "../../src/Constants";

jest.mock("../../src/services/api", () => ({ apiFetch: jest.fn() }));
jest.mock("../../src/utils/authHelpers", () => ({
  getAuthHeaders: () => ({ "Content-Type": "application/json", Authorization: "Bearer t" }),
}));

const BASE = `${SEEDS_URL}/textbook-remediation`;
const FIVE_MIN = 5 * 60 * 1000;

beforeEach(() => {
  jest.clearAllMocks();
  apiFetch.mockResolvedValue({ ok: true });
});

test("createJob uploads the PDF as FormData with the 5-minute timeout", async () => {
  const file = new File(["%PDF-"], "book.pdf", { type: "application/pdf" });
  await expect(
    textbookRemediationService.createJob(file, "kn", { targetLanguage: "hi" })
  ).resolves.toEqual({ ok: true });
  const [url, options] = apiFetch.mock.calls[0];
  expect(url).toBe(`${BASE}/jobs`);
  expect(options.timeoutMs).toBe(FIVE_MIN);
  expect(options.method).toBe("POST");
  expect(options.headers).toEqual({ Authorization: "Bearer t" });
  expect(options.body).toBeInstanceOf(FormData);
  expect(options.body.get("file").name).toBe("book.pdf");
  expect(options.body.get("language")).toBe("kn");
  expect(options.body.get("target_language")).toBe("hi");
});

test("markVerified posts the title with the 5-minute timeout", async () => {
  await expect(textbookRemediationService.markVerified("job 1", { title: "Book" })).resolves.toEqual({ ok: true });
  expect(apiFetch).toHaveBeenCalledWith(`${BASE}/jobs/job%201/verify`, {
    timeoutMs: FIVE_MIN,
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer t" },
    body: JSON.stringify({ title: "Book" }),
  });
});

test("translateJob posts the target language with the 5-minute timeout", async () => {
  await expect(textbookRemediationService.translateJob("job-1", "hi")).resolves.toEqual({ ok: true });
  expect(apiFetch).toHaveBeenCalledWith(`${BASE}/jobs/job-1/translate`, {
    timeoutMs: FIVE_MIN,
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer t" },
    body: JSON.stringify({ target_language: "hi" }),
  });
});

test("getLanguages forwards the caller signal and keeps the default timeout", async () => {
  const controller = new AbortController();
  await textbookRemediationService.getLanguages({ signal: controller.signal });
  expect(apiFetch).toHaveBeenCalledWith(`${SEEDS_URL}/v1/languages`, { method: "GET", signal: controller.signal });
});

test("unrelated calls keep the default timeout", async () => {
  await textbookRemediationService.saveDraft("job-1", "# draft");
  await textbookRemediationService.deleteJob("job-1");
  await textbookRemediationService.getReviewSummary("job-1");
  for (const [, options] of apiFetch.mock.calls) {
    expect(options.timeoutMs).toBeUndefined();
  }
});
