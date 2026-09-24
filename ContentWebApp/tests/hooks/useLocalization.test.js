import { renderHook, waitFor, act } from "@testing-library/react";
import { useLocalization } from "../../src/hooks/useLocalization";
import { onboardingService } from "../../src/services/onboardingService";
import { languageService } from "../../src/services/languageService";

jest.mock("../../src/services/onboardingService", () => ({
  onboardingService: {
    listSites: jest.fn(),
    createSite: jest.fn(),
    updateSite: jest.fn(),
    deleteSite: jest.fn(),
  },
}));
jest.mock("../../src/services/languageService", () => ({ languageService: { listLanguages: jest.fn() } }));

const site = { id: "s1", siteId: "site-1", domain: "a.com", status: "Active" };
const language = { id: "l1", code: "hi", name: "Hindi", enabled: true };

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, "error").mockImplementation(() => {});
  onboardingService.listSites.mockResolvedValue([site]);
  languageService.listLanguages.mockResolvedValue([language]);
});

afterEach(() => console.error.mockRestore());

const loaded = async () => {
  const hook = renderHook(() => useLocalization());
  await waitFor(() => expect(hook.result.current.isLoadingWorkspace).toBe(false));
  return hook;
};

test("starts loading with empty collections", () => {
  const { result } = renderHook(() => useLocalization());
  expect(result.current.isLoadingWorkspace).toBe(true);
  expect(result.current.sites).toEqual([]);
  expect(result.current.languages).toEqual([]);
  expect(result.current.workspaceLoadError).toBeNull();
});

test("loads sites and languages", async () => {
  const { result } = await loaded();
  expect(result.current.sites).toEqual([site]);
  expect(result.current.languages).toEqual([language]);
  expect(result.current.workspaceLoadError).toBeNull();
});

test("a failed site load keeps the other collections and reports the error", async () => {
  onboardingService.listSites.mockRejectedValue(new Error("sites down"));
  const { result } = await loaded();
  expect(result.current.sites).toEqual([]);
  expect(result.current.languages).toEqual([language]);
  expect(result.current.workspaceLoadError.message).toBe("sites down");
  expect(console.error).toHaveBeenCalled();
});

test("a failed language load keeps the other collections and reports the error", async () => {
  languageService.listLanguages.mockRejectedValue(new Error("langs down"));
  const { result } = await loaded();
  expect(result.current.languages).toEqual([]);
  expect(result.current.sites).toEqual([site]);
  expect(result.current.workspaceLoadError.message).toBe("langs down");
});

test("results that arrive after unmount are ignored", async () => {
  let resolveSites;
  onboardingService.listSites.mockReturnValue(new Promise((r) => (resolveSites = r)));
  const { unmount } = renderHook(() => useLocalization());
  unmount();
  await act(async () => resolveSites([site]));
  expect(console.error).not.toHaveBeenCalled();
});

test("handleCreateSite sends the mapped fields and appends the created site", async () => {
  const created = { id: "s2", siteId: "site-2", domain: "b.com", status: "Active" };
  onboardingService.createSite.mockResolvedValue(created);
  const { result } = await loaded();
  let returned;
  await act(async () => {
    returned = await result.current.handleCreateSite({
      domain: "b.com",
      name: "B",
      status: "Active",
      ignored: "x",
    });
  });
  expect(onboardingService.createSite).toHaveBeenCalledWith({
    domain: "b.com",
    name: "B",
    status: "Active",
  });
  expect(returned).toBe(created);
  expect(result.current.sites).toEqual([site, created]);
});

test("handleUpdateSite replaces only the matching site", async () => {
  const other = { id: "s2", siteId: "site-2", domain: "b.com", status: "Active" };
  onboardingService.listSites.mockResolvedValue([site, other]);
  const updated = { ...site, name: "Renamed" };
  onboardingService.updateSite.mockResolvedValue(updated);
  const { result } = await loaded();
  await act(async () => {
    await result.current.handleUpdateSite("s1", { name: "Renamed" });
  });
  expect(onboardingService.updateSite).toHaveBeenCalledWith("s1", { name: "Renamed" });
  expect(result.current.sites).toEqual([updated, other]);
});

test("handleDeleteSite removes the site after the API call succeeds", async () => {
  onboardingService.deleteSite.mockResolvedValue(undefined);
  const { result } = await loaded();
  await act(async () => {
    await result.current.handleDeleteSite("s1");
  });
  expect(onboardingService.deleteSite).toHaveBeenCalledWith("s1");
  expect(result.current.sites).toEqual([]);
});

test("a failed delete leaves the list unchanged and rethrows", async () => {
  onboardingService.deleteSite.mockRejectedValue(new Error("nope"));
  const { result } = await loaded();
  await act(async () => {
    await expect(result.current.handleDeleteSite("s1")).rejects.toThrow("nope");
  });
  expect(result.current.sites).toEqual([site]);
});
