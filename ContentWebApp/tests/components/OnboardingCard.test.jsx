import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ToastProvider } from "../../src/components/AllContent/LocalizationTab/Toast";
import { OnboardingCard } from "../../src/components/AllContent/LocalizationTab/OnboardingCard";

jest.mock("../../src/components/AllContent/LocalizationTab/SnippetBlock", () => ({ SnippetBlock: () => null }));
jest.mock("../../src/components/AllContent/LocalizationTab/DevToolsSection", () => ({ DevToolsSection: () => null }));

function renderCard(loc) {
  render(<ToastProvider><OnboardingCard loc={loc} /></ToastProvider>);
  fireEvent.change(screen.getByLabelText("Website URL"), { target: { value: "https://new.example.org/x" } });
  fireEvent.click(screen.getByRole("button", { name: "Register Website" }));
}

test("registers the site by domain without any project", async () => {
  const loc = {
    handleCreateSite: jest.fn(async (v) => ({ id: "s1", domain: v.domain, siteId: "x", snippet: "" })),
  };
  renderCard(loc);
  await waitFor(() =>
    expect(loc.handleCreateSite).toHaveBeenCalledWith({ domain: "new.example.org", name: "", status: "Active" })
  );
  expect(await screen.findByText("Website Connected")).toBeInTheDocument();
});

test("a failed registration shows the backend message and stays on the form", async () => {
  const loc = { handleCreateSite: jest.fn().mockRejectedValue(new Error("Website with domain 'new.example.org' already exists")) };
  renderCard(loc);
  expect((await screen.findAllByText("Website with domain 'new.example.org' already exists")).length).toBeGreaterThan(0);
  expect(screen.getByRole("button", { name: "Register Website" })).toBeInTheDocument();
});

test("a failure without a message falls back to a generic error", async () => {
  const loc = { handleCreateSite: jest.fn().mockRejectedValue({}) };
  renderCard(loc);
  expect((await screen.findAllByText("Failed to register website")).length).toBeGreaterThan(0);
});
