import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ToastProvider } from "../../src/components/AllContent/LocalizationTab/Toast";
import { ManageScreen } from "../../src/components/AllContent/LocalizationTab/Manage";
import { onboardingService } from "../../src/services/onboardingService";

jest.mock("../../src/services/onboardingService", () => ({
  onboardingService: { getSite: jest.fn() },
}));

function makeLoc() {
  return {
    sites: [
      {
        id: "s1",
        name: "Home",
        domain: "a.com",
        url: "https://a.com",
        status: "Active",
        languages: [{ code: "hi", enabled: true }],
      },
    ],
    languages: [
      { code: "hi", standard: "ISO 639-1", name: "Hindi" },
      { code: "bn", standard: "ISO 639-1", name: "Bengali" },
    ],
    handleCreateSite: jest.fn(async (v) => ({ id: "s2", ...v })),
    handleUpdateSite: jest.fn(async (id, v) => ({ id, ...v })),
    handleDeleteSite: jest.fn(async () => {}),
  };
}

function renderNav(nav, loc) {
  return render(<ToastProvider><ManageScreen nav={nav} loc={loc} /></ToastProvider>);
}

test("sites view lists existing sites and deletes one", async () => {
  const loc = makeLoc();
  renderNav("sites", loc);
  expect(screen.getByText("a.com")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /delete/i }));
  fireEvent.click(screen.getByRole("button", { name: /delete site/i }));
  await waitFor(() => expect(loc.handleDeleteSite).toHaveBeenCalledWith("s1"));
});

test("sites view opens a site's SDK snippet fetched fresh from the backend", async () => {
  onboardingService.getSite.mockResolvedValue({
    id: "s1",
    domain: "a.com",
    siteId: "site-1",
    apiBase: "https://api.example.com",
  });
  renderNav("sites", makeLoc());
  fireEvent.click(screen.getByRole("button", { name: /view snippet/i }));
  await screen.findByText(
    (_, node) => node.tagName === "CODE" && node.textContent.includes("data-site-id=\"site-1\"")
  );
  expect(onboardingService.getSite).toHaveBeenCalledWith("s1");
});

test("sites view surfaces a failed snippet fetch instead of opening an empty modal", async () => {
  onboardingService.getSite.mockRejectedValue(new Error("boom"));
  renderNav("sites", makeLoc());
  fireEvent.click(screen.getByRole("button", { name: /view snippet/i }));
  await screen.findByText("boom");
  expect(screen.queryByText(/SDK snippet/)).not.toBeInTheDocument();
});

test("add-site modal has no Project field and submits the site without a project", async () => {
  const loc = makeLoc();
  renderNav("sites", loc);
  fireEvent.click(screen.getByRole("button", { name: "Add site" }));
  expect(screen.queryByText("Project", { selector: "label" })).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Domain or URL"), { target: { value: "https://new.example.org/x" } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() =>
    expect(loc.handleCreateSite).toHaveBeenCalledWith({
      domain: "new.example.org",
      name: "",
      status: "Active",
      languages: [],
    })
  );
});

test("add-site modal supports multi-select of languages from the catalog", async () => {
  const loc = makeLoc();
  renderNav("sites", loc);
  fireEvent.click(screen.getByRole("button", { name: "Add site" }));
  fireEvent.change(screen.getByLabelText("Domain or URL"), { target: { value: "https://new.example.org" } });
  fireEvent.click(screen.getByLabelText("Hindi (hi)"));
  fireEvent.click(screen.getByLabelText("Bengali (bn)"));
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() =>
    expect(loc.handleCreateSite).toHaveBeenCalledWith({
      domain: "new.example.org",
      name: "",
      status: "Active",
      languages: [
        { code: "hi", enabled: true },
        { code: "bn", enabled: true },
      ],
    })
  );
});

test("sites table has no Project column", () => {
  renderNav("sites", makeLoc());
  expect(screen.queryByRole("columnheader", { name: "Project" })).not.toBeInTheDocument();
});

test("a failed add-site shows the backend message", async () => {
  const loc = makeLoc();
  loc.handleCreateSite.mockRejectedValue(new Error("Website with domain 'new.example.org' already exists"));
  renderNav("sites", loc);
  fireEvent.click(screen.getByRole("button", { name: "Add site" }));
  fireEvent.change(screen.getByLabelText("Domain or URL"), { target: { value: "https://new.example.org" } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await screen.findByText("Website with domain 'new.example.org' already exists");
});

test("editing a site updates name/domain/status", async () => {
  const loc = makeLoc();
  renderNav("sites", loc);
  fireEvent.click(screen.getByRole("button", { name: "Edit" }));
  fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Renamed" } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() =>
    expect(loc.handleUpdateSite).toHaveBeenCalledWith("s1", {
      name: "Renamed",
      domain: "a.com",
      status: "Active",
      languages: [{ code: "hi", enabled: true }],
    })
  );
});

test("editing a site preserves already-checked languages and allows unchecking", async () => {
  const loc = makeLoc();
  renderNav("sites", loc);
  fireEvent.click(screen.getByRole("button", { name: "Edit" }));
  expect(screen.getByLabelText("Hindi (hi)")).toBeChecked();
  expect(screen.getByLabelText("Bengali (bn)")).not.toBeChecked();
  fireEvent.click(screen.getByLabelText("Hindi (hi)"));
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() =>
    expect(loc.handleUpdateSite).toHaveBeenCalledWith("s1", {
      name: "Home",
      domain: "a.com",
      status: "Active",
      languages: [],
    })
  );
});
