import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import { textbookRemediationService } from "../services/textbookRemediationService";
import { normalizeMathDelimiters, MarkdownParagraph } from "./ContentAggregatorDetails/markdownMath";
import { Breadcrumb } from "./AllContent/shared/Breadcrumb";
import { StageProgress } from "./AllContent/RemediationTab/StageProgress";
import "./AllContent/shared/pageShell.css";
import "./AllContent/shared/cards.css";
import "./AllContent/shared/buttons.css";
import "./AllContent/shared/tables.css";
import "./AllContent/RemediationTab/css/RemediationTab.css";
import "./RemediationDetails.css";

const TRAILS = [
  { name: "findings", label: "OCR review" },
  { name: "alt", label: "Alt text" },
  { name: "remediation", label: "Remediation" },
  { name: "unresolved", label: "Unresolved figures" },
];

function Markdown({ text }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[rehypeKatex]}
      components={{ p: MarkdownParagraph }}
    >
      {normalizeMathDelimiters(text)}
    </ReactMarkdown>
  );
}

function FindingsTable({ findings }) {
  const columns = useMemo(
    () => [...new Set(findings.flatMap((finding) => Object.keys(finding)))].filter((key) => key !== "stage"),
    [findings]
  );
  if (findings.length === 0) return <p className="table-cell-secondary">Nothing recorded in this trail.</p>;
  return (
    <div className="table-wrapper">
      <table className="content-table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column} className="table-header">
                {column.replace(/_/g, " ")}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {findings.map((finding, index) => (
            <tr key={index}>
              {columns.map((column) => (
                <td key={column} className="table-cell remediation-finding-cell">
                  {finding[column] === undefined || finding[column] === null ? "—" : String(finding[column])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const RemediationDetails = () => {
  const { jobId } = useParams();
  const navigate = useNavigate();
  const [job, setJob] = useState(null);
  const [documents, setDocuments] = useState({});
  const [trail, setTrail] = useState({ name: "findings", findings: [], total: 0, gate: "all" });
  const [error, setError] = useState(null);

  useEffect(() => {
    const controller = new AbortController();
    textbookRemediationService
      .getJob(jobId)
      .then((current) => {
        setJob(current);
        if (current.status === "pending" || current.status === "running") {
          return textbookRemediationService.streamJob(jobId, (event) => setJob(event.job), {
            signal: controller.signal,
          });
        }
        return undefined;
      })
      .catch((jobError) => {
        if (!controller.signal.aborted) setError(jobError.message);
      });
    return () => controller.abort();
  }, [jobId]);

  const artifacts = useMemo(() => job?.artifacts || {}, [job]);

  useEffect(() => {
    ["raw", "corrected"].forEach((name) => {
      if (!artifacts[name] || documents[name] !== undefined) return;
      textbookRemediationService
        .getArtifactText(jobId, name)
        .then((text) => setDocuments((previous) => ({ ...previous, [name]: text })))
        .catch((textError) => setError(textError.message));
    });
  }, [artifacts, documents, jobId]);

  const loadTrail = useCallback(
    async (name) => {
      if (!artifacts[name]) {
        setTrail({ name, findings: [], total: 0, gate: "all" });
        return;
      }
      try {
        const data = await textbookRemediationService.getFindings(jobId, { name, limit: 500 });
        setTrail({ name, findings: data.findings, total: data.total, gate: "all" });
      } catch (trailError) {
        setError(trailError.message);
      }
    },
    [artifacts, jobId]
  );

  const openedRef = useRef(false);
  useEffect(() => {
    if (artifacts.findings && !openedRef.current) {
      openedRef.current = true;
      loadTrail("findings");
    }
  }, [artifacts.findings, loadTrail]);

  const gates = useMemo(
    () => [...new Set(trail.findings.map((finding) => finding.gate).filter(Boolean))],
    [trail.findings]
  );
  const visible = trail.gate === "all" ? trail.findings : trail.findings.filter((f) => f.gate === trail.gate);

  return (
    <div className="page-shell">
      <Breadcrumb
        className="breadcrumb-standalone"
        items={[{ label: "Home", onClick: () => navigate("/content") }, { label: job?.source_name || jobId }]}
      />

      {error && <p className="content-details-error">Error: {error}</p>}
      {!job && !error && <p className="table-cell-secondary">Loading…</p>}

      {job && (
        <>
          <div className="card">
            <div className="card-header">
              <div>
                <div className="card-title">{job.source_name}</div>
                <div className="card-description">
                  Figure descriptions in <strong>{job.language}</strong> ·{" "}
                  <span className={`remediation-status remediation-status-${job.status}`}>{job.status}</span>
                </div>
              </div>
              {artifacts.docx && (
                <button
                  type="button"
                  className="primary-button"
                  onClick={() =>
                    textbookRemediationService.downloadArtifact(
                      jobId,
                      "docx",
                      `${job.source_name.replace(/\.pdf$/i, "")}.docx`
                    )
                  }
                >
                  Download .docx
                </button>
              )}
            </div>
            <StageProgress job={job} />
            {job.error && <p className="content-details-error">{job.error}</p>}
            {Object.keys(job.counts).length > 0 && (
              <dl className="remediation-counts">
                {Object.entries(job.counts).map(([name, value]) => (
                  <div key={name}>
                    <dt>{name.replace(/_/g, " ")}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>

          <div className="card">
            <div className="card-header">
              <div>
                <div className="card-title">Raw vs reviewed</div>
                <div className="card-description">
                  What the OCR produced, beside what the review agent left behind
                </div>
              </div>
            </div>
            <div className="remediation-diff">
              <section>
                <h3 className="remediation-diff-heading">Raw OCR</h3>
                <div className="remediation-document">
                  {documents.raw === undefined ? (
                    <p className="table-cell-secondary">Not produced yet.</p>
                  ) : (
                    <Markdown text={documents.raw} />
                  )}
                </div>
              </section>
              <section>
                <h3 className="remediation-diff-heading">Reviewed</h3>
                <div className="remediation-document">
                  {documents.corrected === undefined ? (
                    <p className="table-cell-secondary">Not produced yet.</p>
                  ) : (
                    <Markdown text={documents.corrected} />
                  )}
                </div>
              </section>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <div>
                <div className="card-title">Findings</div>
                <div className="card-description">
                  Every change made, and every change proposed but not made — with the gate that stopped it
                </div>
              </div>
            </div>
            <div className="remediation-trail-tabs">
              {TRAILS.map(({ name, label }) => (
                <button
                  key={name}
                  type="button"
                  className={`tab-button ${trail.name === name ? "active" : ""}`}
                  disabled={!artifacts[name]}
                  onClick={() => loadTrail(name)}
                >
                  {label}
                </button>
              ))}
              {gates.length > 0 && (
                <select
                  className="remediation-language"
                  value={trail.gate}
                  onChange={(event) => setTrail((previous) => ({ ...previous, gate: event.target.value }))}
                  aria-label="Filter by gate"
                >
                  <option value="all">All gates ({trail.findings.length})</option>
                  {gates.map((gate) => (
                    <option key={gate} value={gate}>
                      {gate}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <FindingsTable findings={visible} />
            {trail.total > trail.findings.length && (
              <p className="table-cell-secondary">
                Showing {trail.findings.length} of {trail.total}.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default RemediationDetails;
