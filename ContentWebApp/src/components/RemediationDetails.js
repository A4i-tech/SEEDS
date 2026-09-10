import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";

import { SEEDS_URL } from "../Constants";
import { useAuth } from "../hooks/useAuth";
import AppHeader from "./AllContent/Header/AppHeader";
import { Breadcrumb } from "./AllContent/shared/Breadcrumb";
import { Pagination } from "./ContentAggregatorDetails/Pagination";
import { textbookRemediationService } from "../services/textbookRemediationService";
import { normalizeMathDelimiters, MarkdownParagraph } from "./ContentAggregatorDetails/markdownMath";

import "./AllContent/AllContent.css";
import "./AllContent/shared/cards.css";
import "./AllContent/shared/buttons.css";
import "./AllContent/shared/tables.css";
import "./AllContent/ContentTab/css/ContentTab.css";
import "./AllContent/AnalyticsTab/css/AnalyticsStats.css";
import "./SyncHistoryPage.css";
import "./RemediationDetails.css";

const TRAILS = [
  { name: "findings", label: "OCR Review & Corrections" },
  { name: "remediation", label: "Remediation Changes" },
  { name: "unresolved", label: "Unresolved Figures" },
];

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function formatNumber(num) {
  if (num === null || num === undefined) return "0";
  return num.toLocaleString();
}

/** Splits long Markdown by page comments or chunks so the browser never chokes on large documents */
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

/** Markdown renderer that renders the image crop and its accessible figure description */
function MarkdownViewer({ text, jobId }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[rehypeKatex]}
      components={{
        p: MarkdownParagraph,
        img: ({ src, alt }) => {
          const imgSrc =
            src && !src.startsWith("http://") && !src.startsWith("https://") && !src.startsWith("data:")
              ? `${SEEDS_URL}/textbook-remediation/jobs/${jobId}/images/${src}`
              : src;

          return (
            <div className="remediation-figure-preview">
              {imgSrc && (
                <div style={{ marginBottom: "10px", textAlign: "center" }}>
                  <img
                    src={imgSrc}
                    alt={alt || "Extracted figure"}
                    style={{
                      maxWidth: "100%",
                      maxHeight: "320px",
                      borderRadius: "6px",
                      border: "1px solid #e2e8f0",
                      objectFit: "contain",
                      backgroundColor: "#ffffff",
                    }}
                    onError={(e) => {
                      e.currentTarget.style.display = "none";
                    }}
                  />
                </div>
              )}
              <span className="remediation-figure-tag">Figure Description</span>
              <span className="remediation-figure-desc">{alt || "Visual asset extracted from textbook"}</span>
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
  const { getCurrentUser, logout } = useAuth();
  const [currentUser, setCurrentUser] = useState("User");

  useEffect(() => {
    if (getCurrentUser) {
      getCurrentUser()
        .then((u) => {
          if (u) {
            const name = typeof u === "string" ? u : u.name || u.email || "User";
            setCurrentUser(name);
          }
        })
        .catch(() => {});
    }
  }, [getCurrentUser]);

  const [job, setJob] = useState(null);
  const [documents, setDocuments] = useState({});
  const [diffPageIdx, setDiffPageIdx] = useState(0);
  const [trail, setTrail] = useState({ name: "findings", findings: [], total: 0, gate: "all" });
  const [error, setError] = useState(null);
  const [actionMessage, setActionMessage] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [draftText, setDraftText] = useState("");
  const [reviewSummary, setReviewSummary] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(0);
  const [expandedRows, setExpandedRows] = useState({});
  const [appliedFindings, setAppliedFindings] = useState({});
  const [dismissedFindings, setDismissedFindings] = useState({});
  const pageSize = 15;

  const handleApplyFinding = (item, rowKey) => {
    if (!item.original || item.replacement === undefined) return;
    const current = draftText || documents.corrected || "";
    if (current.includes(item.original)) {
      const updated = current.replace(item.original, item.replacement);
      setDraftText(updated);
      setAppliedFindings((prev) => ({ ...prev, [rowKey]: true }));
      setActionMessage(`Applied fix: "${item.original}" → "${item.replacement}"`);
      setTimeout(() => setActionMessage(null), 3000);
    } else {
      setActionMessage(`Could not locate exact original text in current draft.`);
      setTimeout(() => setActionMessage(null), 3000);
    }
  };

  const handleDismissFinding = (rowKey) => {
    setDismissedFindings((prev) => ({ ...prev, [rowKey]: true }));
  };

  const rawPages = useMemo(() => splitIntoPages(documents.raw), [documents.raw]);
  const correctedPages = useMemo(
    () => splitIntoPages(draftText || documents.corrected),
    [draftText, documents.corrected]
  );
  const diffTotalPages = Math.max(rawPages.length, correctedPages.length);

  const currentRawPage = rawPages[diffPageIdx]?.content || (rawPages.length === 0 ? (documents.raw || "") : "");
  const currentCorrectedPage =
    correctedPages[diffPageIdx]?.content || (correctedPages.length === 0 ? (draftText || documents.corrected || "") : "");

  // Stream or poll Job status
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

  // Fetch Review Summary
  useEffect(() => {
    textbookRemediationService
      .getReviewSummary(jobId)
      .then((res) => setReviewSummary(res))
      .catch(() => {});
  }, [jobId]);

  const artifacts = useMemo(() => job?.artifacts || {}, [job]);

  // Load raw.md and raw.corrected.md documents
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

  // Load trail findings
  const loadTrail = useCallback(
    async (name) => {
      if (!artifacts[name]) {
        setTrail({ name, findings: [], total: 0, gate: "all" });
        return;
      }
      try {
        const data = await textbookRemediationService.getFindings(jobId, { name, limit: 500 });
        setTrail({ name, findings: data.findings || [], total: data.total || 0, gate: "all" });
        setPage(0);
        setExpandedRows({});
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

  // Filtered findings
  const gates = useMemo(
    () => [...new Set(trail.findings.map((f) => f.gate).filter(Boolean))],
    [trail.findings]
  );

  const filteredFindings = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return trail.findings.filter((item) => {
      if (trail.gate !== "all" && item.gate !== trail.gate) return false;
      if (!q) return true;
      return (
        (item.rule && String(item.rule).toLowerCase().includes(q)) ||
        (item.original && String(item.original).toLowerCase().includes(q)) ||
        (item.replacement && String(item.replacement).toLowerCase().includes(q)) ||
        (item.reason && String(item.reason).toLowerCase().includes(q)) ||
        (item.type && String(item.type).toLowerCase().includes(q)) ||
        (item.unit_id && String(item.unit_id).toLowerCase().includes(q)) ||
        (item.alt_text && String(item.alt_text).toLowerCase().includes(q))
      );
    });
  }, [trail.findings, trail.gate, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredFindings.length / pageSize));
  const currentPageItems = useMemo(() => {
    const start = page * pageSize;
    return filteredFindings.slice(start, start + pageSize);
  }, [filteredFindings, page, pageSize]);

  const toggleRowExpand = (id) => {
    setExpandedRows((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const counts = job?.counts || {};
  const isRunning = job?.status === "running";
  const loadingDocs = !documents.raw && !documents.corrected && job?.status === "completed";

  return (
    <div className="page">
      <div className="container" style={{ maxWidth: "1360px" }}>
        <AppHeader
          activeTab="content"
          onTabChange={(tab) => navigate(`/content?tab=${tab}`)}
          currentUser={currentUser}
          onLogout={logout}
        />

        <Breadcrumb
          className="breadcrumb-standalone"
          items={[
            { label: "Home", onClick: () => navigate("/content") },
            { label: "Remediate", onClick: () => navigate("/content?tab=remediation") },
            { label: job?.source_name || jobId },
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
          <>
            {/* Top Overview Card */}
            <div className="card">
              <div className="card-header">
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px" }}>
                    <h2 className="card-title" style={{ margin: 0 }}>
                      {job.source_name}
                    </h2>
                    <span className={`sync-history-job-status sync-history-job-status-${job.status}`}>
                      {job.status}
                    </span>
                  </div>
                  <div className="card-description">
                    PDF to Accessible Word document remediation pipeline
                  </div>
                </div>

                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
                  <button
                    type="button"
                    className="action-ghost-button"
                    onClick={() => setIsEditing(!isEditing)}
                  >
                    {isEditing ? "Preview Mode" : "Edit Remediated Text"}
                  </button>

                  <button
                    type="button"
                    className="action-ghost-button"
                    onClick={handleSaveDraft}
                  >
                    Save draft
                  </button>

                  {job.status !== "verified" ? (
                    <button
                      type="button"
                      className="primary-button"
                      onClick={handleMarkVerified}
                    >
                      Done — mark Verified
                    </button>
                  ) : (
                    <span className="gate-badge gate-badge-auto" style={{ padding: "6px 12px" }}>
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
                <div style={{ backgroundColor: "#f0fdf4", border: "1px solid #bbf7d0", color: "#166534", padding: "10px 14px", borderRadius: "8px", marginTop: "12px", fontSize: "14px", fontWeight: 500 }}>
                  {actionMessage}
                </div>
              )}

              {/* Wireframe Domain Metric Summary Banner */}
              {reviewSummary && (
                <div style={{ display: "flex", gap: "16px", flexWrap: "wrap", alignItems: "center", marginTop: "12px", padding: "10px 14px", backgroundColor: "#f8fafc", borderRadius: "8px", border: "1px solid #e2e8f0", fontSize: "13px" }}>
                  <span style={{ fontWeight: 600, color: "#0f172a" }}>Review Summary:</span>
                  <span style={{ color: "#334155" }}>📊 {reviewSummary.diagrams_described_count || 0} diagrams described</span>
                  <span style={{ color: "#334155" }}>📋 {reviewSummary.tables_fixed_count || 0} tables fixed</span>
                  <span style={{ color: (reviewSummary.flagged_items_count > 0 ? "#b91c1c" : "#15803d"), fontWeight: 600 }}>
                    ⚠️ {reviewSummary.flagged_items_count || 0} places need a check
                  </span>
                </div>
              )}

              {/* Real-time Progress Bar */}
              {isRunning && (
                <div className="content-aggregator-sync-all-progress" style={{ margin: "14px 0 6px" }}>
                  <div className="content-aggregator-sync-all-progress-track">
                    <div
                      className="content-aggregator-sync-all-progress-fill"
                      style={{ width: `${job.progress?.percent || 25}%` }}
                    />
                  </div>
                  <span className="content-aggregator-sync-all-progress-label">
                    {job.progress?.message || `Stage: ${job.stage || "processing"}...`}
                  </span>
                </div>
              )}

              {/* SEEDS Standard Stat Cards */}
              <div className="stat-cards" style={{ marginTop: "16px" }}>
                <div className="stat-card" style={{ "--stat-accent": "var(--color-primary)" }}>
                  <div className="stat-label">Raw OCR Characters</div>
                  <div className="stat-value">{formatNumber(counts.raw_chars)}</div>
                </div>

                <div className="stat-card" style={{ "--stat-accent": "var(--color-stat-purple)" }}>
                  <div className="stat-label">Audit Findings</div>
                  <div className="stat-value">{formatNumber(counts.findings)}</div>
                </div>

                <div className="stat-card" style={{ "--stat-accent": "var(--color-stat-green)" }}>
                  <div className="stat-label">Remediation Changes</div>
                  <div className="stat-value">{formatNumber(counts.remediation_changes)}</div>
                </div>

                <div className="stat-card" style={{ "--stat-accent": "var(--color-stat-blue)" }}>
                  <div className="stat-label">Output DOCX Size</div>
                  <div className="stat-value">{formatBytes(counts.docx_bytes)}</div>
                </div>

                <div className="stat-card" style={{ "--stat-accent": "var(--color-stat-orange)" }}>
                  <div className="stat-label">Unresolved Figures</div>
                  <div className="stat-value">{formatNumber(counts.unresolved_images)}</div>
                </div>

                <div className="stat-card" style={{ "--stat-accent": "var(--color-secondary)" }}>
                  <div className="stat-label">Language</div>
                  <div className="stat-value" style={{ textTransform: "capitalize", fontSize: "24px" }}>
                    {job.detected_language || (job.language && job.language !== "auto" && job.language !== "detecting" ? job.language : "Detecting…")}
                  </div>
                </div>
              </div>
            </div>

            {/* Side-by-Side Diff Section */}
            <div className="card">
              <div className="card-header">
                <div>
                  <h3 className="card-title">OCR vs. Remediated Output Comparison</h3>
                  <div className="card-description">
                    Side-by-side inspection of raw OCR output against post-corrected Markdown
                  </div>
                </div>

                {diffTotalPages > 1 && (
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                    <button
                      type="button"
                      className="action-ghost-button"
                      style={{ padding: "5px 12px", fontSize: "13px" }}
                      disabled={diffPageIdx === 0}
                      onClick={() => setDiffPageIdx((p) => Math.max(0, p - 1))}
                    >
                      ← Previous Page
                    </button>

                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <select
                        value={diffPageIdx}
                        onChange={(e) => setDiffPageIdx(Number(e.target.value))}
                        style={{
                          border: "1px solid #e2e8f0",
                          borderRadius: "8px",
                          padding: "5px 10px",
                          fontSize: "13px",
                          background: "#ffffff",
                          fontWeight: 600,
                          color: "#0f172a",
                        }}
                      >
                        {Array.from({ length: diffTotalPages }).map((_, idx) => (
                          <option key={idx} value={idx}>
                            Page {idx + 1}
                          </option>
                        ))}
                      </select>
                      <span style={{ fontSize: "13px", color: "#64748b" }}>
                        of {diffTotalPages}
                      </span>
                    </div>

                    <button
                      type="button"
                      className="action-ghost-button"
                      style={{ padding: "5px 12px", fontSize: "13px" }}
                      disabled={diffPageIdx >= diffTotalPages - 1}
                      onClick={() => setDiffPageIdx((p) => Math.min(diffTotalPages - 1, p + 1))}
                    >
                      Next Page →
                    </button>
                  </div>
                )}
              </div>

              <div className="remediation-diff-container">
                <div className="remediation-diff-pane">
                  <div className="remediation-pane-header">
                    <span>
                      Raw OCR Output {diffTotalPages > 1 ? `(Page ${diffPageIdx + 1} of ${diffTotalPages})` : `(${formatBytes(counts.raw_chars)})`}
                    </span>
                  </div>
                  <div className="remediation-pane-body">
                    {loadingDocs ? (
                      <p className="card-description">Loading raw Markdown…</p>
                    ) : (
                      <MarkdownViewer text={currentRawPage} jobId={jobId} />
                    )}
                  </div>
                </div>

                <div className="remediation-diff-pane">
                  <div className="remediation-pane-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span>
                      Remediated & Reviewed Markdown {diffTotalPages > 1 ? `(Page ${diffPageIdx + 1} of ${diffTotalPages})` : ""} {isEditing ? "— [EDITING]" : ""}
                    </span>
                    {isEditing && (
                      <span style={{ fontSize: "12px", color: "var(--color-primary)", fontWeight: 600 }}>
                        Interactive Edit Mode Active
                      </span>
                    )}
                  </div>
                  <div className="remediation-pane-body">
                    {loadingDocs ? (
                      <p className="card-description">Loading remediated Markdown…</p>
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
                      <MarkdownViewer text={currentCorrectedPage} jobId={jobId} />
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Findings & Audit Trail Section */}
            <div className="card">
              <div className="card-header">
                <div>
                  <h3 className="card-title">Pipeline Audit & Findings Trail</h3>
                  <div className="card-description">
                    Detailed record of every correction, quality finding, and remediation decision
                  </div>
                </div>
              </div>

              {/* SEEDS Standard Segmented Tabs */}
              <div className="tabs-container" style={{ marginBottom: "16px" }}>
                {TRAILS.map(({ name, label }) => (
                  <button
                    key={name}
                    type="button"
                    className={`tab-button ${trail.name === name ? "active" : ""}`}
                    disabled={!artifacts[name]}
                    onClick={() => loadTrail(name)}
                  >
                    {label} {trail.name === name && trail.total > 0 ? `(${trail.total})` : ""}
                  </button>
                ))}
              </div>

              {/* Search and Filters */}
              <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap", marginBottom: "16px" }}>
                <input
                  type="text"
                  placeholder="Search findings, words..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setPage(0);
                  }}
                  style={{
                    border: "1px solid #e2e8f0",
                    borderRadius: "8px",
                    padding: "8px 12px",
                    fontSize: "13px",
                    minWidth: "220px",
                  }}
                />

                {gates.length > 0 && (
                  <select
                    value={trail.gate}
                    onChange={(e) => {
                      setTrail((prev) => ({ ...prev, gate: e.target.value }));
                      setPage(0);
                    }}
                    style={{
                      border: "1px solid #e2e8f0",
                      borderRadius: "8px",
                      padding: "8px 12px",
                      fontSize: "13px",
                      backgroundColor: "#fff",
                    }}
                  >
                    <option value="all">All Gates ({trail.findings.length})</option>
                    {gates.map((g) => (
                      <option key={g} value={g}>
                        {g}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Findings Content Table */}
              <div className="table-wrapper" style={{ marginTop: 0 }}>
                <table className="content-table">
                  <thead>
                    <tr>
                      <th className="table-header" style={{ width: "70px" }}>#</th>
                      <th className="table-header" style={{ width: "160px" }}>Rule / Gate</th>
                      <th className="table-header">Original / Context</th>
                      <th className="table-header">Correction / Finding</th>
                      <th className="table-header" style={{ width: "180px" }}>Review Actions / Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentPageItems.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="table-cell" style={{ textAlign: "center", padding: "24px" }}>
                          {trail.findings.length === 0 ? "No findings recorded in this trail." : "No matching items found."}
                        </td>
                      </tr>
                    ) : (
                      currentPageItems.map((item, idx) => {
                        const rowKey = `${page}-${idx}`;
                        const isExpanded = !!expandedRows[rowKey];
                        const gateName = item.gate || (item.applied ? "auto_applied" : "queued");

                        return (
                          <React.Fragment key={rowKey}>
                            <tr>
                              <td className="table-cell" style={{ textAlign: "center", color: "#64748b" }}>
                                {page * pageSize + idx + 1}
                              </td>

                              <td className="table-cell" style={{ textAlign: "left" }}>
                                <div style={{ fontWeight: 600 }}>{item.rule || item.type || "Finding"}</div>
                                <span
                                  className={`gate-badge ${
                                    gateName === "auto_applied"
                                      ? "gate-badge-auto"
                                      : gateName === "rejected" || gateName === "blocked"
                                      ? "gate-badge-rejected"
                                      : "gate-badge-queued"
                                  }`}
                                  style={{ marginTop: "4px" }}
                                >
                                  {gateName}
                                </span>
                              </td>

                              <td className="table-cell" style={{ textAlign: "left", whiteSpace: "normal" }}>
                                <code>{item.original || item.text || item.src || "(none)"}</code>
                              </td>

                              <td className="table-cell" style={{ textAlign: "left", whiteSpace: "normal" }}>
                                <div>{item.replacement || item.reason || item.alt_text || "—"}</div>
                              </td>

                              <td className="table-cell" style={{ textAlign: "center" }}>
                                <div style={{ display: "flex", gap: "6px", justifyContent: "center", alignItems: "center", flexWrap: "wrap" }}>
                                  {appliedFindings[rowKey] ? (
                                    <span className="gate-badge gate-badge-auto" style={{ fontSize: "11px", padding: "2px 6px" }}>
                                      ✓ Applied
                                    </span>
                                  ) : dismissedFindings[rowKey] ? (
                                    <span style={{ fontSize: "11px", color: "#64748b", padding: "2px 6px" }}>
                                      Dismissed
                                    </span>
                                  ) : (
                                    <>
                                      {item.original && item.replacement !== undefined && (
                                        <button
                                          type="button"
                                          className="primary-button"
                                          style={{ padding: "3px 8px", fontSize: "11px" }}
                                          onClick={() => handleApplyFinding(item, rowKey)}
                                          title="Apply AI suggestion directly to draft markdown"
                                        >
                                          Apply fix
                                        </button>
                                      )}
                                      <button
                                        type="button"
                                        className="action-ghost-button"
                                        style={{ padding: "3px 8px", fontSize: "11px" }}
                                        onClick={() => handleDismissFinding(rowKey)}
                                        title="Dismiss finding"
                                      >
                                        Dismiss
                                      </button>
                                    </>
                                  )}
                                  <button
                                    type="button"
                                    className="action-ghost-button"
                                    style={{ padding: "3px 8px", fontSize: "11px" }}
                                    onClick={() => toggleRowExpand(rowKey)}
                                  >
                                    {isExpanded ? "Hide" : "Inspect"}
                                  </button>
                                </div>
                              </td>
                            </tr>

                            {isExpanded && (
                              <tr>
                                <td colSpan={5} style={{ padding: 0 }}>
                                  <div className="finding-drawer">
                                    {item.context_before && (
                                      <div style={{ marginBottom: "8px" }}>
                                        <div className="finding-drawer-label">Context Before:</div>
                                        <div className="finding-code-block">{item.context_before}</div>
                                      </div>
                                    )}
                                    {item.context_after && (
                                      <div style={{ marginBottom: "8px" }}>
                                        <div className="finding-drawer-label">Context After:</div>
                                        <div className="finding-code-block">{item.context_after}</div>
                                      </div>
                                    )}
                                    <div>
                                      <div className="finding-drawer-label">Complete Metadata:</div>
                                      <div className="finding-code-block">{JSON.stringify(item, null, 2)}</div>
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* SEEDS Standard Pagination */}
              <Pagination current={page} total={totalPages} onChange={(p) => setPage(p)} />
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default RemediationDetails;
