import "./RemediationRunDetails.css";

const MODEL_LABELS = {
  ocr: "OCR model",
  verify: "Verify model",
  block_tree: "Block-tree model",
  alt_text: "Alt-text model",
  translation: "Translation model",
};

const METRIC_LABELS = {
  processed_pages: "Pages processed",
  diagrams_described: "Diagrams described",
  tables_fixed: "Tables fixed",
  flagged_items_count: "Flagged items",
};

function Rows({ labels, values }) {
  const rows = Object.keys(labels).filter((key) => values?.[key] != null);
  if (rows.length === 0) return null;
  return (
    <dl className="remediation-run-details-list">
      {rows.map((key) => (
        <div key={key} className="remediation-run-details-row">
          <dt>{labels[key]}</dt>
          <dd>{values[key]}</dd>
        </div>
      ))}
    </dl>
  );
}

export function RemediationRunDetails({ models, metrics }) {
  const hasModels = models && Object.values(models).some((value) => value != null);
  const hasMetrics = metrics && Object.values(metrics).some((value) => value != null);
  if (!hasModels && !hasMetrics) return null;

  return (
    <div className="remediation-run-details">
      <span className="remediation-run-details-title">Run details</span>
      <div className="remediation-run-details-columns">
        <Rows labels={MODEL_LABELS} values={models} />
        <Rows labels={METRIC_LABELS} values={metrics} />
      </div>
    </div>
  );
}
