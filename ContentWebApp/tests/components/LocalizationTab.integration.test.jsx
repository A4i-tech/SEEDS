import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import LocalizationTab from "../../src/components/AllContent/LocalizationTab/LocalizationTab";
import { onboardingService } from "../../src/services/onboardingService";
import { languageService } from "../../src/services/languageService";
import { translationService } from "../../src/services/translationService";

jest.mock("../../src/services/onboardingService", () => ({
  onboardingService: { listSites: jest.fn(), getSite: jest.fn() },
}));
jest.mock("../../src/services/languageService", () => ({ languageService: { listLanguages: jest.fn() } }));
jest.mock("../../src/services/translationService", () => ({
  translationService: { listTranslations: jest.fn(), generateForReview: jest.fn() },
}));
jest.mock("../../src/components/AllContent/shared/MiddleEllipsis", () => ({
  __esModule: true,
  default: ({ text }) => require("react").createElement("span", null, text),
}));

beforeAll(() => {
  window.HTMLElement.prototype.hasPointerCapture = jest.fn().mockReturnValue(false);
  window.HTMLElement.prototype.setPointerCapture = jest.fn();
  window.HTMLElement.prototype.releasePointerCapture = jest.fn();
  window.HTMLElement.prototype.scrollIntoView = jest.fn();
  Object.defineProperty(window.HTMLElement.prototype, "clientWidth", { configurable: true, value: 150 });
  window.HTMLCanvasElement.prototype.getContext = () => ({
    measureText: (text) => ({ width: text.length * 10 }),
  });
  window.ResizeObserver =
    window.ResizeObserver ||
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
});

const site = {
  id: "s1",
  siteId: "site-1",
  domain: "a.com",
  name: "",
  status: "Active",
  languages: [{ code: "hi", enabled: true }],
};
const doc = (id, route, text, updatedAt) => ({
  id,
  route,
  sourceText: text,
  updatedAt,
  translations: { hi: { text: `${text}-hi`, status: "pending" } },
});
const docs = [doc("k1", "/contact", "Contact us", "2024-01-01"), doc("k2", "/about", "About us", "2024-02-01")];

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
  onboardingService.listSites.mockResolvedValue([site]);
  languageService.listLanguages.mockResolvedValue([
    { code: "hi", standard: "ISO 639-1", name: "Hindi" },
    { code: "kn", standard: "ISO 639-1", name: "Kannada" },
  ]);
  translationService.listTranslations.mockImplementation(async ({ route }) =>
    route ? docs.filter((d) => d.route === route) : docs
  );
});

const openWorkspace = async () => {
  await screen.findByText("Connect your website");
  fireEvent.click(screen.getByRole("button", { name: "Translate & Review" }));
};

test("shows a loading skeleton, then the registration screen with the registered site", async () => {
  render(<LocalizationTab />);
  expect(document.querySelector('[aria-busy="true"]')).toBeInTheDocument();
  expect(await screen.findByText("Connect your website")).toBeInTheDocument();
  expect(await screen.findByText("a.com")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Registration" })).toHaveClass("active");
});

test("opening Translate & Review selects the first site and its newest page and lists its segments", async () => {
  render(<LocalizationTab />);
  await openWorkspace();
  expect(screen.getByRole("button", { name: "Translate & Review" })).toHaveClass("active");
  await waitFor(() => expect(translationService.listTranslations).toHaveBeenCalledWith({ siteId: "site-1" }));
  await waitFor(() =>
    expect(translationService.listTranslations).toHaveBeenCalledWith({ siteId: "site-1", route: "/about" })
  );
  expect(await screen.findByText("About us")).toBeInTheDocument();
  expect(screen.queryByText("Contact us")).not.toBeInTheDocument();
  expect(translationService.generateForReview).not.toHaveBeenCalled();
});

test("a remembered route that no longer exists falls back to the newest page", async () => {
  localStorage.setItem(
    "locaui.scope",
    JSON.stringify({ siteId: "site-1", route: "/gone", lang: "hi" })
  );
  render(<LocalizationTab />);
  await openWorkspace();
  await waitFor(() =>
    expect(translationService.listTranslations).toHaveBeenCalledWith({ siteId: "site-1", route: "/about" })
  );
});

test("a remembered route that still exists is kept", async () => {
  localStorage.setItem(
    "locaui.scope",
    JSON.stringify({ siteId: "site-1", route: "/contact", lang: "hi" })
  );
  render(<LocalizationTab />);
  await openWorkspace();
  expect(await screen.findByText("Contact us")).toBeInTheDocument();
  expect(translationService.listTranslations).not.toHaveBeenCalledWith({ siteId: "site-1", route: "/about" });
});

test("a 403 while listing pages shows a permission message", async () => {
  translationService.listTranslations.mockRejectedValue(Object.assign(new Error("denied"), { status: 403 }));
  render(<LocalizationTab />);
  await openWorkspace();
  expect(await screen.findByText("Permission denied loading pages")).toBeInTheDocument();
});

test("any other failure while listing pages shows its message", async () => {
  translationService.listTranslations.mockImplementation(async ({ route }) => {
    if (route) return [];
    throw new Error("pages exploded");
  });
  render(<LocalizationTab />);
  await openWorkspace();
  expect(await screen.findByText("pages exploded")).toBeInTheDocument();
});

test("without any site nothing is listed", async () => {
  onboardingService.listSites.mockResolvedValue([]);
  render(<LocalizationTab />);
  await openWorkspace();
  await screen.findByRole("button", { name: "Translate & Review" });
  expect(translationService.listTranslations).not.toHaveBeenCalledWith(
    expect.objectContaining({ siteId: "site-1" })
  );
});

test("Review Language dropdown lists only the selected site's configured languages", async () => {
  render(<LocalizationTab />);
  await openWorkspace();
  await screen.findByText("About us");
  fireEvent.click(screen.getByText("Review Language").nextSibling.querySelector("button"));
  expect(screen.getByRole("option", { name: "Hindi" })).toBeInTheDocument();
  expect(screen.queryByRole("option", { name: "Kannada" })).not.toBeInTheDocument();
});

test("switching back to Registration shows the onboarding card again", async () => {
  render(<LocalizationTab />);
  await openWorkspace();
  await screen.findByText("About us");
  fireEvent.click(screen.getByRole("button", { name: "Registration" }));
  expect(await screen.findByText("Connect your website")).toBeInTheDocument();
});
