import Papa from "papaparse";
import { translatedText } from "../dto/LocalizationDto";

const Q = "\u0022";

export const MAX_IMPORT_ROWS = 5000;

export const ENCODING_ERROR =
  "The file is not valid UTF-8, so its text would be corrupted. In Excel use Save As > CSV UTF-8 (Comma delimited), then import that file.";

const ENCODING_PROBLEM = new RegExp(`[${String.fromCharCode(0xfffd, 0)}]`);
const QUESTION_MARKS_ONLY = /^\?{2,}$/;
const FORMULA_START = /^'*[=+\-@\t\r]/;
const ESCAPED_FORMULA = /^'+[=+\-@\t\r]/;

const NON_LOCALE_HEADERS = new Set(["asset id", "route", "context", "notes"]);
const LOCALE_CODE = /^[a-z]{2,3}(-[a-z0-9]+)*$/i;
const SOURCE_HEADER = "English, en";

const compare = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

const escapeFormula = (value) => (FORMULA_START.test(value) ? `'${value}` : value);

const unescapeFormula = (value) => (ESCAPED_FORMULA.test(value) ? value.slice(1) : value);

const localeFromHeader = (header) => {
  const code = header.split(",").pop().trim();
  return LOCALE_CODE.test(code) && code;
};

export const buildTranslationCsv = ({ docs, lang, languageName }) => {
  const rows = [...docs]
    .sort((a, b) => compare(a.route, b.route) || compare(a.key, b.key))
    .map((doc) =>
      [doc.key, doc.route, doc.sourceText, translatedText(doc, lang)].map(escapeFormula)
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

export const readFileText = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Could not read the file"));
    reader.readAsText(file, "UTF-8");
  });

const parseError = (errors) =>
  `The CSV could not be parsed: ${errors
    .map(({ message, row }) => `${message} (row ${row + 1})`)
    .join("; ")}. Fix the file and import again.`;

const buildTable = (data, headerIndex) => {
  const header = data[headerIndex].map((value) => value.trim());
  const lower = header.map((value) => value.toLowerCase());
  const routeIndex = lower.indexOf("route");
  if (routeIndex < 0) return { error: `The CSV has no ${Q}Route${Q} column.` };
  const locales = header
    .map((label, index) => ({ label, index }))
    .filter(({ label }) => label && !NON_LOCALE_HEADERS.has(label.toLowerCase()));
  if (locales.length < 2) {
    return {
      error: "The CSV needs a source column and a target language column after Asset ID and Route.",
    };
  }
  const [source, ...rest] = locales;
  const targets = rest.map(({ label, index }) => ({ index, label, code: localeFromHeader(label) }));
  const coded = targets.filter(({ code }) => code);
  const rows = data
    .slice(headerIndex + 1)
    .map((cells, offset) => ({ cells, number: headerIndex + offset + 2 }))
    .filter(({ cells }) => cells.some((value) => value.trim() !== ""));
  return {
    assetIndex: lower.indexOf("asset id"),
    routeIndex,
    sourceIndex: source.index,
    targets: coded.length ? coded : targets,
    headerLength: header.length,
    rows,
    blankRows: data.length - headerIndex - 1 - rows.length,
  };
};

export const parseTranslationCsv = (text) => {
  if (ENCODING_PROBLEM.test(text)) return { error: ENCODING_ERROR };
  const content = text.replace(/^\uFEFF/, "");
  const { data, errors } = Papa.parse(content);
  const headerIndex = data.findIndex((row) => row[0].trim().toLowerCase() === "asset id");
  if (headerIndex < 0) {
    return {
      error: `No ${Q}Asset ID${Q} header row was found. Use a file exported from Localization or Localise.biz.`,
    };
  }
  return errors.length ? { error: parseError(errors) } : buildTable(data, headerIndex);
};

export const selectTargetColumn = (table, lang) => {
  const matching = table.targets.find((target) => target.code === lang);
  if (matching) return { index: matching.index, code: matching.code };
  if (table.targets.length === 1) {
    const [only] = table.targets;
    return only.code
      ? {
          error: `The CSV target column is for "${only.code}" but ${lang} is selected. Pick the matching language or use a different file.`,
        }
      : {
          index: only.index,
          code: "",
          warning: `The CSV target column "${only.label}" has no language code. It will be imported as ${lang}.`,
        };
  }
  return { error: `The CSV has no target column for "${lang}".` };
};

export const buildImportRows = (table, targetIndex) => {
  const required = Math.max(table.routeIndex, table.assetIndex, table.sourceIndex, targetIndex);
  const short = table.rows.find(({ cells }) => cells.length <= required);
  if (short) throw new Error(`Row ${short.number} has fewer columns than the header.`);
  return table.rows.map(({ cells: row, number }) => ({
    row: number,
    route: unescapeFormula(row[table.routeIndex].trim()),
    key: unescapeFormula(row[table.assetIndex].trim()),
    source: unescapeFormula(row[table.sourceIndex]),
    text: unescapeFormula(row[targetIndex]),
  }));
};

export const countQuestionMarkTranslations = (rows) =>
  rows.filter(
    (row) => QUESTION_MARKS_ONLY.test(row.text.trim()) && row.source.trim() !== row.text.trim()
  ).length;

export const questionMarkError = (count) =>
  `${count} translation${count === 1 ? " contains" : "s contain"} only "?" characters. The file was probably saved as plain "CSV (Comma delimited)", which cannot hold Kannada or Telugu. In Excel use Save As > CSV UTF-8 (Comma delimited), then import that file.`;
