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

test("registers the site under the first existing project", async () => {
  const loc = {
    projects: [{ id: "p1" }],
    handleCreateSite: jest.fn(async (v) => ({ id: "s1", domain: v.domain, siteId: "x", snippet: "" })),
  };
  renderCard(loc);
  await waitFor(() =>
    expect(loc.handleCreateSite).toHaveBeenCalledWith({ projectId: "p1", domain: "new.example.org", name: "", status: "Active" })
  );
  expect(await screen.findByText("Website Connected")).toBeInTheDocument();
});

test("when projects failed to load it shows the load error and creates nothing", async () => {
  const loc = {
    projects: [],
    workspaceLoadError: new Error("Failed to fetch"),
    handleCreateSite: jest.fn(),
    handleCreateProject: jest.fn(),
  };
  renderCard(loc);
  expect((await screen.findAllByText("Failed to fetch")).length).toBeGreaterThan(0);
  expect(loc.handleCreateSite).not.toHaveBeenCalled();
  expect(loc.handleCreateProject).not.toHaveBeenCalled();
});

test("when there is no project and no load error it says so instead of creating a Default Project", async () => {
  const loc = { projects: [], workspaceLoadError: null, handleCreateSite: jest.fn(), handleCreateProject: jest.fn() };
  renderCard(loc);
  expect((await screen.findAllByText("No project available to register the website under")).length).toBeGreaterThan(0);
  expect(loc.handleCreateSite).not.toHaveBeenCalled();
  expect(loc.handleCreateProject).not.toHaveBeenCalled();
});
