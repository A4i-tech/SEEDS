import Papa from "papaparse";

export const MAX_IMPORT_ROWS = 5000;
export const MAX_EXPORT_ROWS = 20000;

export const ENCODING_ERROR =
  "The file is not valid UTF-8, so its text would be corrupted. In Excel use Save As > CSV UTF-8 (Comma delimited), then import that file.";

const ENCODING_PROBLEM = new RegExp(`[${String.fromCharCode(0xfffd, 0)}]`);
const QUESTION_MARKS_ONLY = /^\?{2,}$/;
const FORMULA_START = /^'*[=+\-@\t\r]/;
const ESCAPED_FORMULA = /^'+[=+\-@\t\r]/;

const DELIMITERS = [",", ";", "\t"];
const NON_LOCALE_HEADERS = new Set(["asset id", "route", "context", "notes"]);
const LOCALE_CODE = /^[a-z]{2,3}(-[a-z0-9]+)*$/i;
const SOURCE_HEADER = "English, en";

const cell = (row, index) => row[index] ?? "";

const escapeFormula = (value) => (FORMULA_START.test(value) ? `'${value}` : value);

const unescapeFormula = (value) => (ESCAPED_FORMULA.test(value) ? value.slice(1) : value);

const localeFromHeader = (header) => {
  const code = header.split(",").pop().trim();
  return LOCALE_CODE.test(code) ? code : null;
};

export const buildTranslationCsv = ({ docs, lang, languageName }) => {
  const rows = [...docs]
    .sort((a, b) => a.route.localeCompare(b.route) || a.key.localeCompare(b.key))
    .map((doc) =>
      [doc.key, doc.route, doc.sourceText ?? "", doc.translations?.[lang]?.text || ""].map(
        escapeFormula
      )
    );
  const csv = Papa.unparse(
    {
      fields: ["Asset ID", "Route", SOURCE_HEADER, `${languageName || lang}, ${lang}`],
      data: rows,
    },
    { quotes: true, newline: "\r\n" }
  );
  return `\uFEFF${csv}`;
};

export const downloadCsv = (content, filename) => {
  const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8;" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

export const readFileText = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read the file"));
    reader.readAsText(file, "UTF-8");
  });

const quotesError = (rowIndex) =>
  `The CSV has a quoted value that is not closed properly${
    rowIndex === undefined ? "" : ` near row ${rowIndex + 1}`
  }. Every opening quote needs a closing quote. Fix that row and import again.`;

const buildTable = (data, headerIndex) => {
  const header = data[headerIndex].map((value) => (value ?? "").trim());
  const lower = header.map((value) => value.toLowerCase());
  const routeIndex = lower.indexOf("route");
  if (routeIndex < 0) return { error: "The CSV has no \"Route\" column." };
  const locales = header
    .map((label, index) => ({ label, index }))
    .filter(({ label }) => label && !NON_LOCALE_HEADERS.has(label.toLowerCase()));
  if (locales.length < 2) {
    return {
      error: "The CSV needs a source column and a target language column after Asset ID and Route.",
    };
  }
  const [source, ...targets] = locales;
  return {
    assetIndex: lower.indexOf("asset id"),
    routeIndex,
    sourceIndex: source.index,
    targets: targets.map(({ label, index }) => ({ index, label, code: localeFromHeader(label) })),
    rows: data
      .slice(headerIndex + 1)
      .map((cells, offset) => ({ cells, number: headerIndex + offset + 2 }))
      .filter(({ cells }) => cells.some((value) => (value ?? "").trim() !== "")),
  };
};

export const parseTranslationCsv = (text) => {
  if (ENCODING_PROBLEM.test(text)) return { error: ENCODING_ERROR };
  const content = text.replace(/^\uFEFF/, "");
  for (const delimiter of DELIMITERS) {
    const { data, errors } = Papa.parse(content, { delimiter });
    const headerIndex = data.findIndex((row) => (row[0] ?? "").trim().toLowerCase() === "asset id");
    if (headerIndex >= 0) {
      const quoteError = errors.find((error) => error.type === "Quotes");
      return quoteError ? { error: quotesError(quoteError.row) } : buildTable(data, headerIndex);
    }
  }
  return {
    error:
      "No \"Asset ID\" header row was found. Use a file exported from Localization or Localise.biz.",
  };
};

export const selectTargetColumn = (table, lang) => {
  const matching = table.targets.find((target) => target.code === lang);
  if (matching) return { index: matching.index, code: matching.code };
  if (table.targets.length === 1 && !table.targets[0].code) {
    return {
      index: table.targets[0].index,
      code: null,
      warning: `The CSV target column "${table.targets[0].label}" has no language code. It will be imported as ${lang}.`,
    };
  }
  if (table.targets.length === 1) {
    return {
      error: `The CSV target column is for "${table.targets[0].code}" but ${lang} is selected. Pick the matching language or use a different file.`,
    };
  }
  return { error: `The CSV has no target column for "${lang}".` };
};

export const buildImportRows = (table, targetIndex) =>
  table.rows.map(({ cells: row, number }) => ({
    row: number,
    route: unescapeFormula(cell(row, table.routeIndex).trim()),
    key: unescapeFormula(cell(row, table.assetIndex).trim()),
    source: unescapeFormula(cell(row, table.sourceIndex)),
    text: unescapeFormula(cell(row, targetIndex)),
  }));

export const countQuestionMarkTranslations = (rows) =>
  rows.filter(
    (row) => QUESTION_MARKS_ONLY.test(row.text.trim()) && row.source.trim() !== row.text.trim()
  ).length;

export const questionMarkError = (count) =>
  `${count} translation${count === 1 ? " contains" : "s contain"} only "?" characters. The file was probably saved as plain "CSV (Comma delimited)", which cannot hold Kannada or Telugu. In Excel use Save As > CSV UTF-8 (Comma delimited), then import that file.`;
