import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Skeleton, { SkeletonTheme } from "react-loading-skeleton";
import "react-loading-skeleton/dist/skeleton.css";
import Select from "../shared/Select";
import RowActions from "../shared/RowActions";
import MiddleEllipsis from "../shared/MiddleEllipsis";
import "../shared/tables.css";
import "../shared/utilities.css";
import "../shared/buttons.css";
import "../shared/cards.css";
import "../ContentTab/css/ContentTab.css";
import "../RegistrationTab/css/TeachersList.css";
import "../AnalyticsTab/css/AnalyticsTab.css";
import { Pagination } from "../../ContentAggregatorDetails/Pagination";
import { translationService } from "../../../services/translationService";
import { toSegment } from "../../../utils/segments";
import { useToast } from "./Toast";

function EmptyState({ title, message, action }) {
  return (
    <div className="no-content">
      {title}
      <p className="placeholder-text">{message}</p>
      {action}
    </div>
  );
}

const BADGE_STYLE = {
  approved: { background: "var(--color-success-bg)", color: "var(--color-success-fg)" },
  rejected: { background: "var(--color-danger-bg)", color: "var(--color-danger-fg)" },
  pending: { background: "var(--color-warning-bg)", color: "var(--color-warning-fg)" },
};

const ACTIONS_COLUMN_STYLE = { width: 380 };

let sourceCanvasCtx = null;

function useIsTruncated(text) {
  const ref = useRef(null);
  const [truncated, setTruncated] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const measure = () => {
      if (!sourceCanvasCtx) sourceCanvasCtx = document.createElement("canvas").getContext("2d");
      sourceCanvasCtx.font = getComputedStyle(el).font;
      setTruncated(sourceCanvasCtx.measureText(text).width > el.clientWidth);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [text]);
  return [ref, truncated];
}

function TabButton({ label, count, active, onClick }) {
  return (
    <button type="button" className={`tab-button ${active ? "active" : ""}`} onClick={onClick}>
      {label} ({count})
    </button>
  );
}

function StatusBadge({ seg }) {
  const stage = seg.stage === "approved" || seg.stage === "rejected" ? seg.stage : "pending";
  const label = stage === "approved" ? "Approved" : stage === "rejected" ? "Rejected" : "Pending Review";
  return (
    <span className="role-badge" style={BADGE_STYLE[stage]}>
      {label}
    </span>
  );
}

function TransRow({ seg, idx, onEdit, onApprove, onReject, onCopy }) {
  const inputRef = useRef(null);
  const [text, setText] = useState(seg.translation);
  const [expanded, setExpanded] = useState(false);
  const [sourceRef, truncated] = useIsTruncated(seg.sourceText);
  useEffect(() => setText(seg.translation), [seg.translation]);
  useEffect(() => {
    const el = inputRef.current;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [text]);
  const commit = () => {
    if (text !== seg.translation) onEdit(seg.id, text);
  };

  return (
    <tr className="table-row-white">
      <td className="table-cell">{idx}</td>
      <td className="table-cell table-cell-truncate">
        <div ref={sourceRef}>
          {expanded ? (
            <span style={{ display: "block", whiteSpace: "normal", overflowWrap: "anywhere" }}>{seg.sourceText}</span>
          ) : (
            <MiddleEllipsis text={seg.sourceText} />
          )}
        </div>
        {truncated && (
          <button
            type="button"
            aria-expanded={expanded}
            aria-label={expanded ? "Show less source text" : "Show full source text"}
            onClick={() => setExpanded((v) => !v)}
            style={{
              background: "none",
              border: "none",
              padding: 0,
              margin: 0,
              color: "var(--color-primary)",
              textDecoration: "underline",
              fontSize: "12px",
              cursor: "pointer",
            }}
          >
            {expanded ? "Show less" : "Show more"}
          </button>
        )}
      </td>
      <td className="table-cell">
        <textarea
          ref={inputRef}
          className="input-field"
          rows={2}
          style={{ resize: "none", overflow: "hidden" }}
          value={text}
          placeholder="Add translation…"
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          aria-label={`Translation for: ${seg.sourceText}`}
        />
      </td>
      <td className="table-cell">
        <StatusBadge seg={seg} />
      </td>
      <td className="table-cell table-cell-actions" style={ACTIONS_COLUMN_STYLE}>
        <RowActions
          horizontal
          actions={[
            seg.stage !== "approved" && { key: "approve", label: "Approve", variant: "view", onClick: () => onApprove(seg.id) },
            seg.stage !== "rejected" && { key: "reject", label: "Reject", variant: "delete", onClick: () => onReject(seg.id) },
            { key: "copy", label: "Copy", variant: "sync", onClick: () => onCopy(text) },
          ].filter(Boolean)}
        />
      </td>
    </tr>
  );
}

export function WorkspaceScreen({ scope, languages, sites, onScope, pages, pagesError = null }) {
  const { siteId, route, lang } = scope;
  const { toast } = useToast();
  const [docs, setDocs] = useState(null);
  const [docsError, setDocsError] = useState(null);
  const [query, setQuery] = useState("");
  const [savedAt, setSavedAt] = useState(null);
  const [statusTab, setStatusTab] = useState("all");
  const rowsPerPage = 10;
  const [pageOffset, setPageOffset] = useState(0);

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
        const missing = lang && list.some((doc) => !doc?.translations?.[lang]?.text);
        if (missing) {
          try {
            await translationService.generateForReview({ siteId, route, lang });
            list = await translationService.listTranslations({ siteId, route });
          } catch (e) {
            toast({ message: e.message, tone: "crit" });
          }
        }
        setDocs(list);
      })
      .catch((e) => {
        setDocs([]);
        setDocsError(e.status === 403 ? "forbidden" : e.message);
      });
  }, [siteId, route, lang, toast]);
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

  const patchLocal = (id, f) =>
    setDocs((ds) => (ds ? ds.map((d) => (d.id === id ? { ...d, ...f } : d)) : ds));
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
  const copyText = async (text) => {
    try {
      await navigator.clipboard.writeText(text || "");
      toast({ message: "Copied", tone: "info" });
    } catch (e) {
      toast({ message: e.message, tone: "crit" });
    }
  };
  const approveAll = async () => {
    const ids = filtered.filter((s) => s.stage !== "approved" && s.stage !== "rejected").map((s) => s.id);
    if (!ids.length) return toast({ message: "Nothing to approve", tone: "info" });
    if (statusTab === "all" && !query.trim()) {
      try {
        const { approved, skipped } = await translationService.bulkApproveTranslations({ siteId, route, lang });
        toast({ message: `Approved ${approved}, skipped ${skipped}`, tone: "good" });
        load();
      } catch (e) {
        toast({ message: e.message, tone: "crit" });
      }
      return;
    }
    const results = await Promise.allSettled(ids.map((id) => translationService.approveTranslation(id, lang)));
    const succeeded = ids.filter((_, i) => results[i].status === "fulfilled");
    const failed = ids.length - succeeded.length;
    succeeded.forEach((id) => patchLangStatus(id, "approved"));
    if (succeeded.length) setSavedAt(Date.now());
    if (failed) {
      toast({ message: `Approved ${succeeded.length}, ${failed} failed`, tone: "crit" });
    } else {
      toast({ message: `Approved ${succeeded.length} segments`, tone: "good" });
    }
  };

  const ready = Boolean(siteId && route);

  return (
    <div className="card">
      <div className="card-header">
        <div>
          <h1 className="card-title">Translate & Review</h1>
          <p className="card-description">Translate full pages and review in context</p>
        </div>
        <div className="button-group">
          <input
            type="search"
            className="input-field"
            placeholder="Search source or translated text…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search source or translated text"
            style={{ width: 260 }}
          />
          <button type="button" className="tertiary-button" onClick={approveAll} disabled={!ready}>
            Approve all
          </button>
        </div>
      </div>

      <div className="tabs-container" style={{ marginBottom: 16 }}>
        {[
          { id: "pending", label: "Pending Review", count: tabCounts.pending },
          { id: "approved", label: "Approved", count: tabCounts.approved },
          { id: "all", label: "All", count: tabCounts.all },
        ].map((t) => (
          <TabButton
            key={t.id}
            label={t.label}
            count={t.count}
            active={statusTab === t.id}
            onClick={() => setStatusTab(t.id)}
          />
        ))}
      </div>

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 16 }}>
        <div style={{ minWidth: 220 }}>
          <span className="label">Site</span>
          <Select
            value={scope.siteId}
            onChange={(v) => onScope((s) => ({ ...s, siteId: v, route: "" }))}
            placeholder="Select site"
            options={sites.map((s) => ({ value: s.siteId, label: s.name || s.domain }))}
          />
        </div>
        <div style={{ minWidth: 320 }}>
          <span className="label">Page</span>
          <Select
            value={route}
            onChange={(v) => onScope((s) => ({ ...s, route: v }))}
            placeholder="Select page"
            options={pages.map((p) => ({ value: p.route, label: p.route }))}
          />
        </div>
        <div style={{ minWidth: 220 }}>
          <span className="label">Review Language</span>
          <Select
            value={lang}
            onChange={(v) => onScope((s) => ({ ...s, lang: v }))}
            placeholder="Select language"
            options={languages.map((l) => ({ value: l.code, label: l.name }))}
          />
        </div>
      </div>
      {pagesError && (
        <p className="error-message">
          {pagesError === "forbidden" ? "Permission denied loading pages" : pagesError}
        </p>
      )}

      {!ready ? (
        <EmptyState
          title="Pick a site"
          message="Choose a project and website above to start reviewing its translations."
        />
      ) : docs === null ? (
        <SkeletonTheme baseColor="var(--color-skeleton-base)" highlightColor="var(--color-skeleton-highlight)">
          <Skeleton count={6} height={48} style={{ marginBottom: 8 }} />
        </SkeletonTheme>
      ) : docsError ? (
        <EmptyState
          title={docsError === "forbidden" ? "Permission denied" : "Couldn't load translations"}
          message={
            docsError === "forbidden" ? "Your account doesn't have access to Translate & Review." : docsError
          }
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="Nothing here"
          message={segments.length ? "No segments match your search." : "This page hasn't been translated yet."}
        />
      ) : (
        <>
          <div className="table-wrapper">
            <table className="content-table" style={{ minWidth: 1200 }}>
              <thead>
                <tr>
                  <th className="table-header" style={{ width: 56 }}>#</th>
                  <th className="table-header" style={{ width: 260 }}>Source</th>
                  <th className="table-header">Translation</th>
                  <th className="table-header" style={{ width: 140 }}>Status</th>
                  <th className="table-header table-header-actions" style={ACTIONS_COLUMN_STYLE}>
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {pageSlice.map((seg, i) => (
                  <TransRow
                    key={seg.id}
                    seg={seg}
                    idx={clampedOffset * rowsPerPage + i + 1}
                    onEdit={saveEdit}
                    onApprove={approve}
                    onReject={reject}
                    onCopy={copyText}
                  />
                ))}
              </tbody>
            </table>
          </div>
          <p className="placeholder-text">
            Showing {clampedOffset * rowsPerPage + 1} to{" "}
            {Math.min(clampedOffset * rowsPerPage + rowsPerPage, filtered.length)} of {filtered.length}
          </p>
          <Pagination current={clampedOffset} total={pageCount} onChange={(i) => setPageOffset(i)} />

          <p className="placeholder-text" style={{ marginTop: 8 }}>
            {savedAt ? <>Last saved {new Date(savedAt).toLocaleTimeString()}</> : "All changes auto-saved"}
          </p>
        </>
      )}
    </div>
  );
}

export default WorkspaceScreen;
