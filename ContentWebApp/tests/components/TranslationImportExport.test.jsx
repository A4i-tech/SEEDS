import React from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider } from "../../src/components/AllContent/LocalizationTab/Toast";
import { WorkspaceScreen } from "../../src/components/AllContent/LocalizationTab/Workspace.js";
import { translationService } from "../../src/services/translationService";

jest.mock("../../src/services/translationService", () => ({
  translationService: {
    listTranslations: jest.fn(),
    listForReview: jest.fn(),
    approveTranslation: jest.fn(),
    bulkApproveTranslations: jest.fn(),
    rejectTranslation: jest.fn(),
    updateTranslation: jest.fn(),
    importTranslations: jest.fn(),
  },
}));

jest.mock("../../src/components/AllContent/shared/MiddleEllipsis", () => ({
  __esModule: true,
  default: ({ text }) => require("react").createElement("span", null, text),
}));

const downloads = [];
let anchorClick;

beforeAll(() => {
  Object.defineProperty(window.HTMLElement.prototype, "clientWidth", {
    configurable: true,
    value: 150,
  });
  window.HTMLCanvasElement.prototype.getContext = () => ({
    measureText: (text) => ({ width: text.length }),
  });
  window.ResizeObserver =
    window.ResizeObserver ||
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
});

beforeEach(() => {
  downloads.length = 0;
  window.URL.createObjectURL = jest.fn((blob) => `blob:${downloads.push({ blob }) - 1}`);
  window.URL.revokeObjectURL = jest.fn();
  anchorClick = jest
    .spyOn(HTMLAnchorElement.prototype, "click")
    .mockImplementation(function click() {
      downloads[downloads.length - 1].filename = this.download;
    });
});

afterEach(() => {
  anchorClick.mockRestore();
  jest.resetAllMocks();
});

const languages = [
  { id: "kn", code: "kn", name: "Kannada" },
  { id: "te", code: "te", name: "Telugu" },
];
const sites = [{ id: "s1", siteId: "site-1", name: "example.com", domain: "example.com" }];

const makeDoc = (key, route, sourceText, kn) => ({
  id: `id-${route}-${key}`,
  key,
  route,
  sourceText,
  translations: kn ? { kn: { text: kn, status: "pending" } } : {},
});

const docs = [
  makeDoc("k1", "/", "Welcome, friend", "ಸ್ವಾಗತ, ಸ್ನೇಹಿತ"),
  makeDoc("k2", "/", 'Say "hi" now', 'ಹೇ "ಹಾಯ್" ಈಗ'),
  makeDoc("k3", "/about", "Line one\nLine two", "ಸಾಲು ೧\nಸಾಲು ೨"),
  makeDoc("k4", "/about", "Untranslated one"),
];

const utf8 = (bytes) => Buffer.from(bytes).toString("utf8");

const readBlob = (blob) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result));
    reader.onerror = reject;
    reader.readAsArrayBuffer(blob);
  });

function renderWorkspace(
  scope = { siteId: "site-1", route: "/about", lang: "kn" },
  onDataChanged = jest.fn()
) {
  return render(
    <ToastProvider>
      <WorkspaceScreen
        scope={scope}
        languages={languages}
        sites={sites}
        onScope={jest.fn()}
        pages={[{ route: "/" }, { route: "/about" }]}
        onDataChanged={onDataChanged}
      />
    </ToastProvider>
  );
}

const csvFile = (content, name = "translations.csv") =>
  new File([content], name, { type: "text/csv" });

async function openImportDialog() {
  await userEvent.click(screen.getByRole("button", { name: "Import" }));
  return screen.getByRole("dialog", { name: "Import translations" });
}

const HEADER = '"Asset ID","Route","English, en","Kannada, kn"';
const ROW = '"k1","/","Hello","ಹಲೋ"';
const importOk = {
  updated: 1,
  created: 0,
  unchanged: 0,
  skipped_blank: 0,
  failed: 0,
  errors: [],
};
const failedWith = (...errors) => ({ ...importOk, updated: 0, failed: errors.length, errors });
const SUMMARY_OK = "Updated 1, created 0, unchanged 0, skipped blank 0, failed 0";
const importButton = (dialog) => within(dialog).getByRole("button", { name: "Import" });
const clickImport = (dialog) => userEvent.click(importButton(dialog));

async function openWithFile(content, file = csvFile(content)) {
  translationService.listForReview.mockResolvedValue(docs);
  renderWorkspace();
  await screen.findByText("Untranslated one");
  const dialog = await openImportDialog();
  await userEvent.upload(within(dialog).getByLabelText("CSV file"), file);
  return dialog;
}

async function exportedText(scope, pageDocs = docs) {
  translationService.listForReview.mockResolvedValue(pageDocs);
  translationService.listTranslations.mockImplementation(async ({ route }) =>
    pageDocs.filter((d) => d.route === route)
  );
  renderWorkspace(scope);
  await waitFor(() => expect(translationService.listForReview).toHaveBeenCalled());
  await userEvent.click(screen.getByRole("button", { name: "Export" }));
  await waitFor(() => expect(downloads).toHaveLength(1));
  return (await readBlob(downloads[0].blob)).slice(3);
}

describe("Export", () => {
  test("downloads every route of the site for the selected language as UTF-8 with BOM", async () => {
    const bytes = await exportedText();
    const text = utf8(bytes);

    expect(translationService.listTranslations).toHaveBeenCalledWith({
      siteId: "site-1",
      route: "/",
    });
    expect(translationService.listTranslations).toHaveBeenCalledWith({
      siteId: "site-1",
      route: "/about",
    });
    expect(downloads[0].filename).toBe("example-com-kn.csv");
    expect([...(await readBlob(downloads[0].blob)).slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(text.split("\r\n")[0]).toBe(HEADER);
    expect(text).toContain('"k1","/","Welcome, friend","ಸ್ವಾಗತ, ಸ್ನೇಹಿತ"');
    expect(text).toContain('"k2","/","Say ""hi"" now","ಹೇ ""ಹಾಯ್"" ಈಗ"');
    expect(text).toContain('"k3","/about","Line one\nLine two","ಸಾಲು ೧\nಸಾಲು ೨"');
    expect(text).toContain('"k4","/about","Untranslated one",""');
    await screen.findByText("Exported 4 rows");
  });

  test("exports the selected language column, not another one", async () => {
    const teDocs = [
      {
        ...makeDoc("k1", "/", "Hello"),
        translations: { kn: { text: "ಹಲೋ" }, te: { text: "హలో" } },
      },
    ];

    const text = utf8(await exportedText({ siteId: "site-1", route: "/", lang: "te" }, teDocs));

    expect(text.split("\r\n")[0]).toBe('"Asset ID","Route","English, en","Telugu, te"');
    expect(text).toContain('"k1","/","Hello","హలో"');
    expect(text).not.toContain("ಹಲೋ");
  });

  test("formula-like text is neutralised in the downloaded file", async () => {
    const formulaDocs = [
      makeDoc("k1", "/", '=HYPERLINK("http://evil.example","click")', "-5% ಆಫರ್"),
    ];

    const text = utf8(await exportedText(undefined, formulaDocs));

    expect(text).toContain(
      '"k1","/","\'=HYPERLINK(""http://evil.example"",""click"")","\'-5% ಆಫರ್"'
    );
  });

  test("a site with nothing to export shows a message and downloads nothing", async () => {
    translationService.listForReview.mockResolvedValue([]);
    translationService.listTranslations.mockResolvedValue([]);
    renderWorkspace();
    await waitFor(() => expect(translationService.listForReview).toHaveBeenCalled());

    await userEvent.click(screen.getByRole("button", { name: "Export" }));

    await screen.findByText("Nothing to export");
    expect(downloads).toHaveLength(0);
  });

  test("an export failure is shown, not swallowed", async () => {
    translationService.listForReview.mockResolvedValue(docs);
    translationService.listTranslations.mockRejectedValue(new Error("List failed"));
    renderWorkspace();
    await screen.findByText("Untranslated one");

    await userEvent.click(screen.getByRole("button", { name: "Export" }));

    await screen.findByText("List failed");
    expect(downloads).toHaveLength(0);
  });
});

describe("Import dialog", () => {
  beforeEach(() => {
    translationService.listForReview.mockResolvedValue(docs);
  });

  test("defaults to the workspace language, overwrite blank OFF and pending review, with accessible names", async () => {
    renderWorkspace();
    await screen.findByText("Untranslated one");

    const dialog = await openImportDialog();

    expect(within(dialog).getByLabelText("Target language")).toHaveTextContent("Kannada (kn)");
    expect(within(dialog).getByLabelText("Overwrite blank values")).not.toBeChecked();
    const group = within(dialog).getByRole("group", { name: "Imported translations are" });
    expect(within(group).getAllByRole("radio")).toHaveLength(3);
    expect(within(group).getByLabelText("Pending review")).toBeChecked();
    expect(importButton(dialog)).toBeDisabled();
  });

  test("imports the parsed rows with the chosen options, shows the summary and errors, and reloads the list", async () => {
    const onDataChanged = jest.fn();
    translationService.importTranslations.mockResolvedValue({
      ...failedWith({ row: 3, route: "/new", key: "tbad", reason: "key_mismatch" }),
      updated: 1,
      created: 1,
    });
    const docsAfterImport = docs.map((d) =>
      d.key === "k4"
        ? { ...d, translations: { kn: { text: "ಹೊಸ ಅನುವಾದ", status: "approved" } } }
        : d
    );
    translationService.listForReview.mockResolvedValueOnce(docs).mockResolvedValue(docsAfterImport);
    renderWorkspace(undefined, onDataChanged);
    await screen.findByText("Untranslated one");
    const dialog = await openImportDialog();
    const csv =
      `\uFEFF${HEADER}\r\n` +
      '"k1","/","Welcome, friend","ಹೊಸ, ಅನುವಾದ"\r\n' +
      '"k5","/new","Brand ""new""","ಹೊಸ\nಸಾಲು"\r\n' +
      '"tbad","/new","Other",""\r\n';

    await userEvent.upload(within(dialog).getByLabelText("CSV file"), csvFile(csv));
    await within(dialog).findByText(/3 rows, language column: kn/);
    await userEvent.click(within(dialog).getByLabelText("Overwrite blank values"));
    await userEvent.click(within(dialog).getByLabelText("Approved"));
    await clickImport(dialog);

    await within(dialog).findByText("Updated 1, created 1, unchanged 0, skipped blank 0, failed 1");
    expect(translationService.importTranslations).toHaveBeenCalledWith({
      siteId: "site-1",
      lang: "kn",
      overwriteBlank: true,
      state: "approved",
      rows: [
        { row: 2, route: "/", key: "k1", source: "Welcome, friend", text: "ಹೊಸ, ಅನುವಾದ" },
        { row: 3, route: "/new", key: "k5", source: 'Brand "new"', text: "ಹೊಸ\nಸಾಲು" },
        { row: 4, route: "/new", key: "tbad", source: "Other", text: "" },
      ],
    });
    expect(within(dialog).getByText("tbad")).toBeInTheDocument();
    expect(within(dialog).getByText("Asset ID does not match the source text")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Close" })).toBeInTheDocument();
    expect(onDataChanged).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(screen.getByLabelText("Translation for: Untranslated one")).toHaveValue("ಹೊಸ ಅನುವಾದ")
    );
  });

  test.each([
    [
      "a conflicting language column",
      '"Asset ID","Route","English, en","Telugu, te"\n"k1","/","Hello","హలో"\n',
      /column is for "te" but kn is selected/,
    ],
    [
      "a file that is not a translations CSV",
      "key,source,translation\nk1,Hello,ಹಲೋ\n",
      /No "Asset ID" header row was found/,
    ],
    ["an empty CSV", `${HEADER}\n`, /0 rows/],
    [
      "a CSV over the row limit",
      `${HEADER}\n${Array.from({ length: 5001 }, (_, i) => `"k${i}","/","S${i}","T${i}"`).join("\n")}\n`,
      /more than 5000 rows/,
    ],
    [
      "question-mark-only translations",
      `${HEADER}\n"k1","/","Hello","?????"\n"k2","/","Bye","ಬೈ"\n`,
      /1 translation contains only "\?" characters/,
    ],
    [
      "a malformed CSV",
      `${HEADER}\n${ROW}\n"k2","/","Unclosed,ಹಲೋ\n"k3","/","After",""\n`,
      /could not be parsed.*\(row 3\)/,
    ],
  ])("blocks %s before any write", async (_, content, message) => {
    const dialog = await openWithFile(content);
    await userEvent.click(within(dialog).getByLabelText("Overwrite blank values"));

    await within(dialog).findByText(message);
    expect(importButton(dialog)).toBeDisabled();
    expect(translationService.importTranslations).not.toHaveBeenCalled();
  });

  test("a file with replacement characters is blocked with CSV UTF-8 instructions", async () => {
    const head = Buffer.from(`${HEADER}\n"k1","/","Hello","`, "utf8");
    const bytes = new Uint8Array([...head, 0xff, 0xfe, 0x22, 0x0a]);

    const dialog = await openWithFile(null, new File([bytes], "ansi.csv", { type: "text/csv" }));

    await within(dialog).findByText(/CSV UTF-8/);
    expect(importButton(dialog)).toBeDisabled();
    expect(translationService.importTranslations).not.toHaveBeenCalled();
  });

  test("switching the dialog language to the CSV's language unblocks the import", async () => {
    const dialog = await openWithFile(
      '"Asset ID","Route","English, en","Telugu, te"\n"k1","/","Hello","హలో"\n'
    );
    await within(dialog).findByText(/column is for "te"/);

    await userEvent.click(within(dialog).getByRole("button", { name: /Target language/ }));
    await userEvent.click(within(dialog).getByRole("option", { name: "Telugu (te)" }));

    expect(within(dialog).queryByText(/column is for "te"/)).not.toBeInTheDocument();
    expect(importButton(dialog)).toBeEnabled();
  });

  test("a target column without a locale code imports with a warning", async () => {
    translationService.importTranslations.mockResolvedValue(importOk);
    const dialog = await openWithFile(`"Asset ID","Route","English, en","Translation"\n${ROW}\n`);

    await within(dialog).findByText(/has no language code/);
    await clickImport(dialog);

    await within(dialog).findByText(SUMMARY_OK);
  });

  test("a legitimate translation that ends with a question mark is still importable", async () => {
    const dialog = await openWithFile(`${HEADER}\n"k1","/","What?","ಏಕೆ?"\n`);

    await within(dialog).findByText(/1 rows/);
    expect(importButton(dialog)).toBeEnabled();
  });

  test("formula-protected cells are sent to the backend with their original values", async () => {
    translationService.importTranslations.mockResolvedValue(importOk);
    const dialog = await openWithFile(
      `${HEADER}\n"'=cmd","/","'=SUM(1+1)","'+91 ಹಲೋ"\n"k2","/","normal","'quoted' word"\n`
    );
    await within(dialog).findByText(/2 rows/);

    await clickImport(dialog);

    await waitFor(() => expect(translationService.importTranslations).toHaveBeenCalled());
    expect(translationService.importTranslations.mock.calls[0][0].rows).toEqual([
      { row: 2, route: "/", key: "=cmd", source: "=SUM(1+1)", text: "+91 ಹಲೋ" },
      { row: 3, route: "/", key: "k2", source: "normal", text: "'quoted' word" },
    ]);
  });

  test("the CSV row numbers are sent so errors point at the right spreadsheet row", async () => {
    translationService.importTranslations.mockResolvedValue(importOk);
    const dialog = await openWithFile(`${HEADER}\n\n${ROW}\n`);
    await within(dialog).findByText(/1 rows/);

    await clickImport(dialog);

    await waitFor(() => expect(translationService.importTranslations).toHaveBeenCalled());
    expect(translationService.importTranslations.mock.calls[0][0].rows[0].row).toBe(3);
  });

  test("a failed import request is shown, keeps Import available and still reloads the list", async () => {
    translationService.importTranslations.mockRejectedValue(new Error("Gateway timeout"));
    const dialog = await openWithFile(`${HEADER}\n${ROW}\n`);
    await within(dialog).findByText(/1 rows/);
    translationService.listForReview.mockClear();

    await clickImport(dialog);

    await within(dialog).findByText(/Gateway timeout/);
    expect(within(dialog).queryByText(/Updated/)).not.toBeInTheDocument();
    expect(importButton(dialog)).toBeEnabled();
    await waitFor(() => expect(translationService.listForReview).toHaveBeenCalled());
  });

  test("a partial import reloads the list and keeps the row errors visible", async () => {
    translationService.importTranslations.mockResolvedValue(
      failedWith({ row: 5, route: "/x", key: "tbad", reason: "key_mismatch" })
    );
    const dialog = await openWithFile(`${HEADER}\n${ROW}\n`);
    await within(dialog).findByText(/1 rows/);
    translationService.listForReview.mockClear();

    await clickImport(dialog);

    await within(dialog).findByText("Asset ID does not match the source text");
    expect(translationService.listForReview).toHaveBeenCalled();
  });

  test("error cells keep their full text in a tooltip and show the route, key and row", async () => {
    translationService.importTranslations.mockResolvedValue(
      failedWith({ row: 9, route: "/faq?page=2", key: "tbad", reason: "key_mismatch" })
    );
    const dialog = await openWithFile(`${HEADER}\n${ROW}\n`);
    await within(dialog).findByText(/1 rows/);

    await clickImport(dialog);

    expect(await within(dialog).findByText("Asset ID does not match the source text")).toHaveAttribute(
      "title",
      "Asset ID does not match the source text"
    );
    expect(within(dialog).getByText("/faq?page=2")).toHaveAttribute("title", "/faq?page=2");
    const errorRow = within(dialog).getByRole("row", { name: /\/faq\?page=2/ });
    expect(within(errorRow).getByText("9")).toBeInTheDocument();
  });

  test("the dialog cannot be closed while an import is running", async () => {
    let resolveImport;
    translationService.importTranslations.mockReturnValue(
      new Promise((resolve) => {
        resolveImport = resolve;
      })
    );
    const dialog = await openWithFile(`${HEADER}\n${ROW}\n`);
    await within(dialog).findByText(/1 rows/);

    await clickImport(dialog);
    await within(dialog).findByRole("button", { name: "Importing…" });

    expect(within(dialog).getByRole("button", { name: "Cancel" })).toBeDisabled();
    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await userEvent.click(within(dialog).getByRole("button", { name: "\u2715" }));
    expect(screen.getByRole("dialog", { name: "Import translations" })).toBeInTheDocument();

    resolveImport(importOk);
    await userEvent.click(await within(dialog).findByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog", { name: "Import translations" })).not.toBeInTheDocument();
  });

  test("the result region receives focus once the import completes", async () => {
    translationService.importTranslations.mockResolvedValue(importOk);
    const dialog = await openWithFile(`${HEADER}\n${ROW}\n`);
    await within(dialog).findByText(/1 rows/);

    await clickImport(dialog);

    const status = await within(dialog).findByRole("status");
    await waitFor(() => expect(status).toHaveFocus());
  });

  test("Import and Export are unavailable until a site is selected", () => {
    translationService.listForReview.mockResolvedValue([]);
    renderWorkspace({ siteId: "", route: "", lang: "kn" });

    expect(screen.getByRole("button", { name: "Import" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Export" })).toBeDisabled();
  });
});

describe("Import dialog layout on short viewports", () => {
  async function importWithErrors(count) {
    translationService.importTranslations.mockResolvedValue(
      failedWith(
        ...Array.from({ length: count }, (_, i) => ({
          row: i + 1,
          route: `/page-${i}`,
          key: `tkey${i}`,
          reason: "key_mismatch",
        }))
      )
    );
    const dialog = await openWithFile(`${HEADER}\n${ROW}\n`);
    await within(dialog).findByText(/1 rows/);
    await clickImport(dialog);
    await within(dialog).findByRole("button", { name: "Close" });
    return dialog;
  }

  test("fields live in the scroll area while the header close and footer buttons stay outside it", async () => {
    const dialog = await importWithErrors(1);
    const scroll = within(dialog).getByTestId("import-dialog-scroll");

    expect(scroll).toContainElement(within(dialog).getByLabelText("CSV file"));
    expect(scroll).toContainElement(within(dialog).getByText(/Updated 0, created 0/));
    expect(scroll).not.toContainElement(within(dialog).getByRole("button", { name: "Close" }));
    expect(scroll).not.toContainElement(within(dialog).getByRole("button", { name: "\u2715" }));
  });

  test("the footer is outside the scroll area before a result too", async () => {
    translationService.listForReview.mockResolvedValue(docs);
    renderWorkspace();
    await screen.findByText("Untranslated one");
    const dialog = await openImportDialog();
    const scroll = within(dialog).getByTestId("import-dialog-scroll");

    expect(scroll).not.toContainElement(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(scroll).not.toContainElement(importButton(dialog));
  });

  test("a long error list is capped at 100 rows inside its own scroll container", async () => {
    const dialog = await importWithErrors(150);
    const errors = within(dialog).getByTestId("import-dialog-errors");

    expect(within(dialog).getByTestId("import-dialog-scroll")).toContainElement(errors);
    expect(within(errors).getAllByRole("row")).toHaveLength(101);
    expect(within(errors).getByText("and 50 more")).toBeInTheDocument();
  });
});
