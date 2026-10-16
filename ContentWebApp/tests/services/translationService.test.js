import { translationService } from "../../src/services/translationService";
import { onboardingService } from "../../src/services/onboardingService";
import { apiFetch } from "../../src/services/api";

jest.mock("../../src/services/api", () => ({
  apiFetch: jest.fn().mockResolvedValue([]),
  buildQueryString: (params) => new URLSearchParams(params).toString(),
}));

beforeEach(() => {
  apiFetch.mockClear();
  localStorage.setItem("authToken", "t");
});

test("generateForReview overrides the default timeout with 5 minutes", async () => {
  await translationService.generateForReview({ siteId: "s1", route: "/", lang: "hi" });
  expect(apiFetch).toHaveBeenCalledWith(
    expect.stringContaining("/translations/generate?"),
    expect.objectContaining({ timeoutMs: 300000, method: "POST" })
  );
});

test("bulkApproveTranslations reuses the 5-minute generate timeout", async () => {
  await translationService.bulkApproveTranslations({ siteId: "s1", route: "/", lang: "hi" });
  expect(apiFetch).toHaveBeenCalledWith(
    expect.stringContaining("/translations/bulk-approve?"),
    expect.objectContaining({ timeoutMs: 300000, method: "POST" })
  );
});

test("other operations keep the 15s default timeout", async () => {
  await translationService.getRuntimeTranslations("s1", "/", "hi");
  await onboardingService.listSites();
  expect(apiFetch).toHaveBeenCalledTimes(2);
  apiFetch.mock.calls.forEach(([, options]) => expect(options.timeoutMs).toBe(15000));
});

test("importTranslations posts the rows with the 5-minute timeout and maps the response", async () => {
  apiFetch.mockResolvedValueOnce({ updated: 1, created: 0, unchanged: 0, skipped_blank: 2, failed: 0, errors: [] });
  const rows = [{ route: "/", key: "te9jc70", source: "Hello World", text: "ಹಲೋ" }];

  const result = await translationService.importTranslations({
    siteId: "s1",
    lang: "kn",
    overwriteBlank: true,
    state: "keep",
    rows,
  });

  const [url, options] = apiFetch.mock.calls[0];
  expect(url).toContain("/translations/import?site_id=s1");
  expect(options).toEqual(expect.objectContaining({ method: "POST", timeoutMs: 300000 }));
  expect(JSON.parse(options.body)).toEqual({ lang: "kn", overwrite_blank: true, state: "keep", rows });
  expect(result.skippedBlank).toBe(2);
  expect(result).not.toHaveProperty("skipped_blank");
  expect(result.updated).toBe(1);
});
