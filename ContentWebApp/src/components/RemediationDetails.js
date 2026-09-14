import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import rehypeRaw from "rehype-raw";
import "katex/dist/katex.min.css";

import { SEEDS_URL } from "../Constants";
import { Breadcrumb } from "./AllContent/shared/Breadcrumb";
import { Pagination } from "./ContentAggregatorDetails/Pagination";
import { textbookRemediationService } from "../services/textbookRemediationService";
import { normalizeMathDelimiters, MarkdownParagraph } from "./ContentAggregatorDetails/markdownMath";

import "./AllContent/AllContent.css";
import "./AllContent/shared/cards.css";
import "./AllContent/shared/buttons.css";
import "./AllContent/shared/tables.css";
import "./SyncHistoryPage.css";
import "./RemediationDetails.css";

function splitIntoPages(markdown) {
  if (!markdown) return [];
  const pageRegex = /<!--\s*page\s+(\d+)\s*-->/gi;
  const matches = [...markdown.matchAll(pageRegex)];

  if (matches.length === 0) {
    const chunks = [];
    const paragraphs = markdown.split(/\n\n+/);
    let currentChunk = "";
    let pageNum = 1;
    for (const p of paragraphs) {
      if (currentChunk.length + p.length > 3500 && currentChunk.length > 0) {
        chunks.push({ pageNum, content: currentChunk.trim() });
        pageNum++;
        currentChunk = p;
      } else {
        currentChunk = currentChunk ? `${currentChunk}\n\n${p}` : p;
      }
    }
    if (currentChunk.trim()) {
      chunks.push({ pageNum, content: currentChunk.trim() });
    }
    return chunks;
  }

  const pages = [];
  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    const pageNum = parseInt(match[1], 10);
    const startIndex = match.index;
    const endIndex = i + 1 < matches.length ? matches[i + 1].index : markdown.length;
    const content = markdown.slice(startIndex, endIndex).trim();
    pages.push({ pageNum, content });
  }
  return pages;
}

function MarkdownViewer({ text, jobId }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[rehypeRaw, rehypeKatex]}
      components={{
        p: MarkdownParagraph,
        img: ({ src, alt }) => {
          const filename = (src || "").replace(/^images\//, "");
          const imgSrc =
            src && !src.startsWith("http://") && !src.startsWith("https://") && !src.startsWith("data:")
              ? `${SEEDS_URL}/textbook-remediation/jobs/${jobId}/images/${filename}`
              : src;

          return (
            <div className="remediation-figure-preview">
              {imgSrc && (
                <img
                  src={imgSrc}
                  alt={alt || ""}
                  onError={(e) => {
                    e.currentTarget.style.display = "none";
                  }}
                />
              )}
              {alt ? (
                <div className="remediation-figure-text">
                  <span className="remediation-figure-tag">Figure Description</span>
                  <span className="remediation-figure-desc">{alt}</span>
                </div>
              ) : null}
            </div>
          );
        },
      }}
    >
      {normalizeMathDelimiters(text || "")}
    </ReactMarkdown>
  );
}

const RemediationDetails = () => {
  const { jobId } = useParams();
  const navigate = useNavigate();

  const [job, setJob] = useState(null);
  const [documents, setDocuments] = useState({});
  const [pageIdx, setPageIdx] = useState(0);
  const [error, setError] = useState(null);
  const [actionMessage, setActionMessage] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [draftText, setDraftText] = useState("");
  const [reviewSummary, setReviewSummary] = useState(null);

  const rawPages = useMemo(() => splitIntoPages(documents.raw), [documents.raw]);
  const correctedPages = useMemo(
    () => splitIntoPages(draftText || documents.corrected),
    [draftText, documents.corrected]
  );
  const totalPages = Math.max(rawPages.length, correctedPages.length);

  const currentRawPage = rawPages[pageIdx]?.content || (rawPages.length === 0 ? (documents.raw || "") : "");
  const currentCorrectedPage =
    correctedPages[pageIdx]?.content || (correctedPages.length === 0 ? (draftText || documents.corrected || "") : "");

  const flaggedPages = useMemo(() => {
    const pages = (reviewSummary?.flagged_items || []).map((item) => (item.page || 1) - 1);
    return [...new Set(pages)].sort((a, b) => a - b);
  }, [reviewSummary]);
  const currentPageFlags = (reviewSummary?.flagged_items || []).filter((item) => (item.page || 1) - 1 === pageIdx);

  const handleNextFlag = () => {
    const next = flaggedPages.find((p) => p > pageIdx);
    setPageIdx(next !== undefined ? next : flaggedPages[0]);
  };

  useEffect(() => {
    const controller = new AbortController();
    textbookRemediationService
      .getJob(jobId)
      .then((current) => {
        setJob(current);
        if (current.draft_remediated_md) {
          setDraftText(current.draft_remediated_md);
        }
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

  useEffect(() => {
    textbookRemediationService
      .getReviewSummary(jobId)
      .then((res) => setReviewSummary(res))
      .catch((summaryErr) => setError(summaryErr.message));
  }, [jobId]);

  const artifacts = useMemo(() => (job ? job.artifacts : {}), [job]);

  useEffect(() => {
    ["raw", "corrected"].forEach((name) => {
      if (!artifacts[name] || documents[name] !== undefined) return;
      textbookRemediationService
        .getArtifactText(jobId, name)
        .then((text) => {
          setDocuments((prev) => ({ ...prev, [name]: text }));
          if (name === "corrected" && !draftText) {
            setDraftText(text);
          }
        })
        .catch((textError) => setError(textError.message));
    });
  }, [artifacts, documents, draftText, jobId]);

  const handleSaveDraft = async () => {
    try {
      setActionMessage("Saving draft...");
      const updated = await textbookRemediationService.saveDraft(jobId, draftText || documents.corrected || "");
      setJob(updated);
      setActionMessage("Draft saved successfully.");
      setTimeout(() => setActionMessage(null), 3500);
    } catch (saveErr) {
      setError(saveErr.message);
      setActionMessage(null);
    }
  };

  const handleMarkVerified = async () => {
    try {
      setActionMessage("Marking verified and saving to Library...");
      const updated = await textbookRemediationService.markVerified(jobId, {
        title: job?.source_name?.replace(/\.pdf$/i, " (Accessible)"),
      });
      setJob(updated);
      setActionMessage("Textbook marked Verified and saved to Library.");
      setTimeout(() => setActionMessage(null), 4000);
    } catch (vErr) {
      setError(vErr.message);
      setActionMessage(null);
    }
  };

  const loadingDocs = !documents.raw && !documents.corrected && job && job.status === "completed";

  return (
    <div className="page">
      <div className="container" style={{ maxWidth: "1280px" }}>
        <Breadcrumb
          className="breadcrumb-standalone"
          items={[
            { label: "Home", onClick: () => navigate("/content") },
            { label: "Remediate", onClick: () => navigate("/content?tab=remediation") },
            { label: job ? job.source_name : jobId },
            { label: "Review" },
          ]}
        />

        {error && (
          <div className="card" style={{ borderColor: "#fee2e2", backgroundColor: "#fff5f5" }}>
            <p style={{ color: "var(--color-danger-fg)", margin: 0 }}>
              <strong>Error:</strong> {error}
            </p>
          </div>
        )}

        {!job && !error && (
          <div className="card" style={{ textAlign: "center", padding: "40px" }}>
            <p className="card-description">Loading textbook remediation record…</p>
          </div>
        )}

        {job && (
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            <div className="remediation-toolbar">
              <div>
                <h2 className="remediation-content-heading">{job.source_name}</h2>
                <div className="remediation-toolbar-meta">
                  <span>
                    Job <code>{job.job_id}</code>
                  </span>
                  <span>Language: {job.detected_language || job.language}</span>
                  <span>
                    Page {pageIdx + 1} of {Math.max(totalPages, 1)}
                  </span>
                  <span className={job.status === "verified" ? "gate-badge gate-badge-verified" : "gate-badge gate-badge-auto"}>
                    {job.status === "verified" ? "✓ Verified" : "Needs review"}
                  </span>
                </div>
              </div>

              <div className="button-group">
                <button type="button" className="action-ghost-button" onClick={handleSaveDraft}>
                  Save draft
                </button>

                {job.status !== "verified" ? (
                  <button type="button" className="primary-button" onClick={handleMarkVerified}>
                    Done — mark Verified
                  </button>
                ) : (
                  <span className="gate-badge gate-badge-verified" style={{ padding: "6px 12px" }}>
                    ✓ Verified & Saved to Library
                  </span>
                )}

                {job.artifacts.docx && (
                  <button
                    type="button"
                    className="action-ghost-button"
                    onClick={() =>
                      textbookRemediationService.downloadArtifact(
                        job.job_id,
                        "docx",
                        `${job.source_name.replace(/\.pdf$/i, "")}.docx`
                      )
                    }
                  >
                    Download Word
                  </button>
                )}
              </div>
            </div>

            {actionMessage && (
              <div style={{ margin: "12px 24px 0", backgroundColor: "#f0fdf4", border: "1px solid #bbf7d0", color: "#166534", padding: "10px 14px", borderRadius: "8px", fontSize: "14px", fontWeight: 500 }}>
                {actionMessage}
              </div>
            )}

            <div className="remediation-panes">
              <div className="remediation-pane">
                <div className="remediation-pane-header">
                  <span>Source (read-only)</span>
                  <span className="table-cell-secondary">Raw OCR · page {pageIdx + 1}</span>
                </div>
                <div className="remediation-pane-body">
                  {loadingDocs ? (
                    <p className="card-description">Loading document…</p>
                  ) : (
                    <MarkdownViewer text={currentRawPage} jobId={jobId} />
                  )}
                </div>
                <div className="remediation-pane-footer">
                  <Pagination current={pageIdx} total={totalPages} onChange={setPageIdx} />
                </div>
              </div>

              <div className="remediation-pane">
                <div className="remediation-pane-header">
                  <span>Remediated content{isEditing ? " — editing" : ""}</span>
                  <button
                    type="button"
                    className="action-ghost-button"
                    style={{ padding: "4px 10px", fontSize: "12px" }}
                    onClick={() => setIsEditing(!isEditing)}
                  >
                    {isEditing ? "Preview" : "Edit"}
                  </button>
                </div>
                <div className="remediation-pane-body">
                  {loadingDocs ? (
                    <p className="card-description">Loading document…</p>
                  ) : isEditing ? (
                    <textarea
                      value={draftText}
                      onChange={(e) => setDraftText(e.target.value)}
                      style={{
                        width: "100%",
                        minHeight: "440px",
                        fontFamily: "monospace",
                        fontSize: "13px",
                        lineHeight: 1.5,
                        padding: "12px",
                        borderRadius: "6px",
                        border: "1px solid #cbd5e1",
                        outline: "none",
                        boxSizing: "border-box",
                      }}
                      placeholder="Edit accessible markdown, figure alt-text, and summaries..."
                    />
                  ) : (
                    <>
                      {flaggedPages.length > 0 && (
                        <div className="remediation-flag-banner">
                          <span>
                            {flaggedPages.length} page{flaggedPages.length > 1 ? "s" : ""} need a check
                          </span>
                          <button type="button" onClick={handleNextFlag} style={{ background: "none", border: "none", color: "inherit", font: "inherit", fontWeight: 600, cursor: "pointer", padding: 0 }}>
                            Jump to next &rsaquo;
                          </button>
                        </div>
                      )}
                      <MarkdownViewer text={currentCorrectedPage} jobId={jobId} />
                      {currentPageFlags.map((flag) => (
                        <div key={flag.id} className="remediation-diagram-marker">
                          ⚠️ {flag.reason}
                          {flag.text ? `: ${flag.text}` : ""}
                        </div>
                      ))}
                    </>
                  )}
                </div>
                <div className="remediation-pane-footer">
                  <Pagination current={pageIdx} total={totalPages} onChange={setPageIdx} />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default RemediationDetails;
