import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ToastProvider } from "../../src/components/AllContent/LocalizationTab/Toast";
import { OnboardingCard } from "../../src/components/AllContent/LocalizationTab/OnboardingCard";

jest.mock("../../src/components/AllContent/LocalizationTab/SnippetBlock", () => ({ SnippetBlock: () => null }));
jest.mock("../../src/components/AllContent/LocalizationTab/DevToolsSection", () => ({ DevToolsSection: () => null }));

const renderCard = (overrides = {}) => {
  const handleCreateSite = jest.fn().mockResolvedValue({ domain: "example-school.org", siteId: "s1", apiBase: "https://api" });
  const loc = { handleCreateSite, languages: [{ code: "en", name: "English" }, { code: "fr", name: "French" }], ...overrides };
  const { rerender } = render(<ToastProvider><OnboardingCard loc={loc} /></ToastProvider>);
  const setLanguages = (languages) =>
    rerender(<ToastProvider><OnboardingCard loc={{ ...loc, languages }} /></ToastProvider>);
  return { loc, setLanguages };
};

test("derives a name from the domain when the Name field is left empty", async () => {
  const { loc } = renderCard();
  fireEvent.change(screen.getByLabelText(/website url/i), { target: { value: "https://example-school.org" } });
  fireEvent.click(screen.getByLabelText("en"));
  fireEvent.click(screen.getByRole("button", { name: /register website/i }));
  await waitFor(() => expect(loc.handleCreateSite).toHaveBeenCalled());
  expect(loc.handleCreateSite.mock.calls[0][0].name).toBe("Example School");
  expect(loc.handleCreateSite.mock.calls[0][0].languages).toEqual([{ code: "en", enabled: true }]);
});

test("uses the typed Name field verbatim when provided", async () => {
  const { loc } = renderCard();
  fireEvent.change(screen.getByLabelText(/website url/i), { target: { value: "https://example-school.org" } });
  fireEvent.change(screen.getByLabelText(/^name$/i), { target: { value: "My School" } });
  fireEvent.click(screen.getByLabelText("en"));
  fireEvent.click(screen.getByRole("button", { name: /register website/i }));
  await waitFor(() => expect(loc.handleCreateSite).toHaveBeenCalled());
  expect(loc.handleCreateSite.mock.calls[0][0].name).toBe("My School");
  expect(loc.handleCreateSite.mock.calls[0][0].languages).toEqual([{ code: "en", enabled: true }]);
});

test("registration is blocked when no language is selected", () => {
  renderCard();
  fireEvent.change(screen.getByLabelText(/website url/i), { target: { value: "https://example-school.org" } });
  expect(screen.getByRole("button", { name: /register website/i })).toBeDisabled();
});

test("sends only selected languages that are still in the current language list", async () => {
  const { loc, setLanguages } = renderCard();
  fireEvent.change(screen.getByLabelText(/website url/i), { target: { value: "https://example-school.org" } });
  fireEvent.click(screen.getByLabelText("en"));
  fireEvent.click(screen.getByLabelText("fr"));
  setLanguages([{ code: "fr", name: "French" }]);
  fireEvent.click(screen.getByRole("button", { name: /register website/i }));
  await waitFor(() => expect(loc.handleCreateSite).toHaveBeenCalled());
  expect(loc.handleCreateSite.mock.calls[0][0].languages).toEqual([{ code: "fr", enabled: true }]);
});

test("blocks registration when no selected language is in the current language list", () => {
  const { loc, setLanguages } = renderCard();
  fireEvent.change(screen.getByLabelText(/website url/i), { target: { value: "https://example-school.org" } });
  fireEvent.click(screen.getByLabelText("en"));
  setLanguages([{ code: "fr", name: "French" }]);
  const button = screen.getByRole("button", { name: /register website/i });
  expect(button).toBeDisabled();
  fireEvent.submit(button.closest("form"));
  expect(loc.handleCreateSite).not.toHaveBeenCalled();
});

test("registration proceeds once a language is checked", async () => {
  const { loc } = renderCard();
  fireEvent.change(screen.getByLabelText(/website url/i), { target: { value: "https://example-school.org" } });
  fireEvent.click(screen.getByLabelText("fr"));
  fireEvent.click(screen.getByRole("button", { name: /register website/i }));
  await waitFor(() => expect(loc.handleCreateSite).toHaveBeenCalled());
  expect(loc.handleCreateSite.mock.calls[0][0].languages).toEqual([{ code: "fr", enabled: true }]);
});
