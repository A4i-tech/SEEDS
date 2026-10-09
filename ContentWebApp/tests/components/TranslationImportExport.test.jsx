import React from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider } from "../../src/components/AllContent/LocalizationTab/Toast";
import { WorkspaceScreen } from "../../src/components/AllContent/LocalizationTab/Workspace.js";
import { translationService } from "../../src/services/translationService";

jest.mock("../../src/services/translationService", () => ({
  translationService: {
    listTranslations: jest.fn(),
    generateForReview: jest.fn(),
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
  translationService.generateForReview.mockResolvedValue({});
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
  makeDoc("k2", "/", "Say \"hi\" now", "ಹೇ \"ಹಾಯ್\" ಈಗ"),
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

function renderWorkspace(scope = { siteId: "site-1", route: "/about", lang: "kn" }, onDataChanged) {
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

const HEADER = "\"Asset ID\",\"Route\",\"English, en\",\"Kannada, kn\"";

describe("Export", () => {
  test("Export downloads every route of the site for the selected language", async () => {
    translationService.listTranslations.mockResolvedValue(docs);
    renderWorkspace();
    await waitFor(() => expect(translationService.listTranslations).toHaveBeenCalled());
    translationService.listTranslations.mockClear();

    await userEvent.click(screen.getByRole("button", { name: "Export" }));

    await waitFor(() => expect(downloads).toHaveLength(1));
    expect(translationService.listTranslations).toHaveBeenCalledWith({ siteId: "site-1" });
    expect(downloads[0].filename).toBe("example-com-kn.csv");
    const bytes = await readBlob(downloads[0].blob);
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const text = utf8(bytes.slice(3));
    expect(text.split("\r\n")[0]).toBe(HEADER);
    expect(text).toContain("\"k1\",\"/\",\"Welcome, friend\",\"ಸ್ವಾಗತ, ಸ್ನೇಹಿತ\"");
    expect(text).toContain("\"k2\",\"/\",\"Say \"\"hi\"\" now\",\"ಹೇ \"\"ಹಾಯ್\"\" ಈಗ\"");
    expect(text).toContain("\"k3\",\"/about\",\"Line one\nLine two\",\"ಸಾಲು ೧\nಸಾಲು ೨\"");
    expect(text).toContain("\"k4\",\"/about\",\"Untranslated one\",\"\"");
    await screen.findByText("Exported 4 rows");
  });

  test("exports the selected language column, not another one", async () => {
    translationService.listTranslations.mockResolvedValue([
      {
        ...makeDoc("k1", "/", "Hello"),
        translations: { kn: { text: "ಹಲೋ" }, te: { text: "హలో" } },
      },
    ]);
    renderWorkspace({ siteId: "site-1", route: "/", lang: "te" });
    await waitFor(() => expect(translationService.listTranslations).toHaveBeenCalled());

    await userEvent.click(screen.getByRole("button", { name: "Export" }));

    await waitFor(() => expect(downloads).toHaveLength(1));
    const text = utf8((await readBlob(downloads[0].blob)).slice(3));
    expect(text.split("\r\n")[0]).toBe("\"Asset ID\",\"Route\",\"English, en\",\"Telugu, te\"");
    expect(text).toContain("\"k1\",\"/\",\"Hello\",\"హలో\"");
    expect(text).not.toContain("ಹಲೋ");
  });

  test("a site with nothing to export shows a message and downloads nothing", async () => {
    translationService.listTranslations.mockResolvedValue([]);
    renderWorkspace();
    await waitFor(() => expect(translationService.listTranslations).toHaveBeenCalled());

    await userEvent.click(screen.getByRole("button", { name: "Export" }));

    await screen.findByText("Nothing to export");
    expect(downloads).toHaveLength(0);
  });

  test("an export failure is shown, not swallowed", async () => {
    translationService.listTranslations
      .mockResolvedValueOnce(docs)
      .mockRejectedValue(new Error("List failed"));
    renderWorkspace();
    await screen.findByText("Untranslated one");

    await userEvent.click(screen.getByRole("button", { name: "Export" }));

    await screen.findByText("List failed");
    expect(downloads).toHaveLength(0);
  });
});

describe("Import dialog", () => {
  beforeEach(() => {
    translationService.listTranslations.mockResolvedValue(docs);
  });

  test("defaults to the workspace language, overwrite blank OFF and pending review", async () => {
    renderWorkspace();
    await screen.findByText("Untranslated one");

    const dialog = await openImportDialog();

    expect(within(dialog).getByRole("button", { name: /Target language/ })).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Overwrite blank values")).not.toBeChecked();
    expect(within(dialog).getByLabelText("Pending review")).toBeChecked();
    expect(within(dialog).queryByLabelText(/Rejected/)).not.toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Import" })).toBeDisabled();
  });

  test("imports the parsed rows with the chosen options and shows the result summary and errors", async () => {
    const onDataChanged = jest.fn();
    translationService.importTranslations.mockResolvedValue({
      updated: 1,
      created: 1,
      unchanged: 0,
      skipped_blank: 0,
      skippedBlank: 0,
      failed: 1,
      errors: [{ row: 3, route: "/new", key: "tbad", reason: "key_mismatch" }],
    });
    renderWorkspace(undefined, onDataChanged);
    await screen.findByText("Untranslated one");
    const dialog = await openImportDialog();

    const csv =
      `\uFEFF${HEADER}\r\n` +
      "\"k1\",\"/\",\"Welcome, friend\",\"ಹೊಸ, ಅನುವಾದ\"\r\n" +
      "\"k5\",\"/new\",\"Brand \"\"new\"\"\",\"ಹೊಸ\nಸಾಲು\"\r\n" +
      "\"tbad\",\"/new\",\"Other\",\"\"\r\n";
    await userEvent.upload(within(dialog).getByLabelText("CSV file"), csvFile(csv));
    await within(dialog).findByText(/3 rows, language column: kn/);
    await userEvent.click(within(dialog).getByLabelText("Overwrite blank values"));
    await userEvent.click(within(dialog).getByLabelText("Approved"));
    await userEvent.click(within(dialog).getByRole("button", { name: "Import" }));

    await waitFor(() => expect(translationService.importTranslations).toHaveBeenCalledTimes(1));
    expect(translationService.importTranslations).toHaveBeenCalledWith({
      siteId: "site-1",
      lang: "kn",
      overwriteBlank: true,
      state: "approved",
      rows: [
        { row: 2, route: "/", key: "k1", source: "Welcome, friend", text: "ಹೊಸ, ಅನುವಾದ" },
        { row: 3, route: "/new", key: "k5", source: "Brand \"new\"", text: "ಹೊಸ\nಸಾಲು" },
        { row: 4, route: "/new", key: "tbad", source: "Other", text: "" },
      ],
    });
    await within(dialog).findByText("Updated 1, created 1, unchanged 0, skipped blank 0, failed 1");
    expect(within(dialog).getByText("tbad")).toBeInTheDocument();
    expect(within(dialog).getByText("Asset ID does not match the source text")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Close" })).toBeInTheDocument();
    expect(onDataChanged).toHaveBeenCalledTimes(1);
    expect(translationService.listTranslations.mock.calls.length).toBeGreaterThan(1);
  });

  test("blocks a CSV whose language column conflicts with the selected language before any write", async () => {
    renderWorkspace();
    await screen.findByText("Untranslated one");
    const dialog = await openImportDialog();

    await userEvent.upload(
      within(dialog).getByLabelText("CSV file"),
      csvFile("\"Asset ID\",\"Route\",\"English, en\",\"Telugu, te\"\n\"k1\",\"/\",\"Hello\",\"హలో\"\n")
    );

    await within(dialog).findByText(/column is for "te" but kn is selected/);
    expect(within(dialog).getByRole("button", { name: "Import" })).toBeDisabled();
    expect(translationService.importTranslations).not.toHaveBeenCalled();
  });

  test("switching the dialog language to the CSV's language unblocks the import", async () => {
    renderWorkspace();
    await screen.findByText("Untranslated one");
    const dialog = await openImportDialog();
    await userEvent.upload(
      within(dialog).getByLabelText("CSV file"),
      csvFile("\"Asset ID\",\"Route\",\"English, en\",\"Telugu, te\"\n\"k1\",\"/\",\"Hello\",\"హలో\"\n")
    );
    await within(dialog).findByText(/column is for "te"/);

    await userEvent.click(within(dialog).getByRole("button", { name: /Target language/ }));
    await userEvent.click(within(dialog).getByRole("option", { name: "Telugu (te)" }));

    expect(within(dialog).queryByText(/column is for "te"/)).not.toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Import" })).toBeEnabled();
  });

  test("a target column without a locale code imports with a warning", async () => {
    translationService.importTranslations.mockResolvedValue({
      updated: 1,
      created: 0,
      unchanged: 0,
      skippedBlank: 0,
      failed: 0,
      errors: [],
    });
    renderWorkspace();
    await screen.findByText("Untranslated one");
    const dialog = await openImportDialog();

    await userEvent.upload(
      within(dialog).getByLabelText("CSV file"),
      csvFile("\"Asset ID\",\"Route\",\"English, en\",\"Translation\"\n\"k1\",\"/\",\"Hello\",\"ಹಲೋ\"\n")
    );

    await within(dialog).findByText(/has no language code/);
    await userEvent.click(within(dialog).getByRole("button", { name: "Import" }));
    await waitFor(() => expect(translationService.importTranslations).toHaveBeenCalled());
    await within(dialog).findByText("Updated 1, created 0, unchanged 0, skipped blank 0, failed 0");
  });

  test("a file that is not a translations CSV is rejected with a clear message", async () => {
    renderWorkspace();
    await screen.findByText("Untranslated one");
    const dialog = await openImportDialog();

    await userEvent.upload(
      within(dialog).getByLabelText("CSV file"),
      csvFile("key,source,translation\nk1,Hello,ಹಲೋ\n")
    );

    await within(dialog).findByText(/No "Asset ID" header row was found/);
    expect(within(dialog).getByRole("button", { name: "Import" })).toBeDisabled();
  });

  test("an empty CSV cannot be imported", async () => {
    renderWorkspace();
    await screen.findByText("Untranslated one");
    const dialog = await openImportDialog();

    await userEvent.upload(within(dialog).getByLabelText("CSV file"), csvFile(`${HEADER}\n`));

    await within(dialog).findByText(/0 rows/);
    expect(within(dialog).getByRole("button", { name: "Import" })).toBeDisabled();
  });

  test("a CSV over the row limit is blocked", async () => {
    renderWorkspace();
    await screen.findByText("Untranslated one");
    const dialog = await openImportDialog();
    const body = Array.from({ length: 5001 }, (_, i) => `"k${i}","/","S${i}","T${i}"`).join("\n");

    await userEvent.upload(
      within(dialog).getByLabelText("CSV file"),
      csvFile(`${HEADER}\n${body}\n`)
    );

    await within(dialog).findByText(/more than 5000 rows/);
    expect(within(dialog).getByRole("button", { name: "Import" })).toBeDisabled();
  });

  test("a failed import request is shown and nothing is reported as imported", async () => {
    translationService.importTranslations.mockRejectedValue(new Error("Website not found"));
    renderWorkspace();
    await screen.findByText("Untranslated one");
    const dialog = await openImportDialog();
    await userEvent.upload(
      within(dialog).getByLabelText("CSV file"),
      csvFile(`${HEADER}\n"k1","/","Hello","ಹಲೋ"\n`)
    );
    await within(dialog).findByText(/1 rows/);

    await userEvent.click(within(dialog).getByRole("button", { name: "Import" }));

    await within(dialog).findByText("Website not found");
    expect(within(dialog).queryByText(/Updated/)).not.toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Import" })).toBeEnabled();
  });

  test("Import is unavailable until a site is selected", async () => {
    translationService.listTranslations.mockResolvedValue([]);
    renderWorkspace({ siteId: "", route: "", lang: "kn" });

    expect(screen.getByRole("button", { name: "Import" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Export" })).toBeDisabled();
  });
});

describe("Import safety", () => {
  beforeEach(() => {
    translationService.listTranslations.mockResolvedValue(docs);
  });

  test("a file with replacement characters is blocked with CSV UTF-8 instructions", async () => {
    renderWorkspace();
    await screen.findByText("Untranslated one");
    const dialog = await openImportDialog();
    const head = Buffer.from(`${HEADER}\n"k1","/","Hello","`, "utf8");
    const bytes = new Uint8Array([...head, 0xff, 0xfe, 0x22, 0x0a]);

    await userEvent.upload(
      within(dialog).getByLabelText("CSV file"),
      new File([bytes], "ansi.csv", { type: "text/csv" })
    );

    await within(dialog).findByText(/CSV UTF-8/);
    expect(within(dialog).getByRole("button", { name: "Import" })).toBeDisabled();
    expect(translationService.importTranslations).not.toHaveBeenCalled();
  });

  test("a file whose translations are only question marks is blocked", async () => {
    renderWorkspace();
    await screen.findByText("Untranslated one");
    const dialog = await openImportDialog();

    await userEvent.upload(
      within(dialog).getByLabelText("CSV file"),
      csvFile(`${HEADER}\n"k1","/","Hello","?????"\n"k2","/","Bye","ಬೈ"\n`)
    );

    await within(dialog).findByText(/1 translation contains only "\?" characters/);
    expect(within(dialog).getByRole("button", { name: "Import" })).toBeDisabled();
  });

  test("a legitimate translation that ends with a question mark is still importable", async () => {
    renderWorkspace();
    await screen.findByText("Untranslated one");
    const dialog = await openImportDialog();

    await userEvent.upload(
      within(dialog).getByLabelText("CSV file"),
      csvFile(`${HEADER}\n"k1","/","What?","ಏಕೆ?"\n`)
    );

    await within(dialog).findByText(/1 rows/);
    expect(within(dialog).getByRole("button", { name: "Import" })).toBeEnabled();
  });

  test("formula-protected cells are sent to the backend with their original values", async () => {
    translationService.importTranslations.mockResolvedValue({
      updated: 1,
      created: 0,
      unchanged: 0,
      skippedBlank: 0,
      failed: 0,
      errors: [],
    });
    renderWorkspace();
    await screen.findByText("Untranslated one");
    const dialog = await openImportDialog();

    await userEvent.upload(
      within(dialog).getByLabelText("CSV file"),
      csvFile(`${HEADER}\n"'=cmd","/","'=SUM(1+1)","'+91 ಹಲೋ"\n"k2","/","normal","'quoted' word"\n`)
    );
    await within(dialog).findByText(/2 rows/);
    await userEvent.click(within(dialog).getByRole("button", { name: "Import" }));

    await waitFor(() => expect(translationService.importTranslations).toHaveBeenCalled());
    expect(translationService.importTranslations.mock.calls[0][0].rows).toEqual([
      { row: 2, route: "/", key: "=cmd", source: "=SUM(1+1)", text: "+91 ಹಲೋ" },
      { row: 3, route: "/", key: "k2", source: "normal", text: "'quoted' word" },
    ]);
  });

  test("an invalid-route failure from the backend is explained in the result table", async () => {
    translationService.importTranslations.mockResolvedValue({
      updated: 0,
      created: 0,
      unchanged: 0,
      skippedBlank: 0,
      failed: 1,
      errors: [{ row: 1, route: "/a?x=1", key: "k1", reason: "invalid_route" }],
    });
    renderWorkspace();
    await screen.findByText("Untranslated one");
    const dialog = await openImportDialog();
    await userEvent.upload(
      within(dialog).getByLabelText("CSV file"),
      csvFile(`${HEADER}\n"k1","/a?x=1","Hello","ಹಲೋ"\n`)
    );
    await within(dialog).findByText(/1 rows/);

    await userEvent.click(within(dialog).getByRole("button", { name: "Import" }));

    await within(dialog).findByText(/plain ASCII page-path characters/);
    expect(within(dialog).getByText("/a?x=1")).toBeInTheDocument();
  });
});

describe("Export safety and limits", () => {
  const manyDocs = (count) =>
    Array.from({ length: count }, (_, i) => makeDoc(`k${i}`, "/", `Source ${i}`, `T${i}`));

  test("formula-like source text is neutralised in the downloaded file", async () => {
    translationService.listTranslations.mockResolvedValue([
      makeDoc("k1", "/", "=HYPERLINK(\"http://evil.example\",\"click\")", "-5% ಆಫರ್"),
    ]);
    renderWorkspace();
    await waitFor(() => expect(translationService.listTranslations).toHaveBeenCalled());

    await userEvent.click(screen.getByRole("button", { name: "Export" }));

    await waitFor(() => expect(downloads).toHaveLength(1));
    const text = utf8((await readBlob(downloads[0].blob)).slice(3));
    expect(text).toContain(
      "\"k1\",\"/\",\"'=HYPERLINK(\"\"http://evil.example\"\",\"\"click\"\")\",\"'-5% ಆಫರ್\""
    );
  });

  test("an all-pages export that reaches the 20,000-row cap warns that it may be incomplete", async () => {
    translationService.listTranslations
      .mockResolvedValueOnce(docs)
      .mockResolvedValueOnce(docs)
      .mockResolvedValue(manyDocs(20000));
    renderWorkspace();
    await screen.findByText("Untranslated one");

    await userEvent.click(screen.getByRole("button", { name: "Export" }));

    await screen.findByText(
      /20,000 is the most one export can hold, so this file may be incomplete/
    );
    expect(screen.queryByText("Exported 20000 rows")).not.toBeInTheDocument();
    expect(downloads).toHaveLength(1);
  });

  test("an all-pages export just under the cap reports success", async () => {
    translationService.listTranslations
      .mockResolvedValueOnce(docs)
      .mockResolvedValueOnce(docs)
      .mockResolvedValue(manyDocs(19999));
    renderWorkspace();
    await screen.findByText("Untranslated one");

    await userEvent.click(screen.getByRole("button", { name: "Export" }));

    await screen.findByText("Exported 19999 rows");
    expect(screen.queryByText(/may be incomplete/)).not.toBeInTheDocument();
  });
});

describe("Import dialog layout on short viewports", () => {
  const manyErrors = (count) =>
    Array.from({ length: count }, (_, i) => ({
      row: i + 1,
      route: `/page-${i}`,
      key: `tkey${i}`,
      reason: "key_mismatch",
    }));

  async function importWithErrors(count) {
    translationService.listTranslations.mockResolvedValue(docs);
    translationService.importTranslations.mockResolvedValue({
      updated: 0,
      created: 0,
      unchanged: 0,
      skippedBlank: 0,
      failed: count,
      errors: manyErrors(count),
    });
    renderWorkspace();
    await screen.findByText("Untranslated one");
    const dialog = await openImportDialog();
    await userEvent.upload(
      within(dialog).getByLabelText("CSV file"),
      csvFile(`${HEADER}\n"k1","/","Hello","ಹಲೋ"\n`)
    );
    await within(dialog).findByText(/1 rows/);
    await userEvent.click(within(dialog).getByRole("button", { name: "Import" }));
    await within(dialog).findByRole("button", { name: "Close" });
    return dialog;
  }

  test("the header close button and the footer buttons stay outside the scrolling content", async () => {
    const dialog = await importWithErrors(1);
    const scroll = within(dialog).getByTestId("import-dialog-scroll");

    expect(scroll).not.toBeNull();
    expect(scroll).toContainElement(within(dialog).getByLabelText("CSV file"));
    expect(scroll).toContainElement(within(dialog).getByText(/Updated 0, created 0/));
    expect(scroll).not.toContainElement(within(dialog).getByRole("button", { name: "Close" }));
    expect(scroll).not.toContainElement(
      within(dialog).getByRole("button", { name: String.fromCharCode(0x2715) })
    );
  });

  test("the footer is outside the scroll area before a result too", async () => {
    translationService.listTranslations.mockResolvedValue(docs);
    renderWorkspace();
    await screen.findByText("Untranslated one");
    const dialog = await openImportDialog();

    expect(within(dialog).getByTestId("import-dialog-scroll")).not.toContainElement(
      within(dialog).getByRole("button", { name: "Cancel" })
    );
    expect(within(dialog).getByTestId("import-dialog-scroll")).not.toContainElement(
      within(dialog).getByRole("button", { name: "Import" })
    );
  });

  test("the form fields live inside the scroll area before the import", async () => {
    translationService.listTranslations.mockResolvedValue(docs);
    renderWorkspace();
    await screen.findByText("Untranslated one");
    const dialog = await openImportDialog();

    expect(within(dialog).getByTestId("import-dialog-scroll")).toContainElement(
      within(dialog).getByLabelText("CSV file")
    );
  });

  test("a long error list is capped at 100 rows inside its own scroll container", async () => {
    const dialog = await importWithErrors(150);
    const errors = within(dialog).getByTestId("import-dialog-errors");

    expect(within(dialog).getByTestId("import-dialog-scroll")).toContainElement(errors);
    expect(within(errors).getAllByRole("row")).toHaveLength(101);
    expect(within(errors).getByText("and 50 more")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Close" })).toBeInTheDocument();
  });

  test("the stylesheet bounds the scroll area to the viewport and scrolls the error table on its own", () => {
    const css = require("fs").readFileSync(
      require("path").join(
        __dirname,
        "../../src/components/AllContent/LocalizationTab/TranslationImportDialog.css"
      ),
      "utf8"
    );
    const rule = (selector) => css.slice(css.indexOf(selector)).split("}")[0];

    expect(rule(".import-dialog-scroll {")).toMatch(/max-height:\s*calc\(92vh - 160px\)/);
    expect(rule(".import-dialog-scroll {")).toMatch(/overflow-y:\s*auto/);
    expect(rule(".import-dialog-scroll > * {")).toMatch(/flex-shrink:\s*0/);
    expect(rule(".import-dialog-scroll .import-dialog-errors {")).toMatch(/max-height:\s*16rem/);
    expect(rule(".import-dialog-scroll .import-dialog-errors {")).toMatch(/overflow:\s*auto/);
    expect(rule(".import-dialog-scroll .import-dialog-errors .content-table {")).toMatch(
      /table-layout:\s*auto/
    );
    expect(rule(".import-dialog-scroll .import-dialog-errors .table-cell {")).toMatch(
      /white-space:\s*normal/
    );
  });
});

describe("Import review fixes", () => {
  const importOk = {
    updated: 1,
    created: 0,
    unchanged: 0,
    skippedBlank: 0,
    failed: 0,
    errors: [],
    warnings: [],
  };

  beforeEach(() => {
    translationService.listTranslations.mockResolvedValue(docs);
  });

  async function openWithFile(content) {
    renderWorkspace();
    await screen.findByText("Untranslated one");
    const dialog = await openImportDialog();
    await userEvent.upload(within(dialog).getByLabelText("CSV file"), csvFile(content));
    return dialog;
  }

  test("a malformed CSV is blocked with its row and nothing is sent, even with Overwrite blank on", async () => {
    const dialog = await openWithFile(
      `${HEADER}\n"k1","/","Hello","ಹಲೋ"\n"k2","/","Unclosed,ಹಲೋ\n"k3","/","After",""\n`
    );
    await userEvent.click(within(dialog).getByLabelText("Overwrite blank values"));

    await within(dialog).findByText(/not closed properly near row 3/);
    expect(within(dialog).getByRole("button", { name: "Import" })).toBeDisabled();
    expect(translationService.importTranslations).not.toHaveBeenCalled();
  });

  test("the CSV row numbers are sent so errors point at the right spreadsheet row", async () => {
    translationService.importTranslations.mockResolvedValue(importOk);
    const dialog = await openWithFile(`${HEADER}\n\n"k1","/","Hello","ಹಲೋ"\n`);
    await within(dialog).findByText(/1 rows/);

    await userEvent.click(within(dialog).getByRole("button", { name: "Import" }));

    await waitFor(() => expect(translationService.importTranslations).toHaveBeenCalled());
    expect(translationService.importTranslations.mock.calls[0][0].rows[0].row).toBe(3);
  });

  test("a failed import request still reloads the list, because some rows may already be saved", async () => {
    translationService.importTranslations.mockRejectedValue(new Error("Gateway timeout"));
    const dialog = await openWithFile(`${HEADER}\n"k1","/","Hello","ಹಲೋ"\n`);
    await within(dialog).findByText(/1 rows/);
    translationService.listTranslations.mockClear();

    await userEvent.click(within(dialog).getByRole("button", { name: "Import" }));

    await within(dialog).findByText("Gateway timeout");
    await waitFor(() => expect(translationService.listTranslations).toHaveBeenCalled());
  });

  test("a partial import (some rows failed) reloads the list and keeps the row errors visible", async () => {
    translationService.importTranslations.mockResolvedValue({
      ...importOk,
      failed: 1,
      errors: [{ row: 5, route: "/x", key: "tbad", reason: "key_mismatch" }],
    });
    const dialog = await openWithFile(`${HEADER}\n"k1","/","Hello","ಹಲೋ"\n`);
    await within(dialog).findByText(/1 rows/);
    translationService.listTranslations.mockClear();

    await userEvent.click(within(dialog).getByRole("button", { name: "Import" }));

    await within(dialog).findByText("Asset ID does not match the source text");
    expect(translationService.listTranslations).toHaveBeenCalled();
  });

  test("history warnings tell the user which rows were saved without their history", async () => {
    translationService.importTranslations.mockResolvedValue({
      ...importOk,
      warnings: [
        { row: 4, route: "/", key: "k1", reason: "version_not_recorded" },
        { row: 4, route: "/", key: "k1", reason: "audit_not_recorded" },
      ],
    });
    const dialog = await openWithFile(`${HEADER}\n"k1","/","Hello","ಹಲೋ"\n`);
    await within(dialog).findByText(/1 rows/);

    await userEvent.click(within(dialog).getByRole("button", { name: "Import" }));

    await within(dialog).findByText(
      /saved, but their version history and audit entry could not be recorded: row 4/
    );
  });

  test("error cells keep their full text in a tooltip and show the route and key", async () => {
    translationService.importTranslations.mockResolvedValue({
      ...importOk,
      failed: 1,
      errors: [{ row: 9, route: "/faq?page=2", key: "x".repeat(300), reason: "key_too_long" }],
    });
    const dialog = await openWithFile(`${HEADER}\n"k1","/","Hello","ಹಲೋ"\n`);
    await within(dialog).findByText(/1 rows/);

    await userEvent.click(within(dialog).getByRole("button", { name: "Import" }));

    const problem = await within(dialog).findByText("Asset ID is too long");
    expect(problem).toHaveAttribute("title", "Asset ID is too long");
    expect(within(dialog).getByText("/faq?page=2")).toHaveAttribute("title", "/faq?page=2");
    expect(within(dialog).getByText("9")).toBeInTheDocument();
  });

  test("the target language field and the status radios have accessible names", async () => {
    renderWorkspace();
    await screen.findByText("Untranslated one");
    const dialog = await openImportDialog();

    expect(within(dialog).getByLabelText("Target language")).toHaveTextContent("Kannada (kn)");
    const group = within(dialog).getByRole("group", { name: "Imported translations are" });
    expect(within(group).getAllByRole("radio")).toHaveLength(3);
    expect(within(group).getByLabelText("Pending review")).toBeChecked();
  });

  test("the invalid-route message states the whole route rule", async () => {
    translationService.importTranslations.mockResolvedValue({
      ...importOk,
      failed: 1,
      errors: [{ row: 2, route: "/a b", key: "k1", reason: "invalid_route" }],
    });
    const dialog = await openWithFile(`${HEADER}\n"k1","/a b","Hello","ಹಲೋ"\n`);
    await within(dialog).findByText(/1 rows/);

    await userEvent.click(within(dialog).getByRole("button", { name: "Import" }));

    const message = await within(dialog).findByText(/Route must start with \//);
    expect(message).toHaveTextContent(/ASCII/);
    expect(message).toHaveTextContent(/\.\. segments/);
    expect(message).toHaveTextContent(/2048/);
  });
});
