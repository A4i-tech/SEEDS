import React, { useMemo, useState } from "react";
import Modal from "../shared/Modal";
import Select from "../shared/Select";
import "../shared/buttons.css";
import "../shared/utilities.css";
import "../shared/modal.css";
import "../AnalyticsTab/css/AnalyticsTab.css";
import { translationService } from "../../../services/translationService";
import {
  MAX_IMPORT_ROWS,
  buildImportRows,
  countQuestionMarkTranslations,
  parseTranslationCsv,
  questionMarkError,
  readFileText,
  selectTargetColumn,
} from "../../../utils/translationCsv";

const STATE_OPTIONS = [
  { value: "pending", label: "Pending review" },
  { value: "approved", label: "Approved" },
  { value: "keep", label: "Keep existing status (new rows start pending)" },
];

const REASONS = {
  missing_key: "Asset ID is missing",
  missing_route: "Route is missing",
  invalid_route:
    "Route is not a valid page path (it must start with / and cannot contain spaces, ? or #)",
  missing_source: "Source text is missing",
  source_too_long: "Source text is too long",
  text_too_long: "Translation is too long",
  duplicate_row: "Duplicate route and Asset ID in the file",
  source_mismatch: "Source text differs from the existing row",
  key_mismatch: "Asset ID does not match the source text",
  write_failed: "The update failed",
};

const MAX_LISTED_ERRORS = 100;

export function TranslationImportDialog({ siteId, languages, defaultLang, onClose, onImported }) {
  const [fileName, setFileName] = useState("");
  const [table, setTable] = useState(null);
  const [lang, setLang] = useState(defaultLang || "");
  const [overwriteBlank, setOverwriteBlank] = useState(false);
  const [state, setState] = useState("pending");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [failure, setFailure] = useState(null);

  const target = useMemo(
    () => (table && !table.error && lang ? selectTargetColumn(table, lang) : null),
    [table, lang]
  );
  const tooManyRows = table && !table.error && table.rows.length > MAX_IMPORT_ROWS;
  const importRows = useMemo(
    () =>
      target && target.index !== undefined && !tooManyRows
        ? buildImportRows(table, target.index)
        : null,
    [table, target, tooManyRows]
  );
  const questionMarks = importRows ? countQuestionMarkTranslations(importRows) : 0;
  const problem =
    table?.error ||
    target?.error ||
    (tooManyRows && `The CSV has more than ${MAX_IMPORT_ROWS} rows.`) ||
    (questionMarks > 0 && questionMarkError(questionMarks));
  const canImport = Boolean(importRows && importRows.length && !problem && !busy);
  const detected =
    table && !table.error ? table.targets.map((t) => t.code || t.label).join(", ") : "";

  const chooseFile = async (event) => {
    const file = event.target.files[0];
    setResult(null);
    setFailure(null);
    setFileName(file ? file.name : "");
    if (!file) return setTable(null);
    try {
      setTable(parseTranslationCsv(await readFileText(file)));
    } catch (e) {
      setTable({ error: e.message });
    }
  };

  const runImport = async () => {
    setBusy(true);
    setFailure(null);
    try {
      const res = await translationService.importTranslations({
        siteId,
        lang,
        overwriteBlank,
        state,
        rows: importRows,
      });
      setResult(res);
      onImported(res);
    } catch (e) {
      setFailure(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Import translations" onClose={onClose} maxWidth={640}>
      <label className="label" htmlFor="import-csv-file">
        CSV file
      </label>
      <input
        id="import-csv-file"
        type="file"
        accept=".csv"
        onChange={chooseFile}
        disabled={busy || Boolean(result)}
      />
      {fileName && table && !table.error && (
        <p className="placeholder-text">
          {fileName}: {table.rows.length} rows, language column: {detected}
        </p>
      )}

      <label className="label">Target language</label>
      <Select
        value={lang}
        onChange={setLang}
        placeholder="Select language"
        options={languages.map((l) => ({ value: l.code, label: `${l.name} (${l.code})` }))}
      />

      <label className="checkbox-item">
        <input
          type="checkbox"
          checked={overwriteBlank}
          onChange={(e) => setOverwriteBlank(e.target.checked)}
          disabled={Boolean(result)}
        />
        Overwrite blank values
      </label>
      <p className="placeholder-text">
        {overwriteBlank
          ? "Blank cells will clear the existing translation for this language."
          : "Blank cells are skipped and existing translations are kept."}
      </p>

      <label className="label">Imported translations are</label>
      <div className="checkbox-list">
        {STATE_OPTIONS.map((option) => (
          <label key={option.value} className="checkbox-item">
            <input
              type="radio"
              name="import-state"
              value={option.value}
              checked={state === option.value}
              onChange={() => setState(option.value)}
              disabled={Boolean(result)}
            />
            {option.label}
          </label>
        ))}
      </div>

      {problem && <p className="error-message">{problem}</p>}
      {target?.warning && <p className="status-message">{target.warning}</p>}
      {failure && <p className="error-message">{failure}</p>}

      {result && (
        <div role="status">
          <p className={result.failed ? "error-message" : "success-message"}>
            {`Updated ${result.updated}, created ${result.created}, unchanged ${result.unchanged}, skipped blank ${result.skippedBlank}, failed ${result.failed}`}
          </p>
          {result.errors.length > 0 && (
            <div className="table-wrapper">
              <table className="content-table">
                <thead>
                  <tr>
                    <th className="table-header">Row</th>
                    <th className="table-header">Route</th>
                    <th className="table-header">Asset ID</th>
                    <th className="table-header">Problem</th>
                  </tr>
                </thead>
                <tbody>
                  {result.errors.slice(0, MAX_LISTED_ERRORS).map((err) => (
                    <tr key={`${err.row}-${err.reason}`} className="table-row-white">
                      <td className="table-cell">{err.row}</td>
                      <td className="table-cell">{err.route}</td>
                      <td className="table-cell">{err.key}</td>
                      <td className="table-cell">{REASONS[err.reason] || err.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {result.errors.length > MAX_LISTED_ERRORS && (
                <p className="placeholder-text">
                  and {result.errors.length - MAX_LISTED_ERRORS} more
                </p>
              )}
            </div>
          )}
        </div>
      )}

      <div className="modal-actions">
        <button type="button" className="action-ghost-button" onClick={onClose}>
          {result ? "Close" : "Cancel"}
        </button>
        {!result && (
          <button
            type="button"
            className="primary-button"
            onClick={runImport}
            disabled={!canImport}
          >
            {busy ? "Importing…" : "Import"}
          </button>
        )}
      </div>
    </Modal>
  );
}

export default TranslationImportDialog;
