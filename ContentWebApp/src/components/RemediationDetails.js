import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import "katex/dist/katex.min.css";

import { Breadcrumb } from "./AllContent/shared/Breadcrumb";
import { Pagination } from "./ContentAggregatorDetails/Pagination";
import { textbookRemediationService } from "../services/textbookRemediationService";
import { normalizeMathDelimiters, MarkdownParagraph } from "./ContentAggregatorDetails/markdownMath";
import { remediationRemarkPlugins, remediationRehypePlugins } from "./remediationMarkdown";
import { isRemediationDone } from "../utils/remediationStatus";
import { ARTIFACT_DOWNLOADS } from "./artifactDownloads";

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

const pageContent = (pages, index, fallback) =>
  pages.length ? pages[index]?.content ?? "" : fallback;

function RemediationFigureImage({ src, jobId, alt }) {
  const [objectUrl, setObjectUrl] = useState(null);
  const [imgError, setImgError] = useState(false);
  const remote = src && !src.startsWith("http://") && !src.startsWith("https://") && !src.startsWith("data:");

  useEffect(() => {
    if (!remote) return undefined;
    const controller = new AbortController();
    let url;
    textbookRemediationService
      .getImage(jobId, src.replace(/^images\//, ""), { signal: controller.signal })
      .then((blob) => {
        url = URL.createObjectURL(blob);
        setObjectUrl(url);
      })
      .catch((imageError) => {
        if (!controller.signal.aborted) {
          console.error("Failed to load remediation figure image", imageError);
          setObjectUrl(null);
        }
      });
    return () => {
      controller.abort();
      if (url) URL.revokeObjectURL(url);
    };
  }, [remote, jobId, src]);

  const imgSrc = remote ? objectUrl : src;
  if (!imgSrc) return null;
  if (imgError) {
    return (
      <span className="remediation-figure-broken">
        Image failed to load{alt ? `: ${alt}` : ""}
      </span>
    );
  }
  return (
    <img
      src={imgSrc}
      alt={alt || "Image description unavailable"}
      onError={() => setImgError(true)}
    />
  );
}

function MarkdownViewer({ text, jobId }) {
  return (
    <ReactMarkdown
      remarkPlugins={remediationRemarkPlugins}
      rehypePlugins={remediationRehypePlugins}
      components={{
        p: MarkdownParagraph,
        img: ({ src, alt, title }) => {
          const description = title || alt;

          return (
            <div className="remediation-figure-preview">
              <RemediationFigureImage src={src} jobId={jobId} alt={alt} />
              {description ? (
                <div className="remediation-figure-text">
                  <span className="remediation-figure-tag">Figure Description</span>
                  <span className="remediation-figure-desc">{description}</span>
                </div>
              ) : null}
            </div>
          );
        },
      }}
    >
      {normalizeMathDelimiters(text)}
    </ReactMarkdown>
  );
}

const ARTIFACT_LABELS = { docx: "Download Word", pdf: "Download PDF", tex: "Download LaTeX" };

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
  const [reviewSummary, setReviewSummary] = useState({ flagged_items: [] });
  const hasSeededDraftRef = useRef(false);

  const rawPages = useMemo(() => splitIntoPages(documents.raw), [documents.raw]);
  const correctedPages = useMemo(
    () => splitIntoPages(draftText || documents.corrected),
    [draftText, documents.corrected]
  );
  const totalPages = Math.max(rawPages.length, correctedPages.length);

  const currentRawPage = pageContent(rawPages, pageIdx, documents.raw || "");
  const currentCorrectedPage = pageContent(
    correctedPages,
    pageIdx,
    draftText || documents.corrected || ""
  );

  const pageIndexForNum = (pageNum) => {
    const idx = correctedPages.findIndex((p) => p.pageNum === pageNum);
    if (idx !== -1) return idx;
    const rawIdx = rawPages.findIndex((p) => p.pageNum === pageNum);
    return rawIdx !== -1 ? rawIdx : 0;
  };

  const flaggedPages = useMemo(() => {
    const pages = reviewSummary.flagged_items.map((item) => pageIndexForNum(item.page || 1));
    return [...new Set(pages)].sort((a, b) => a - b);
  }, [reviewSummary, correctedPages, rawPages]);
  const currentPageFlags = reviewSummary.flagged_items.filter(
    (item) => pageIndexForNum(item.page || 1) === pageIdx
  );

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
          hasSeededDraftRef.current = true;
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
    const controller = new AbortController();
    textbookRemediationService
      .getReviewSummary(jobId, { signal: controller.signal })
      .then((res) => setReviewSummary(res))
      .catch((summaryErr) => {
        if (!controller.signal.aborted) setError(summaryErr.message);
      });
    return () => controller.abort();
  }, [jobId]);

  const artifacts = useMemo(() => (job ? job.artifacts : {}), [job]);

  useEffect(() => {
    const controller = new AbortController();
    ["raw", "corrected"].forEach((name) => {
      if (!artifacts[name] || documents[name] !== undefined) return;
      textbookRemediationService
        .getArtifactText(jobId, name, { signal: controller.signal })
        .then((text) => {
          setDocuments((prev) => ({ ...prev, [name]: text }));
          if (name === "corrected" && !hasSeededDraftRef.current) {
            hasSeededDraftRef.current = true;
            setDraftText(text);
          }
        })
        .catch((textError) => {
          if (!controller.signal.aborted) setError(textError.message);
        });
    });
    return () => controller.abort();
  }, [artifacts, documents, jobId]);

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
        title: job.source_name.replace(/\.pdf$/i, " (Accessible)"),
      });
      setJob(updated);
      setActionMessage("Textbook marked Verified and saved to Library.");
      setTimeout(() => setActionMessage(null), 4000);
    } catch (vErr) {
      setError(vErr.message);
      setActionMessage(null);
    }
  };

  const loadingDocs = !documents.raw && !documents.corrected && job && isRemediationDone(job.status);

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
          <div className="card remediation-error-card">
            <p className="remediation-error-text">
              <strong>Error:</strong> {error}
            </p>
          </div>
        )}

        {job?.error && (
          <div className="card remediation-error-card">
            <p className="remediation-error-text">
              <strong>Job failed:</strong> {job.error}
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
                  <span className="gate-badge gate-badge-verified remediation-verified-badge">
                    ✓ Verified & Saved to Library
                  </span>
                )}

                {ARTIFACT_DOWNLOADS.some((entry) => job.artifacts[entry.key]) && (
                  <button
                    type="button"
                    className="action-ghost-button"
                    onClick={() =>
                      ARTIFACT_DOWNLOADS.forEach(
                        (entry) =>
                          job.artifacts[entry.key] &&
                          textbookRemediationService.downloadArtifact(
                            job.job_id,
                            entry.key,
                            `${job.source_name.replace(/\.pdf$/i, "")}.${entry.ext}`
                          )
                      )
                    }
                  >
                    Download all
                  </button>
                )}

                {ARTIFACT_DOWNLOADS.map((entry) => {
                  if (job.artifacts[entry.key]) {
                    return (
                      <button
                        key={entry.key}
                        type="button"
                        className="action-ghost-button"
                        onClick={() =>
                          textbookRemediationService.downloadArtifact(
                            job.job_id,
                            entry.key,
                            `${job.source_name.replace(/\.pdf$/i, "")}.${entry.ext}`
                          )
                        }
                      >
                        {ARTIFACT_LABELS[entry.key]}
                      </button>
                    );
                  }
                  if (entry.key === "pdf" && job.artifacts.docx && job.status === "verified") {
                    return (
                      <span key={entry.key} className="remediation-pdf-unavailable">
                        PDF unavailable
                      </span>
                    );
                  }
                  return null;
                })}
              </div>
            </div>

            {actionMessage && (
              <div className="remediation-action-message">
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
                      className="remediation-draft-editor"
                      placeholder="Edit accessible markdown, figure alt-text, and summaries..."
                    />
                  ) : (
                    <>
                      {flaggedPages.length > 0 && (
                        <div className="remediation-flag-banner">
                          <span>
                            {flaggedPages.length} page{flaggedPages.length > 1 ? "s" : ""} need a check
                          </span>
                          <button type="button" className="remediation-flag-jump" onClick={handleNextFlag}>
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
