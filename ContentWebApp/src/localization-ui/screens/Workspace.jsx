import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Skeleton, { SkeletonTheme } from "react-loading-skeleton";
import "react-loading-skeleton/dist/skeleton.css";
import Select from "../../components/AllContent/shared/Select";
import { Pagination } from "../../components/ContentAggregatorDetails/Pagination";
import "../workspace.css";
import { translationService } from "../../services/translationService";
import { toSegment } from "../lib/segments";
import { EmptyState, useToast } from "../primitives";

/** Status pill — every row shows exactly one state. */
function CardStatus({ seg }) {
  if (seg.stage === "approved") return <span className="tr-badge good">Approved</span>;
  if (seg.stage === "rejected") return <span className="tr-badge crit">Rejected</span>;
  return <span className="tr-badge warn">Pending Review</span>;
}

/** Translation card — autosaving inline editor. Auto-grows to fit full text, never clips. */
const TransCard = React.forwardRef(function TransCard({ seg, onEdit, onCopy }, inputRef) {
  const [text, setText] = useState(seg.translation);
  useEffect(() => setText(seg.translation), [seg.translation]);
  useEffect(() => {
    const el = inputRef && inputRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = el.scrollHeight + "px";
    }
  }, [text, inputRef]);
  const commit = () => {
    if (text !== seg.translation) onEdit(seg.id, text);
  };
  return (
    <div
      className={`tr-card ${seg.stage === "approved" ? "approved" : ""} ${seg.lowConfidence && seg.hasTranslation ? "warnedge" : ""}`}
    >
      <textarea
        ref={inputRef}
        className="tr-card-input"
        rows={1}
        value={text}
        placeholder="Add translation…"
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        aria-label={`Translation for: ${seg.sourceText}`}
      />
      <button
        type="button"
        className="tr-card-copy"
        title="Copy translation"
        aria-label="Copy translation"
        onClick={() => onCopy(text)}
      >
        Copy
      </button>
    </div>
  );
});

/** Row actions column — compact, vertically centered, always-visible Approve/Reject/Edit. */
function RowActions({ seg, onApprove, onReject, onEditFocus }) {
  const approved = seg.stage === "approved";
  return (
    <div className="tr-actions">
      <button
        className={`tr-act tr-act-approve btn-icon ${approved ? "active" : ""}`}
        title={approved ? "Approved" : "Approve"}
        aria-label="Approve"
        aria-pressed={approved}
        onClick={() => onApprove(seg.id)}
      >
        ✓
      </button>
      <button
        className={`tr-act tr-act-reject btn-icon ${approved ? "dim" : ""}`}
        title="Reject"
        aria-label="Reject"
        onClick={() => onReject(seg.id)}
      >
        ✕
      </button>
      <button
        className={`tr-act tr-act-edit btn-icon ${approved ? "dim" : ""}`}
        title="Edit"
        aria-label="Edit"
        onClick={onEditFocus}
      >
        Edit
      </button>
    </div>
  );
}

/** One row: index, source, editable translation, actions + status. */
function TransRow({ seg, idx, onEdit, onApprove, onReject, onCopy }) {
  const inputRef = useRef(null);
  const focusInput = () => {
    const el = inputRef.current;
    if (el) {
      el.focus();
      el.select();
    }
  };
  return (
    <div className="tr-row">
      <div className="tr-idx">{idx}</div>
      <div className="tr-src">{seg.sourceText}</div>
      <TransCard ref={inputRef} seg={seg} onEdit={onEdit} onCopy={onCopy} />
      <div className="tr-rowend">
        <RowActions seg={seg} onApprove={onApprove} onReject={onReject} onEditFocus={focusInput} />
        <CardStatus seg={seg} />
      </div>
    </div>
  );
}

export function WorkspaceScreen({
  scope,
  languages,
  sites = [],
  onScope,
  pages = [],
  pagesError = null,
}) {
  const { siteId, route, lang } = scope;
  const { toast } = useToast();
  const [docs, setDocs] = useState(null);
  const [docsError, setDocsError] = useState(null);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const [statusTab, setStatusTab] = useState("all");
  const rowsPerPage = 10;
  const [pageOffset, setPageOffset] = useState(0);
  const [revision, setRevision] = useState(0);
  const bodyRef = useRef(null);

  const load = useCallback(() => {
    if (!siteId || !route) {
      setDocs([]);
      setDocsError(null);
      return;
    }
    setDocs(null);
    setDocsError(null);
    translationService
      .listTranslations({ siteId, route })
      .then(async (d) => {
        let list = d;
        // Docs may exist without a draft for the currently selected Review Language
        // yet (extracted but never generated for this lang) — trigger on-demand
        // generation so the reviewer sees real translated text instead of a blank box.
        const missing = lang && list.some((doc) => !doc?.translations?.[lang]?.text);
        if (missing) {
          try {
            await translationService.generateForReview({ siteId, route, lang });
            list = await translationService.listTranslations({ siteId, route });
          } catch {
            /* keep already-fetched docs on failure */
          }
        }
        setDocs(list);
      })
      .catch((e) => {
        setDocs([]);
        setDocsError(e.status === 403 ? "forbidden" : e.message);
      });
  }, [siteId, route, lang]);
  useEffect(() => {
    load();
  }, [load]);

  const segments = useMemo(() => (docs ? docs.map((d) => toSegment(d, lang)) : []), [docs, lang]);
  const tabCounts = useMemo(
    () => ({
      pending: segments.filter((s) => s.stage !== "approved").length,
      approved: segments.filter((s) => s.stage === "approved").length,
      all: segments.length,
    }),
    [segments]
  );
  const filtered = useMemo(() => {
    let list = segments;
    if (statusTab === "pending") list = list.filter((s) => s.stage !== "approved");
    else if (statusTab === "approved") list = list.filter((s) => s.stage === "approved");
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter(
        (s) => s.sourceText.toLowerCase().includes(q) || s.translation.toLowerCase().includes(q)
      );
    }
    return list;
  }, [segments, statusTab, query]);

  useEffect(() => {
    setPageOffset(0);
  }, [route, lang, statusTab, query, rowsPerPage]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / rowsPerPage));
  const clampedOffset = Math.min(pageOffset, pageCount - 1);
  const pageSlice = useMemo(
    () => filtered.slice(clampedOffset * rowsPerPage, clampedOffset * rowsPerPage + rowsPerPage),
    [filtered, clampedOffset, rowsPerPage]
  );

  // docs is null while a load() is in flight (its loading sentinel). A patch
  // that lands during that window is a no-op — the in-flight load() sets the
  // authoritative docs — so skip it instead of mapping over null.
  const patchLocal = (id, f) =>
    setDocs((ds) => (ds ? ds.map((d) => (d.id === id ? { ...d, ...f } : d)) : ds));
  // Approval/rejection is per-language: patch only translations[lang].status
  // on the local doc so another language's displayed stage never changes.
  const patchLangStatus = (id, status) =>
    setDocs((ds) =>
      ds
        ? ds.map((d) => {
            if (d.id !== id) return d;
            const t = d.translations?.[lang] || {};
            return { ...d, translations: { ...d.translations, [lang]: { ...t, status } } };
          })
        : ds
    );
  const approve = async (id) => {
    try {
      await translationService.approveTranslation(id, lang);
      patchLangStatus(id, "approved");
      setSavedAt(Date.now());
      toast({
        message: "Approved",
        tone: "good",
        onUndo: async () => {
          await translationService.rejectTranslation(id, lang, "undo");
          patchLangStatus(id, "rejected");
        },
      });
    } catch (e) {
      toast({ message: e.message, tone: "crit" });
    }
  };
  const reject = async (id) => {
    try {
      await translationService.rejectTranslation(id, lang, "needs work");
      patchLangStatus(id, "rejected");
      toast({ message: "Rejected", tone: "info" });
    } catch (e) {
      toast({ message: e.message, tone: "crit" });
    }
  };
  const saveEdit = async (id, text) => {
    try {
      const u = await translationService.updateTranslation(id, lang, text);
      patchLocal(id, { translations: u.translations });
      setSavedAt(Date.now());
    } catch (e) {
      toast({ message: e.message, tone: "crit" });
    }
  };
  const translatePage = async () => {
    setBusy(true);
    try {
      await translationService.generateForReview({ siteId, route, lang });
      toast({ message: "Page translated", tone: "good" });
      load();
    } catch (e) {
      toast({ message: e.message, tone: "crit" });
    } finally {
      setBusy(false);
    }
  };
  const copyText = async (text) => {
    try {
      await navigator.clipboard.writeText(text || "");
      toast({ message: "Copied", tone: "info" });
    } catch {
      toast({ message: "Copy failed", tone: "crit" });
    }
  };
  const approveAll = async () => {
    const ids = filtered.filter((s) => s.stage !== "approved").map((s) => s.id);
    if (!ids.length) return toast({ message: "Nothing to approve", tone: "info" });
    await Promise.allSettled(ids.map((id) => translationService.approveTranslation(id, lang)));
    ids.forEach((id) => patchLangStatus(id, "approved"));
    setSavedAt(Date.now());
    toast({ message: `Approved ${ids.length} segments`, tone: "good" });
  };
  const revertAll = () => {
    load();
    setRevision((r) => r + 1);
    setSavedAt(null);
    toast({ message: "Reverted to last saved state", tone: "info" });
  };

  const pageIdx = pages.findIndex((p) => p.route === route);
  const gotoRoute = (r) => onScope && onScope((s) => ({ ...s, route: r }));
  const pageNumbers = useMemo(() => {
    const n = pages.length;
    if (n <= 7) return pages.map((_, i) => i);
    const set = new Set([0, 1, pageIdx - 1, pageIdx, pageIdx + 1, n - 1]);
    return [...set].filter((i) => i >= 0 && i < n).sort((a, b) => a - b);
  }, [pages, pageIdx]);

  const ready = Boolean(siteId && route);

  return (
    <div className="tr">
      {/* Header */}
      <div className="tr-head">
        <div>
          <h1>Translate & Review</h1>
          <p>Translate full pages and review in context</p>
        </div>
        <div className="tr-head-ctrl">
          <span className="tr-search">
            <input
              placeholder="Search source or translated text..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search source or translated text"
            />
            <kbd>⌘K</kbd>
          </span>
        </div>
      </div>

      {/* Status tabs + language filter */}
      <div className="tr-tabs">
        <button
          type="button"
          className={`tr-tab ${statusTab === "pending" ? "on" : ""}`}
          onClick={() => setStatusTab("pending")}
        >
          Pending Review <span className="tr-tab-n">{tabCounts.pending}</span>
        </button>
        <button
          type="button"
          className={`tr-tab ${statusTab === "approved" ? "on" : ""}`}
          onClick={() => setStatusTab("approved")}
        >
          Approved <span className="tr-tab-n">{tabCounts.approved}</span>
        </button>
        <button
          type="button"
          className={`tr-tab ${statusTab === "all" ? "on" : ""}`}
          onClick={() => setStatusTab("all")}
        >
          All <span className="tr-tab-n">{tabCounts.all}</span>
        </button>
        <div className="tr-lang-tab">
          <Select
            value={lang}
            onChange={(v) => onScope((s) => ({ ...s, lang: v }))}
            placeholder="Select language"
            options={languages.map((l) => ({ value: l.code, label: l.name }))}
          />
        </div>
      </div>

      {/* Selects */}
      <div className="tr-selects">
        <label className="tr-field">
          <span>Site</span>
          <select
            value={scope.siteId}
            onChange={(e) => onScope((s) => ({ ...s, siteId: e.target.value, route: "" }))}
          >
            <option value="">Select site</option>
            {sites.map((s) => (
              <option key={s.id} value={s.siteId}>
                {s.name || s.domain}
              </option>
            ))}
          </select>
        </label>
      </div>

      {!ready ? (
        <div style={{ flex: 1, display: "grid", placeItems: "center" }}>
          <EmptyState
            title="Pick a site"
            message="Choose a project and website above to start reviewing its translations."
          />
        </div>
      ) : (
        <>
          {/* Page navigation + stats */}
          <div className="tr-pagenav">
            <span className="tr-pn-label">
              Page navigation
              {pagesError ? (
                <span className="tr-pn-error">
                  {" "}
                  — {pagesError === "forbidden" ? "permission denied loading pages" : pagesError}
                </span>
              ) : null}
            </span>
            <div className="tr-pager">
              <button
                className="pg-arrow"
                disabled={pageIdx <= 0}
                onClick={() => gotoRoute(pages[pageIdx - 1].route)}
                aria-label="Previous page"
              >
                ‹
              </button>
              {pageNumbers.map((i, k) => {
                const gap = k > 0 && i - pageNumbers[k - 1] > 1;
                return (
                  <React.Fragment key={i}>
                    {gap ? <span className="pg-dots">…</span> : null}
                    <button
                      className={`pg-num ${i === pageIdx ? "on" : ""}`}
                      onClick={() => gotoRoute(pages[i].route)}
                      title={pages[i].route}
                      aria-current={i === pageIdx ? "page" : undefined}
                    >
                      {i + 1}
                    </button>
                  </React.Fragment>
                );
              })}
              <button
                className="pg-arrow"
                disabled={pageIdx >= pages.length - 1}
                onClick={() => gotoRoute(pages[pageIdx + 1].route)}
                aria-label="Next page"
              >
                ›
              </button>
            </div>
          </div>

          {/* Body: editor + optional live preview */}
          <div className="tr-body" ref={bodyRef}>
            <div className="tr-editor">
              <div className="tr-colhead">
                <div className="ch-idx">#</div>
                <div className="ch-src">Source</div>
                <div className="ch-tr">
                  Translation
                  <span className="ch-tools">
                    <button title="Copy all" aria-label="Copy all">Copy all</button>
                  </span>
                </div>
                <div className="ch-actions" aria-hidden="true" />
              </div>
              {docs === null ? (
                <div style={{ padding: 20 }}>
                  <SkeletonTheme baseColor="var(--surface-2)" highlightColor="var(--surface-3)">
                    <Skeleton count={6} height={64} borderRadius={10} style={{ marginBottom: 8 }} />
                  </SkeletonTheme>
                </div>
              ) : docsError ? (
                <EmptyState
                  title={
                    docsError === "forbidden" ? "Permission denied" : "Couldn't load translations"
                  }
                  message={
                    docsError === "forbidden"
                      ? "Your account doesn't have access to Translate & Review."
                      : docsError
                  }
                />
              ) : filtered.length === 0 ? (
                <EmptyState
                  title="Nothing here"
                  message={
                    segments.length
                      ? "No segments match your search."
                      : "This page hasn't been translated yet."
                  }
                  action={
                    !segments.length ? (
                      <button className="tertiary-button" onClick={translatePage} disabled={busy}>
                        {busy ? "Translating…" : "Translate this page"}
                      </button>
                    ) : null
                  }
                />
              ) : (
                <>
                  <div className="tr-grid">
                    {pageSlice.map((seg, i) => (
                      <TransRow
                        key={`${seg.id}-${revision}`}
                        seg={seg}
                        idx={clampedOffset * rowsPerPage + i + 1}
                        onEdit={saveEdit}
                        onApprove={approve}
                        onReject={reject}
                        onCopy={copyText}
                      />
                    ))}
                  </div>
                  <Pagination
                    current={clampedOffset}
                    total={pageCount}
                    onChange={(i) => setPageOffset(i)}
                  />
                </>
              )}
              {/* Editor footer */}
              <div className="tr-editfoot">
                <button className="action-ghost-button" onClick={revertAll}>
                  Revert all
                </button>
                <span style={{ flex: 1 }} />
                <button
                  className="action-ghost-button"
                  onClick={() => {
                    setSavedAt(Date.now());
                    toast({ message: "Changes saved", tone: "good" });
                  }}
                >
                  Save changes
                </button>
                <button className="tertiary-button" onClick={approveAll}>
                  Approve all
                </button>
              </div>
            </div>
          </div>

          {/* Status bar */}
          <div className="tr-statusbar">
            <span className="sb-saved">
              {savedAt ? (
                <>Last saved {new Date(savedAt).toLocaleTimeString()}</>
              ) : (
                "All changes auto-saved"
              )}
            </span>
          </div>
        </>
      )}
    </div>
  );
}

export default WorkspaceScreen;
