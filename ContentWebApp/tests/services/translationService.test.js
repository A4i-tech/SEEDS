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
