import React from "react";
import { render, screen, within, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider } from "../../src/components/AllContent/LocalizationTab/Toast";
import { WorkspaceScreen } from "../../src/components/AllContent/LocalizationTab/Workspace.js";

jest.mock("../../src/services/translationService", () => ({
  translationService: {
    listTranslations: jest.fn(),
    generateForReview: jest.fn(),
    approveTranslation: jest.fn(),
    bulkApproveTranslations: jest.fn(),
    rejectTranslation: jest.fn(),
    updateTranslation: jest.fn(),
  },
}));
import { translationService } from "../../src/services/translationService";

jest.mock("../../src/components/AllContent/shared/MiddleEllipsis", () => ({
  __esModule: true,
  default: ({ text }) => require("react").createElement("span", { "data-testid": "middle-ellipsis" }, text),
}));

beforeAll(() => {
  window.HTMLElement.prototype.hasPointerCapture = jest.fn().mockReturnValue(false);
  window.HTMLElement.prototype.setPointerCapture = jest.fn();
  window.HTMLElement.prototype.releasePointerCapture = jest.fn();
  window.HTMLElement.prototype.scrollIntoView = jest.fn();
  if (!window.PointerEvent) {
    window.PointerEvent = window.MouseEvent;
  }
  // jsdom has no layout engine (clientWidth is always 0) and no canvas 2D context.
  // Fake both so useIsTruncated's width comparison is meaningful in tests: a fixed
  // "container width" of 150px against a measured width proportional to text length.
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
    <ToastProvider>
      <WorkspaceScreen scope={scope} languages={langs} sites={sites} onScope={onScope} pages={[{ route: "/" }]} />
    </ToastProvider>
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

    const copyBtn = screen.getByRole("button", { name: "Copy" });
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

    expect(screen.getByText("Pending Review")).toBeInTheDocument();
    const approveBtn = screen.getByRole("button", { name: "Approve" });
    await userEvent.click(approveBtn);

    expect(translationService.approveTranslation).toHaveBeenCalledWith("k1", "kn");
    await waitFor(() => expect(within(screen.getByRole("table")).getByText("Approved")).toBeInTheDocument());
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
    await waitFor(() => expect(within(screen.getByRole("table")).getByText("Rejected")).toBeInTheDocument());
  });

  test("PASS — an already-approved row hides Approve but keeps Reject and Copy", async () => {
    translationService.listTranslations.mockResolvedValue([
      makeDoc("k1", "Hello World", { translated: "ಹಲೋ ವರ್ಲ್ಡ್", status: "approved" }),
    ]);
    renderWorkspace({ siteId: "site-1", route: "/", lang: "kn" });
    await screen.findByText("Hello World");

    const row = within(screen.getByRole("table"));
    expect(row.queryByRole("button", { name: "Approve" })).not.toBeInTheDocument();
    expect(row.getByRole("button", { name: "Reject" })).toBeInTheDocument();
    expect(row.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
    expect(row.getByRole("button", { name: "Copy" })).toBeInTheDocument();
  });

  test("PASS — a rejected row hides Reject but keeps Approve and Copy", async () => {
    translationService.listTranslations.mockResolvedValue([
      makeDoc("k1", "Hello World", { translated: "ಹಲೋ ವರ್ಲ್ಡ್", status: "rejected" }),
    ]);
    renderWorkspace({ siteId: "site-1", route: "/", lang: "kn" });
    await screen.findByText("Hello World");

    const row = within(screen.getByRole("table"));
    expect(row.getByRole("button", { name: "Approve" })).toBeInTheDocument();
    expect(row.queryByRole("button", { name: "Reject" })).not.toBeInTheDocument();
    expect(row.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
    expect(row.getByRole("button", { name: "Copy" })).toBeInTheDocument();
  });

  test("PASS — unfiltered Approve All uses the bulk endpoint, shows its counts and reloads", async () => {
    translationService.listTranslations.mockResolvedValue([
      makeDoc("k1", "Hello World", { translated: "ಹಲೋ ವರ್ಲ್ಡ್" }),
      makeDoc("k2", "Good Morning", { translated: "ಶುಭೋದಯ" }),
      makeDoc("k3", "Already Approved", { translated: "X", status: "approved" }),
    ]);
    translationService.bulkApproveTranslations.mockResolvedValue({ approved: 2, skipped: 1 });
    renderWorkspace({ siteId: "site-1", route: "/", lang: "kn" });
    await screen.findByText("Hello World");
    translationService.listTranslations.mockClear();
    await userEvent.click(screen.getByRole("button", { name: /Approve all/i }));

    await waitFor(() =>
      expect(translationService.bulkApproveTranslations).toHaveBeenCalledWith({ siteId: "site-1", route: "/", lang: "kn" })
    );
    expect(translationService.approveTranslation).not.toHaveBeenCalled();
    expect(await screen.findByText("Approved 2, skipped 1")).toBeInTheDocument();
    await waitFor(() => expect(translationService.listTranslations).toHaveBeenCalled());
  });

  test("PASS — a failed bulk approve surfaces the error", async () => {
    translationService.listTranslations.mockResolvedValue([
      makeDoc("k1", "Hello World", { translated: "ಹಲೋ ವರ್ಲ್ಡ್" }),
      makeDoc("k2", "Good Morning", { translated: "ಶುಭೋದಯ" }),
      makeDoc("k3", "Already Approved", { translated: "X", status: "approved" }),
    ]);
    translationService.bulkApproveTranslations.mockRejectedValue(new Error("bulk boom"));
    renderWorkspace({ siteId: "site-1", route: "/", lang: "kn" });
    await screen.findByText("Hello World");
    await userEvent.click(screen.getByRole("button", { name: /Approve all/i }));

    expect(await screen.findByText("bulk boom")).toBeInTheDocument();
  });

  test("PASS — search-filtered Approve All approves only the visible rows per id", async () => {
    translationService.listTranslations.mockResolvedValue([
      makeDoc("k1", "Hello World", { translated: "ಹಲೋ ವರ್ಲ್ಡ್" }),
      makeDoc("k2", "Good Morning", { translated: "ಶುಭೋದಯ" }),
      makeDoc("k3", "Already Approved", { translated: "X", status: "approved" }),
    ]);
    translationService.approveTranslation.mockResolvedValue({});
    renderWorkspace({ siteId: "site-1", route: "/", lang: "kn" });
    await screen.findByText("Hello World");
    await userEvent.type(screen.getByPlaceholderText(/Search source or translated text/i), "Hello");
    await userEvent.click(screen.getByRole("button", { name: /Approve all/i }));

    await waitFor(() => expect(translationService.approveTranslation).toHaveBeenCalledTimes(1));
    expect(translationService.approveTranslation).toHaveBeenCalledWith("k1", "kn");
    expect(translationService.approveTranslation).not.toHaveBeenCalledWith("k2", "kn");
    expect(translationService.approveTranslation).not.toHaveBeenCalledWith("k3", "kn");
    expect(translationService.bulkApproveTranslations).not.toHaveBeenCalled();
  });

  test("PASS — status-tab-filtered Approve All uses per-id approval, not bulk", async () => {
    translationService.listTranslations.mockResolvedValue([
      makeDoc("k1", "Hello World", { translated: "ಹಲೋ ವರ್ಲ್ಡ್" }),
      makeDoc("k2", "Good Morning", { translated: "ಶುಭೋದಯ" }),
      makeDoc("k3", "Already Approved", { translated: "X", status: "approved" }),
    ]);
    translationService.approveTranslation.mockResolvedValue({});
    renderWorkspace({ siteId: "site-1", route: "/", lang: "kn" });
    await screen.findByText("Hello World");
    await userEvent.click(screen.getByRole("button", { name: /^Pending Review/ }));
    await userEvent.click(screen.getByRole("button", { name: /Approve all/i }));

    await waitFor(() => expect(translationService.approveTranslation).toHaveBeenCalledTimes(2));
    expect(translationService.approveTranslation).toHaveBeenCalledWith("k1", "kn");
    expect(translationService.approveTranslation).toHaveBeenCalledWith("k2", "kn");
    expect(translationService.bulkApproveTranslations).not.toHaveBeenCalled();
  });

  test("PASS — per-id Approve All reports partial failures", async () => {
    translationService.listTranslations.mockResolvedValue([
      makeDoc("k1", "Hello World", { translated: "ಹಲೋ ವರ್ಲ್ಡ್" }),
      makeDoc("k2", "Good Morning", { translated: "ಶುಭೋದಯ" }),
      makeDoc("k3", "Already Approved", { translated: "X", status: "approved" }),
    ]);
    translationService.approveTranslation.mockImplementation(async (id) => {
      if (id === "k2") throw new Error("nope");
      return {};
    });
    renderWorkspace({ siteId: "site-1", route: "/", lang: "kn" });
    await screen.findByText("Hello World");
    await userEvent.type(screen.getByPlaceholderText(/Search source or translated text/i), "o");
    await userEvent.click(screen.getByRole("button", { name: /Approve all/i }));

    expect(await screen.findByText("Approved 1, 1 failed")).toBeInTheDocument();
    expect(translationService.bulkApproveTranslations).not.toHaveBeenCalled();
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

  describe("source text expansion", () => {
    const LONG = "A very long source sentence ".repeat(20).trim();
    const LONG2 = "Another long source sentence ".repeat(20).trim();
    const seed = () =>
      translationService.listTranslations.mockResolvedValue([
        makeDoc("k1", LONG, { translated: "T1" }),
        makeDoc("k2", LONG2, { translated: "T2" }),
      ]);

    test("PASS — collapsed rows render the source through MiddleEllipsis", async () => {
      seed();
      renderWorkspace({ siteId: "site-1", route: "/", lang: "kn" });
      await screen.findAllByTestId("middle-ellipsis");
      const cells = screen.getAllByTestId("middle-ellipsis");
      expect(cells).toHaveLength(2);
      expect(cells[0]).toHaveTextContent(LONG);
      expect(screen.getAllByRole("button", { name: "Show full source text" })).toHaveLength(2);
    });

    test("PASS — a row whose source text fits is never given a Show more toggle", async () => {
      translationService.listTranslations.mockResolvedValue([makeDoc("k1", "Hello World", { translated: "T1" })]);
      renderWorkspace({ siteId: "site-1", route: "/", lang: "kn" });
      await screen.findByText("Hello World");
      expect(screen.queryByRole("button", { name: "Show full source text" })).not.toBeInTheDocument();
    });

    test("PASS — expanding a row shows the full wrapped source and collapsing restores the truncated view", async () => {
      seed();
      renderWorkspace({ siteId: "site-1", route: "/", lang: "kn" });
      await screen.findAllByTestId("middle-ellipsis");

      await userEvent.click(screen.getAllByRole("button", { name: "Show full source text" })[0]);
      const toggle = screen.getByRole("button", { name: "Show less source text" });
      expect(toggle).toHaveAttribute("aria-expanded", "true");
      const full = screen.getByText(LONG);
      expect(full).not.toHaveAttribute("data-testid", "middle-ellipsis");
      expect(full).toHaveStyle({ whiteSpace: "normal", overflowWrap: "anywhere" });
      expect(screen.getAllByTestId("middle-ellipsis")).toHaveLength(1);

      await userEvent.click(toggle);
      expect(screen.getAllByTestId("middle-ellipsis")).toHaveLength(2);
      expect(screen.queryByRole("button", { name: "Show less source text" })).not.toBeInTheDocument();
      expect(screen.getAllByRole("button", { name: "Show full source text" })[0]).toHaveAttribute("aria-expanded", "false");
    });

    test("PASS — expanding one row leaves the other row collapsed", async () => {
      seed();
      renderWorkspace({ siteId: "site-1", route: "/", lang: "kn" });
      await screen.findAllByTestId("middle-ellipsis");

      await userEvent.click(screen.getAllByRole("button", { name: "Show full source text" })[0]);

      const remaining = screen.getByText(LONG2);
      expect(remaining).toHaveAttribute("data-testid", "middle-ellipsis");
      expect(screen.getAllByRole("button", { name: "Show full source text" })).toHaveLength(1);
      expect(screen.getAllByRole("button", { name: "Show less source text" })).toHaveLength(1);
    });
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

  test("PASS — searching never crashes on a segment that has no translation draft yet", async () => {
    translationService.listTranslations.mockResolvedValue([
      makeDoc("k1", "Hello World", { translated: "ಹಲೋ ವರ್ಲ್ಡ್" }),
      makeDoc("k2", "Not drafted yet"),
    ]);
    translationService.generateForReview.mockResolvedValue({});
    renderWorkspace({ siteId: "site-1", route: "/", lang: "kn" });
    await screen.findByText("Not drafted yet");

    await userEvent.type(screen.getByPlaceholderText(/Search source or translated text/i), "zzz");

    expect(screen.getByText("No segments match your search.")).toBeInTheDocument();
  });

  test("PASS — a failed on-demand generation is surfaced to the reviewer, not swallowed", async () => {
    translationService.listTranslations.mockResolvedValue([makeDoc("k1", "Hello World")]);
    translationService.generateForReview.mockRejectedValue(new Error("provider down"));
    renderWorkspace({ siteId: "site-1", route: "/", lang: "kn" });

    await screen.findByText("provider down");
    expect(screen.getByText("Hello World")).toBeInTheDocument();
  });
});
