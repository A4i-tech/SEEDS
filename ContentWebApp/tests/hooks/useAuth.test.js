import { renderHook } from "@testing-library/react";
import { useAuth, resetUserCache } from "../../src/hooks/useAuth";
import { apiFetch } from "../../src/services/api";

jest.mock("react-router-dom", () => ({ useNavigate: () => jest.fn() }));
jest.mock("../../src/services/api", () => ({ apiFetch: jest.fn() }));

const setToken = (payload) => {
  const encode = (obj) => Buffer.from(JSON.stringify(obj)).toString("base64url");
  localStorage.setItem("authToken", `${encode({})}.${encode(payload)}.sig`);
};

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
  resetUserCache();
  apiFetch.mockResolvedValue({ id: "vol-1", role: "textbook_remediation_volunteer", name: "Vol" });
});

test("getCurrentUser requests /textbook-remediation/me for a volunteer token", async () => {
  setToken({ role: "textbook_remediation_volunteer", name: "Vol" });
  const { result } = renderHook(() => useAuth());

  await result.current.getCurrentUser();

  const [url] = apiFetch.mock.calls[0];
  expect(url).toMatch(/\/textbook-remediation\/me$/);
  expect(url).not.toMatch(/\/tenant\/me$/);
});
