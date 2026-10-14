import { onboardingService } from "./onboardingService";
import { apiFetch } from "./api";

jest.mock("./api", () => ({ apiFetch: jest.fn() }));
jest.mock("../utils/authHelpers", () => ({ getAuthHeaders: () => ({ Authorization: "Bearer t" }) }));

test("createSite posts to /websites with no timeout override", async () => {
  apiFetch.mockResolvedValue({ id: "1", domain: "example.com", site_id: "s1", api_base: "https://api" });
  await onboardingService.createSite({ domain: "example.com", name: "Example", status: "Active", languages: [{ code: "en", enabled: true }] });
  expect(apiFetch).toHaveBeenCalledWith(
    expect.stringContaining("/websites"),
    expect.objectContaining({ method: "POST", headers: { Authorization: "Bearer t" } })
  );
  const [, options] = apiFetch.mock.calls[0];
  expect(options.timeoutMs).toBeUndefined();
});
