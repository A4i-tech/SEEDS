import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import "katex/dist/katex.min.css";

import { Breadcrumb } from "./AllContent/shared/Breadcrumb";
import { ConfirmModal } from "./AllContent/shared/ConfirmModal";
import { Pagination } from "./ContentAggregatorDetails/Pagination";
import { textbookRemediationService } from "../services/textbookRemediationService";
import { MarkdownViewer } from "./RemediationMarkdownView";
import { RemediationPageEditor } from "./RemediationPageEditor";
import { replacePageInDocument, splitIntoPages } from "./remediationBlocks";
import { isRemediationDone, JOB_STATUS } from "../utils/remediationStatus";
import { ARTIFACT_DOWNLOADS } from "./artifactDownloads";
import { RemediationRunDetails } from "./RemediationRunDetails";

import "./AllContent/AllContent.css";
import "./AllContent/shared/cards.css";
import "./AllContent/shared/buttons.css";
import "./AllContent/shared/tables.css";
import "./SyncHistoryPage.css";
import "./RemediationDetails.css";

const pageContent = (pages, index, fallback) =>
  pages.length ? pages[index]?.content ?? "" : fallback;

const ARTIFACT_LABELS = {
  docx: "Download Word",
  pdf: "Download PDF",
  tex: "Download LaTeX",
  translated_docx: "Download translated Word",
  translated_pdf: "Download translated PDF",
  translated_tex: "Download translated LaTeX",
};

const OriginalScan = ({ hasPageImages, sourcePageUrl, sourcePdfUrl, bookPageNum }) => {
  if (hasPageImages) {
    if (!sourcePageUrl) return <p className="card-description">Loading scan…</p>;
    return (
      <img
        src={sourcePageUrl}
        alt={`Original scan, page ${bookPageNum}`}
        style={{ display: "block", width: "100%", height: "auto" }}
      />
    );
  }
  if (!sourcePdfUrl) return <p className="card-description">Loading scan…</p>;
  return (
    <>
      <p className="card-description">Page images are not available for this job. Showing the full PDF.</p>
      <iframe
        key={bookPageNum}
        title="Original scan"
        src={`${sourcePdfUrl}#page=${bookPageNum}&view=Fit`}
        style={{ width: "100%", height: "100%", minHeight: "520px", border: "none" }}
      />
    </>
  );
};

const RemediationDetails = () => {
  const { jobId } = useParams();
  const navigate = useNavigate();

  const [job, setJob] = useState(null);
  const [documents, setDocuments] = useState({});
  const [pageIdx, setPageIdx] = useState(0);
  const [error, setError] = useState(null);
  const [actionMessage, setActionMessage] = useState(null);
  const [draftText, setDraftText] = useState("");
  const [reviewSummary, setReviewSummary] = useState({ flagged_items: [] });
  const hasSeededDraftRef = useRef(false);
  const [showOcrText, setShowOcrText] = useState(false);
  const [sourcePdfUrl, setSourcePdfUrl] = useState(null);
  const [sourcePageUrl, setSourcePageUrl] = useState(null);
  const [isDirty, setIsDirty] = useState(false);
  const [pendingNav, setPendingNav] = useState(null);

  const rawPages = useMemo(() => splitIntoPages(documents.raw), [documents.raw]);
  const correctedPages = useMemo(
    () => splitIntoPages(job?.draft_remediated_md || documents.corrected),
    [job?.draft_remediated_md, documents.corrected]
  );
  const totalPages = Math.max(rawPages.length, correctedPages.length);

  const currentRawPage = pageContent(rawPages, pageIdx, documents.raw || "");
  const draftPages = useMemo(() => splitIntoPages(draftText), [draftText]);
  const currentDraftPage = pageContent(draftPages, pageIdx, draftText || "");

  const pageIndexForNum = useCallback(
    (pageNum) => {
      const idx = correctedPages.findIndex((p) => p.pageNum === pageNum);
      if (idx !== -1) return idx;
      const rawIdx = rawPages.findIndex((p) => p.pageNum === pageNum);
      return rawIdx !== -1 ? rawIdx : 0;
    },
    [correctedPages, rawPages]
  );

  const bookPageNum = correctedPages[pageIdx]?.pageNum ?? rawPages[pageIdx]?.pageNum ?? pageIdx + 1;

  const flaggedPages = useMemo(() => {
    const pages = reviewSummary.flagged_items.map((item) => pageIndexForNum(item.page || 1));
    return [...new Set(pages)].sort((a, b) => a - b);
  }, [reviewSummary, pageIndexForNum]);
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
        if (current.status === JOB_STATUS.PENDING || current.status === JOB_STATUS.RUNNING) {
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

  const jobLoaded = Boolean(job);
  useEffect(() => {
    if (!jobLoaded || job?.source_page_count) return undefined;
    const controller = new AbortController();
    let url;
    const loadSourcePdf = async () => {
      try {
        const blob = await textbookRemediationService.getSourcePdf(jobId, { signal: controller.signal });
        if (controller.signal.aborted) return;
        url = URL.createObjectURL(blob);
        setSourcePdfUrl(url);
      } catch (pdfError) {
        if (!controller.signal.aborted) setError(pdfError.message);
      }
    };
    loadSourcePdf();
    return () => {
      controller.abort();
      if (url) URL.revokeObjectURL(url);
    };
  }, [jobId, jobLoaded, job?.source_page_count]);

  useEffect(() => {
    if (!job?.source_page_count) return undefined;
    const controller = new AbortController();
    let url;
    setSourcePageUrl(null);
    const loadSourcePage = async () => {
      try {
        const blob = await textbookRemediationService.getSourcePage(jobId, bookPageNum, { signal: controller.signal });
        if (controller.signal.aborted) return;
        url = URL.createObjectURL(blob);
        setSourcePageUrl(url);
      } catch (pageError) {
        if (!controller.signal.aborted) setError(pageError.message);
      }
    };
    loadSourcePage();
    return () => {
      controller.abort();
      if (url) URL.revokeObjectURL(url);
    };
  }, [jobId, job?.source_page_count, bookPageNum]);

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

  const handleSaveDraft = async ({ silent = false } = {}) => {
    try {
      if (!silent) setActionMessage("Saving draft...");
      const updated = await textbookRemediationService.saveDraft(jobId, draftText || documents.corrected || "");
      setJob(updated);
      setIsDirty(false);
      if (!silent) {
        setActionMessage("Draft saved successfully.");
        setTimeout(() => setActionMessage(null), 3500);
      }
      return updated;
    } catch (saveErr) {
      setError(saveErr.message);
      setActionMessage(null);
      throw saveErr;
    }
  };

  useEffect(() => {
    const handler = (event) => {
      if (!isDirty) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  const unmountingRef = useRef(false);
  useEffect(() => {
    unmountingRef.current = false;
    return () => {
      unmountingRef.current = true;
    };
  }, []);

  useEffect(() => {
    if (!isDirty) return undefined;
    window.history.pushState(null, "", window.location.href);
    const handler = () => {
      if (window.confirm("You have unsaved changes. Leave without saving?")) {
        window.removeEventListener("popstate", handler);
        window.history.back();
      } else {
        window.history.pushState(null, "", window.location.href);
      }
    };
    window.addEventListener("popstate", handler);
    return () => {
      window.removeEventListener("popstate", handler);
      if (unmountingRef.current) window.history.back();
    };
  }, [isDirty]);

  const guardNavigate = (onLeave) => {
    if (!isDirty) {
      onLeave();
      return;
    }
    setPendingNav({ onLeave });
  };

  const handlePageEdit = (newPageMd) => {
    setIsDirty(true);
    setDraftText((prev) => replacePageInDocument(prev, splitIntoPages(prev), pageIdx, newPageMd));
  };

  const handleMarkVerified = async () => {
    try {
      if (isDirty) {
        await handleSaveDraft({ silent: true });
      }
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
            { label: "Home", onClick: () => guardNavigate(() => navigate("/content")) },
            { label: "Remediate", onClick: () => guardNavigate(() => navigate("/content?tab=remediation")) },
            { label: job ? job.source_name : jobId },
            { label: "Review" },
          ]}
        />

        {pendingNav && (
          <ConfirmModal
            title="Unsaved changes"
            description="You have unsaved changes. Leave without saving?"
            confirmLabel="Leave"
            onCancel={() => setPendingNav(null)}
            onConfirm={() => {
              const { onLeave } = pendingNav;
              setPendingNav(null);
              setIsDirty(false);
              onLeave();
            }}
          />
        )}

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
                  <span className={job.status === JOB_STATUS.VERIFIED ? "gate-badge gate-badge-verified" : "gate-badge gate-badge-auto"}>
                    {job.status === JOB_STATUS.VERIFIED ? "✓ Verified" : "Needs review"}
                  </span>
                </div>
              </div>

              <div className="button-group">
                <button type="button" className="action-ghost-button" onClick={() => handleSaveDraft().catch(() => {})}>
                  Save draft
                </button>

                {job.status !== JOB_STATUS.VERIFIED ? (
                  <button type="button" className="primary-button" onClick={handleMarkVerified}>
                    Verify &amp; publish
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
                  return null;
                })}
              </div>
            </div>

            <RemediationRunDetails models={job.models} metrics={job.metrics} />

            <div aria-live="polite">
              {actionMessage && (
                <div className="remediation-action-message">
                  {actionMessage}
                </div>
              )}
            </div>

            <div className="remediation-panes">
              <div className="remediation-pane">
                <div className="remediation-pane-header">
                  <span>Original scan</span>
                  <button
                    type="button"
                    className="action-ghost-button"
                    style={{ padding: "4px 10px", fontSize: "12px" }}
                    onClick={() => setShowOcrText(!showOcrText)}
                  >
                    {showOcrText ? "Show scan" : "Show OCR text"}
                  </button>
                </div>
                <div className="remediation-pane-body">
                  {showOcrText ? (
                    loadingDocs ? (
                      <p className="card-description">Loading document…</p>
                    ) : (
                      <MarkdownViewer text={currentRawPage} jobId={jobId} />
                    )
                  ) : (
                    <OriginalScan
                      hasPageImages={Boolean(job.source_page_count)}
                      sourcePageUrl={sourcePageUrl}
                      sourcePdfUrl={sourcePdfUrl}
                      bookPageNum={bookPageNum}
                    />
                  )}
                </div>
                <div className="remediation-pane-footer">
                  <Pagination current={pageIdx} total={totalPages} onChange={setPageIdx} />
                </div>
              </div>

              <div className="remediation-pane">
                <div className="remediation-pane-header">
                  <span>Remediated content</span>
                </div>
                <div className="remediation-pane-body">
                  {loadingDocs ? (
                    <p className="card-description">Loading document…</p>
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
                      <RemediationPageEditor
                        key={bookPageNum}
                        jobId={jobId}
                        pageMarkdown={currentDraftPage}
                        onChange={handlePageEdit}
                      />
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
