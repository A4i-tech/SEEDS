import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ToastProvider } from "../../src/localization-ui/primitives";
import { ManageScreen } from "../../src/localization-ui/screens/Manage";

function makeLoc() {
  return {
    projects: [{ id: "p1", name: "Site A", description: "", sourceLanguage: "English", status: "Active" }],
    sites: [{ id: "s1", name: "Home", domain: "a.com", projectId: "p1", status: "Active" }],
    languages: [{ id: "l1", name: "Hindi", code: "hi", direction: "ltr", enabled: true }],
    handleCreateProject: jest.fn(async (v) => ({ id: "p2", ...v })),
    handleUpdateProject: jest.fn(async (id, v) => ({ id, ...v })),
    handleDeleteProject: jest.fn(async () => {}),
    handleCreateSite: jest.fn(async (v) => ({ id: "s2", ...v })),
    handleUpdateSite: jest.fn(async (id, v) => ({ id, ...v })),
    handleDeleteSite: jest.fn(async () => {}),
    handleCreateLanguage: jest.fn(async (v) => ({ id: "l2", ...v })),
    handleUpdateLanguage: jest.fn(async (id, v) => ({ id, ...v })),
    handleDeleteLanguage: jest.fn(async () => {}),
  };
}

function renderNav(nav, loc) {
  return render(<ToastProvider><ManageScreen nav={nav} loc={loc} /></ToastProvider>);
}

test("projects view lists existing projects and creates a new one", async () => {
  const loc = makeLoc();
  renderNav("projects", loc);
  expect(screen.getByText("Site A")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /new project/i }));
  fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Site B" } });
  fireEvent.click(screen.getByRole("button", { name: /save/i }));
  await waitFor(() => expect(loc.handleCreateProject).toHaveBeenCalled());
});

test("sites view lists existing sites and deletes one", async () => {
  const loc = makeLoc();
  renderNav("sites", loc);
  expect(screen.getByText("a.com")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /delete/i }));
  fireEvent.click(screen.getByRole("button", { name: /delete site/i }));
  await waitFor(() => expect(loc.handleDeleteSite).toHaveBeenCalledWith("s1"));
});

test("languages view toggles enabled without opening a dialog", async () => {
  const loc = makeLoc();
  renderNav("languages", loc);
  fireEvent.click(screen.getByRole("button", { name: /disable/i }));
  await waitFor(() => expect(loc.handleUpdateLanguage).toHaveBeenCalledWith("l1", { enabled: false }));
});
