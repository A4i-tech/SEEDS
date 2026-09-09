import React from "react";
import { render, screen, within, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TooltipProvider, ToastProvider } from "../src/localization-ui/primitives";
import WorkspaceScreen from "../src/localization-ui/screens/Workspace.jsx";

jest.mock("../src/services/translationService", () => ({
  translationService: {
    listTranslations: jest.fn(),
    generateForReview: jest.fn(),
    approveTranslation: jest.fn(),
    rejectTranslation: jest.fn(),
    updateTranslation: jest.fn(),
  },
}));
import { translationService } from "../src/services/translationService";

beforeAll(() => {
  window.HTMLElement.prototype.hasPointerCapture = jest.fn().mockReturnValue(false);
  window.HTMLElement.prototype.setPointerCapture = jest.fn();
  window.HTMLElement.prototype.releasePointerCapture = jest.fn();
  window.HTMLElement.prototype.scrollIntoView = jest.fn();
  if (!window.PointerEvent) {
    window.PointerEvent = window.MouseEvent;
  }
});

const langs = [
  { id: "en", code: "en", name: "English" },
  { id: "kn", code: "kn", name: "Kannada" },
];
const sites = [{ id: "s1", siteId: "site-1", name: "example.com", domain: "example.com" }];

function makeDoc(key, sourceText, { translated, status } = {}) {
  return {
    id: key,
    _id: key,
    key,
    route: "/",
    sourceText,
    translations: translated ? { kn: { text: translated, status: status || "pending" } } : {},
    status,
  };
}

function renderWorkspace(scope) {
  const onScope = jest.fn((updater) => {
    const next = typeof updater === "function" ? updater(scope) : updater;
    Object.assign(scope, next);
  });
  const utils = render(
    <TooltipProvider>
      <ToastProvider>
        <WorkspaceScreen scope={scope} languages={langs} sites={sites} onScope={onScope} pages={[{ route: "/" }]} />
      </ToastProvider>
    </TooltipProvider>
  );
  return { ...utils, onScope };
}

describe("Translate & Review — live component verification", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.assign(navigator, { clipboard: { writeText: jest.fn().mockResolvedValue() } });
  });

  test("PASS — Search filters rows by source/translation text, calls listTranslations", async () => {
    translationService.listTranslations.mockResolvedValue([
      makeDoc("k1", "Hello World", { translated: "ಹಲೋ ವರ್ಲ್ಡ್", status: "approved" }),
      makeDoc("k2", "Good Morning", { translated: "ಶುಭೋದಯ" }),
    ]);
    renderWorkspace({ siteId: "site-1", route: "/", lang: "kn" });
    await waitFor(() => expect(translationService.listTranslations).toHaveBeenCalledWith({ siteId: "site-1", route: "/" }));
    await screen.findByText("Hello World");
    expect(screen.getByText("Good Morning")).toBeInTheDocument();

    const search = screen.getByPlaceholderText(/Search source or translated text/i);
    await userEvent.type(search, "Morning");

    expect(screen.queryByText("Hello World")).not.toBeInTheDocument();
    expect(screen.getByText("Good Morning")).toBeInTheDocument();
  });

  test("PASS — Language filter switches Review Language and reloads translations for new lang", async () => {
    translationService.listTranslations.mockResolvedValue([
      makeDoc("k1", "Hello World", { translated: "ಹಲೋ ವರ್ಲ್ಡ್", status: "approved" }),
    ]);
    const scope = { siteId: "site-1", route: "/", lang: "kn" };
    renderWorkspace(scope);
    await screen.findByText("Hello World");

    const langBtn = screen.getByRole("button", { name: /Kannada/i });
    await userEvent.click(langBtn);
    const enOption = await screen.findByText("English");
    await userEvent.click(enOption);

    expect(scope.lang).toBe("en");
  });

  test("PASS — Pagination slices rows per page and page buttons switch pages", async () => {
    const docs = Array.from({ length: 15 }, (_, i) => makeDoc(`k${i}`, `Source ${i}`, { translated: `T${i}` }));
    translationService.listTranslations.mockResolvedValue(docs);
    renderWorkspace({ siteId: "site-1", route: "/", lang: "kn" });
    await screen.findByText("Source 0");

    expect(screen.getByText("Source 9")).toBeInTheDocument();
    expect(screen.queryByText("Source 10")).not.toBeInTheDocument();
    expect(screen.getByText(/Showing 1 to 10 of 15/)).toBeInTheDocument();

    const page2 = screen.getByRole("button", { name: "2" });
    await userEvent.click(page2);
    expect(screen.getByText("Source 10")).toBeInTheDocument();
    expect(screen.queryByText("Source 0")).not.toBeInTheDocument();
  });

  test("PASS — Copy translation writes translated text to clipboard", async () => {
    translationService.listTranslations.mockResolvedValue([
      makeDoc("k1", "Hello World", { translated: "ಹಲೋ ವರ್ಲ್ಡ್" }),
    ]);
    renderWorkspace({ siteId: "site-1", route: "/", lang: "kn" });
    await screen.findByText("Hello World");

    const copyBtn = screen.getByLabelText("Copy translation");
    await userEvent.click(copyBtn);
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("ಹಲೋ ವರ್ಲ್ಡ್");
  });

  test("PASS — Individual Approve calls approveTranslation and flips row to Approved", async () => {
    translationService.listTranslations.mockResolvedValue([
      makeDoc("k1", "Hello World", { translated: "ಹಲೋ ವರ್ಲ್ಡ್" }),
    ]);
    translationService.approveTranslation.mockResolvedValue({});
    renderWorkspace({ siteId: "site-1", route: "/", lang: "kn" });
    await screen.findByText("Hello World");

    expect(document.querySelector(".tr-badge.warn")).toBeInTheDocument();
    const approveBtn = screen.getByRole("button", { name: "Approve" });
    await userEvent.click(approveBtn);

    expect(translationService.approveTranslation).toHaveBeenCalledWith("k1", "kn");
    await waitFor(() => expect(document.querySelector(".tr-badge.good")).toBeInTheDocument());
  });

  test("PASS — Reject calls rejectTranslation and flips row to Rejected", async () => {
    translationService.listTranslations.mockResolvedValue([
      makeDoc("k1", "Hello World", { translated: "ಹಲೋ ವರ್ಲ್ಡ್" }),
    ]);
    translationService.rejectTranslation.mockResolvedValue({});
    renderWorkspace({ siteId: "site-1", route: "/", lang: "kn" });
    await screen.findByText("Hello World");

    const rejectBtn = screen.getByRole("button", { name: "Reject" });
    await userEvent.click(rejectBtn);

    expect(translationService.rejectTranslation).toHaveBeenCalledWith("k1", "kn", "needs work");
    await waitFor(() => expect(document.querySelector(".tr-badge.crit")).toBeInTheDocument());
  });

  test("PASS — Approve All approves every non-approved row in current scope", async () => {
    translationService.listTranslations.mockResolvedValue([
      makeDoc("k1", "Hello World", { translated: "ಹಲೋ ವರ್ಲ್ಡ್" }),
      makeDoc("k2", "Good Morning", { translated: "ಶುಭೋದಯ" }),
      makeDoc("k3", "Already Approved", { translated: "X", status: "approved" }),
    ]);
    translationService.approveTranslation.mockResolvedValue({});
    renderWorkspace({ siteId: "site-1", route: "/", lang: "kn" });
    await screen.findByText("Hello World");

    const approveAllBtn = screen.getByRole("button", { name: /Approve all/i });
    await userEvent.click(approveAllBtn);

    await waitFor(() => expect(translationService.approveTranslation).toHaveBeenCalledTimes(2));
    expect(translationService.approveTranslation).toHaveBeenCalledWith("k1", "kn");
    expect(translationService.approveTranslation).toHaveBeenCalledWith("k2", "kn");
    expect(translationService.approveTranslation).not.toHaveBeenCalledWith("k3", "kn");
  });

  test("PASS — Edit translation commits on blur via updateTranslation", async () => {
    translationService.listTranslations.mockResolvedValue([
      makeDoc("k1", "Hello World", { translated: "ಹಲೋ ವರ್ಲ್ಡ್" }),
    ]);
    translationService.updateTranslation.mockResolvedValue({ translations: { kn: { text: "Edited text" } }, status: "" });
    renderWorkspace({ siteId: "site-1", route: "/", lang: "kn" });
    await screen.findByText("Hello World");

    const textarea = screen.getByLabelText("Translation for: Hello World");
    fireEvent.change(textarea, { target: { value: "Edited text" } });
    fireEvent.blur(textarea);

    await waitFor(() => expect(translationService.updateTranslation).toHaveBeenCalledWith("k1", "kn", "Edited text"));
  });

  test("PASS — Save changes button shows saved confirmation (autosave already committed the edit on blur)", async () => {
    translationService.listTranslations.mockResolvedValue([
      makeDoc("k1", "Hello World", { translated: "ಹಲೋ ವರ್ಲ್ಡ್" }),
    ]);
    renderWorkspace({ siteId: "site-1", route: "/", lang: "kn" });
    await screen.findByText("Hello World");

    expect(screen.getByText("All changes auto-saved")).toBeInTheDocument();
    const saveBtn = screen.getByRole("button", { name: "Save changes" });
    await userEvent.click(saveBtn);
    expect(screen.getByText(/Last saved/)).toBeInTheDocument();
  });

  test("PASS — Revert All discards an unsaved (unblurred) edit and reloads from backend", async () => {
    translationService.listTranslations.mockResolvedValue([
      makeDoc("k1", "Hello World", { translated: "ಹಲೋ ವರ್ಲ್ಡ್" }),
    ]);
    renderWorkspace({ siteId: "site-1", route: "/", lang: "kn" });
    await screen.findByText("Hello World");

    const textarea = screen.getByLabelText("Translation for: Hello World");
    fireEvent.change(textarea, { target: { value: "Unsaved garbage text" } });
    expect(textarea.value).toBe("Unsaved garbage text");
    expect(translationService.updateTranslation).not.toHaveBeenCalled();

    const revertBtn = screen.getByRole("button", { name: /Revert all/i });
    await userEvent.click(revertBtn);

    await waitFor(() => expect(translationService.listTranslations).toHaveBeenCalledTimes(2));
    await waitFor(() => {
      const el = screen.getByLabelText("Translation for: Hello World");
      expect(el.value).toBe("ಹಲೋ ವರ್ಲ್ಡ್");
    });
  });

  test("PASS — Revert All leaves an already-approved row's status unchanged", async () => {
    translationService.listTranslations.mockResolvedValue([
      makeDoc("k1", "Hello World", { translated: "ಹಲೋ ವರ್ಲ್ಡ್", status: "approved" }),
    ]);
    renderWorkspace({ siteId: "site-1", route: "/", lang: "kn" });
    await screen.findByText("Hello World");
    expect(document.querySelector(".tr-badge.good")).toBeInTheDocument();

    const revertBtn = screen.getByRole("button", { name: /Revert all/i });
    await userEvent.click(revertBtn);

    await waitFor(() => expect(translationService.listTranslations).toHaveBeenCalledTimes(2));
    expect(document.querySelector(".tr-badge.good")).toBeInTheDocument();
  });

  test("PASS — a genuinely empty successful response shows the empty state, not an error", async () => {
    translationService.listTranslations.mockResolvedValue([]);
    renderWorkspace({ siteId: "site-1", route: "/", lang: "kn" });

    await screen.findByText("This page hasn't been translated yet.");
    expect(screen.queryByText("Permission denied")).not.toBeInTheDocument();
    expect(screen.queryByText("Couldn't load translations")).not.toBeInTheDocument();
  });

  test("PASS — a 403 from /translations/list shows a permission error, not a fake empty list", async () => {
    translationService.listTranslations.mockRejectedValue({ status: 403, message: "Forbidden" });
    renderWorkspace({ siteId: "site-1", route: "/", lang: "kn" });

    await screen.findByText("Permission denied");
    expect(screen.getByText("Your account doesn't have access to Translate & Review.")).toBeInTheDocument();
    expect(screen.queryByText("This page hasn't been translated yet.")).not.toBeInTheDocument();
    expect(translationService.generateForReview).not.toHaveBeenCalled();
  });

  test("PASS — a non-403 failure shows a distinct load error, not a fake empty list", async () => {
    translationService.listTranslations.mockRejectedValue({ message: "Network error" });
    renderWorkspace({ siteId: "site-1", route: "/", lang: "kn" });

    await screen.findByText("Couldn't load translations");
    expect(screen.getByText("Network error")).toBeInTheDocument();
    expect(screen.queryByText("Permission denied")).not.toBeInTheDocument();
  });
});
