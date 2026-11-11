import React, { useEffect, useMemo, useRef, useState } from "react";
import Modal from "../shared/Modal";
import Select from "../shared/Select";
import "../shared/buttons.css";
import "../shared/utilities.css";
import "../shared/modal.css";
import "../AnalyticsTab/css/AnalyticsTab.css";
import "./TranslationImportDialog.css";
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
    "Route must start with / and use only plain ASCII page-path characters. No spaces, quotes, < > ^ ` { } \\ ? #, no . or .. segments, and at most 2048 characters.",
  key_too_long: "Asset ID is too long",
  missing_source: "Source text is missing",
  source_too_long: "Source text is too long",
  text_too_long: "Translation is too long",
  duplicate_row: "Duplicate route and Asset ID in the file",
  source_mismatch: "Source text differs from the existing row",
  key_mismatch: "Asset ID does not match the source text",
  write_failed: "The update failed",
};

const MAX_LISTED_ERRORS = 100;

function TranslationImportDialog({ siteId, languages, defaultLang, onClose, onImported }) {
  const [fileName, setFileName] = useState("");
  const [table, setTable] = useState(null);
  const [lang, setLang] = useState(defaultLang || "");
  const [overwriteBlank, setOverwriteBlank] = useState(false);
  const [importState, setImportState] = useState("pending");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [failure, setFailure] = useState("");
  const resultRef = useRef(null);

  useEffect(() => {
    if (result && resultRef.current) {
      resultRef.current.focus();
    }
  }, [result]);

  const parsed = table && !table.error;
  const target = useMemo(
    () => parsed && lang && selectTargetColumn(table, lang),
    [table, parsed, lang]
  );
  const tooManyRows = parsed && table.rows.length > MAX_IMPORT_ROWS;
  const { longRows, shortRows, importRows } = useMemo(() => {
    const checked = { longRows: [], shortRows: [], importRows: [] };
    if (parsed && !tooManyRows) {
      const hasTarget = target && target.index !== undefined;
      const required = hasTarget
        ? Math.max(table.routeIndex, table.assetIndex, table.sourceIndex, target.index)
        : -1;
      table.rows.forEach(({ cells, number }) => {
        if (cells.length > table.headerLength) checked.longRows.push(number);
        if (cells.length <= required) checked.shortRows.push(number);
      });
      if (hasTarget && !checked.longRows.length && !checked.shortRows.length) {
        checked.importRows = buildImportRows(table, target.index);
      }
    }
    return checked;
  }, [table, parsed, target, tooManyRows]);
  const questionMarks = countQuestionMarkTranslations(importRows);
  const problem =
    (table && table.error) ||
    (target && target.error) ||
    (tooManyRows && `The CSV has more than ${MAX_IMPORT_ROWS} rows.`) ||
    (longRows.length > 0 &&
      `Row${longRows.length === 1 ? "" : "s"} ${longRows.join(", ")} ${longRows.length === 1 ? "has" : "have"} more columns than the header. Fix the file and import again.`) ||
    (shortRows.length > 0 &&
      `Row${shortRows.length === 1 ? "" : "s"} ${shortRows.join(", ")} ${shortRows.length === 1 ? "has" : "have"} fewer columns than the header. Fix the file and import again.`) ||
    (questionMarks > 0 && questionMarkError(questionMarks));
  const canImport = Boolean(importRows.length && !problem && !busy);

  const chooseFile = async (event) => {
    const file = event.target.files[0];
    setResult(null);
    setFailure("");
    setFileName(file ? file.name : "");
    if (!file) {
      setTable(null);
      return;
    }
    try {
      setTable(parseTranslationCsv(await readFileText(file)));
    } catch (e) {
      setTable({ error: e.message });
    }
  };

  const runImport = async () => {
    setBusy(true);
    setFailure("");
    try {
      const res = await translationService.importTranslations({
        siteId,
        lang,
        overwriteBlank,
        state: importState,
        rows: importRows,
      });
      setResult(res);
      onImported();
    } catch (e) {
      setFailure(
        `${e.message} If this was a network or timeout error, some rows may already have been imported — check the list before retrying.`
      );
      onImported();
    } finally {
      setBusy(false);
    }
  };

  const handleClose = () => {
    if (busy) return;
    onClose();
  };

  return (
    <Modal title="Import translations" onClose={handleClose} maxWidth={640}>
      <div className="import-dialog-scroll" data-testid="import-dialog-scroll">
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
        {fileName && parsed && (
          <p className="placeholder-text">
            {fileName}: {table.rows.length} rows, language column:{" "}
            {table.targets.map((t) => t.code || t.label).join(", ")}
          </p>
        )}

        <label className="label" htmlFor="import-target-lang">
          Target language
        </label>
        <Select
          id="import-target-lang"
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
            aria-describedby="overwrite-blank-hint"
          />
          Overwrite blank values
        </label>
        <p className="placeholder-text" id="overwrite-blank-hint">
          {overwriteBlank
            ? "Blank cells will clear the existing translation for this language."
            : "Blank cells are skipped and existing translations are kept."}
        </p>

        <fieldset>
          <legend className="label">Imported translations are</legend>
          <div className="checkbox-list">
            {STATE_OPTIONS.map((option) => (
              <label key={option.value} className="checkbox-item">
                <input
                  type="radio"
                  name="import-state"
                  value={option.value}
                  checked={importState === option.value}
                  onChange={() => setImportState(option.value)}
                  disabled={Boolean(result)}
                />
                {option.label}
              </label>
            ))}
          </div>
        </fieldset>

        {problem && (
          <p className="error-message" role="alert">
            {problem}
          </p>
        )}
        {target && target.warning && <p className="status-message">{target.warning}</p>}
        {failure && (
          <p className="error-message" role="alert">
            {failure}
          </p>
        )}

        {result && (
          <div role="status" ref={resultRef} tabIndex={-1}>
            <p className={result.failed ? "error-message" : "success-message"}>
              {`Updated ${result.updated}, created ${result.created}, unchanged ${result.unchanged}, skipped blank ${result.skipped_blank}, failed ${result.failed}`}
            </p>
            {result.errors.length > 0 && (
              <div
                className="table-wrapper import-dialog-errors"
                data-testid="import-dialog-errors"
                tabIndex={0}
                role="region"
                aria-label="Import errors"
              >
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
                        <td className="table-cell" title={err.route}>
                          {err.route}
                        </td>
                        <td className="table-cell" title={err.key}>
                          {err.key}
                        </td>
                        <td className="table-cell" title={REASONS[err.reason]}>
                          {REASONS[err.reason]}
                        </td>
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
      </div>

      <div className="modal-actions">
        <button type="button" className="action-ghost-button" onClick={handleClose} disabled={busy}>
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
