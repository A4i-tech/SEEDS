import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Skeleton, { SkeletonTheme } from "react-loading-skeleton";
import "react-loading-skeleton/dist/skeleton.css";
import Select from "../../components/AllContent/shared/Select";
import RowActions from "../../components/AllContent/shared/RowActions";
import "../../components/AllContent/shared/tables.css";
import "../../components/AllContent/shared/utilities.css";
import "../../components/AllContent/shared/buttons.css";
import "../../components/AllContent/shared/cards.css";
import "../../components/AllContent/ContentTab/css/ContentTab.css";
import "../../components/AllContent/RegistrationTab/css/TeachersList.css";
import "../../components/AllContent/AnalyticsTab/css/AnalyticsTab.css";
import { Pagination } from "../../components/ContentAggregatorDetails/Pagination";
import { translationService } from "../../services/translationService";
import { toSegment } from "../lib/segments";
import { useToast } from "../Toast";

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

function StatusBadge({ seg }) {
  const stage = seg.stage === "approved" || seg.stage === "rejected" ? seg.stage : "pending";
  const label = stage === "approved" ? "Approved" : stage === "rejected" ? "Rejected" : "Pending Review";
  return (
    <span className="role-badge" style={BADGE_STYLE[stage]}>
      {label}
    </span>
  );
}

/** One row: index, source, editable translation, status + actions. */
function TransRow({ seg, idx, onEdit, onApprove, onReject, onCopy }) {
  const inputRef = useRef(null);
  const [text, setText] = useState(seg.translation);
  useEffect(() => setText(seg.translation), [seg.translation]);
  const commit = () => {
    if (text !== seg.translation) onEdit(seg.id, text);
  };
  const focusInput = () => {
    const el = inputRef.current;
    if (el) {
      el.focus();
      el.select();
    }
  };

  return (
    <tr className="table-row-white">
      <td className="table-cell">{idx}</td>
      <td className="table-cell table-cell-truncate">{seg.sourceText}</td>
      <td className="table-cell">
        <textarea
          ref={inputRef}
          className="input-field"
          rows={2}
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
      <td className="table-cell table-cell-actions">
        <RowActions
          horizontal
          actions={[
            { key: "approve", label: "Approve", variant: "view", onClick: () => onApprove(seg.id) },
            { key: "reject", label: "Reject", variant: "delete", onClick: () => onReject(seg.id) },
            { key: "edit", label: "Edit", variant: "edit", onClick: focusInput },
            { key: "copy", label: "Copy", variant: "sync", onClick: () => onCopy(text) },
          ]}
        />
      </td>
    </tr>
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
  const revertAll = () => {
    load();
    setRevision((r) => r + 1);
    setSavedAt(null);
    toast({ message: "Reverted to last saved state", tone: "info" });
  };

  const ready = Boolean(siteId && route);

  return (
    <div className="card">
      <div className="card-header">
        <div>
          <h1 className="card-title">Translate & Review</h1>
          <p className="card-description">Translate full pages and review in context</p>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <input
            type="search"
            className="input-field"
            placeholder="Search source or translated text…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search source or translated text"
            style={{ width: 260 }}
          />
        </div>
      </div>

      <div className="tabs-container" style={{ marginBottom: 16 }}>
        <button
          type="button"
          className={`tab-button ${statusTab === "pending" ? "active" : ""}`}
          onClick={() => setStatusTab("pending")}
        >
          Pending Review ({tabCounts.pending})
        </button>
        <button
          type="button"
          className={`tab-button ${statusTab === "approved" ? "active" : ""}`}
          onClick={() => setStatusTab("approved")}
        >
          Approved ({tabCounts.approved})
        </button>
        <button
          type="button"
          className={`tab-button ${statusTab === "all" ? "active" : ""}`}
          onClick={() => setStatusTab("all")}
        >
          All ({tabCounts.all})
        </button>
      </div>

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 16 }}>
        <div>
          <span className="label">Site</span>
          <Select
            value={scope.siteId}
            onChange={(v) => onScope((s) => ({ ...s, siteId: v, route: "" }))}
            placeholder="Select site"
            options={sites.map((s) => ({ value: s.siteId, label: s.name || s.domain }))}
          />
        </div>
        <div>
          <span className="label">Page</span>
          <Select
            value={route}
            onChange={(v) => onScope((s) => ({ ...s, route: v }))}
            placeholder="Select page"
            options={pages.map((p) => ({ value: p.route, label: p.route }))}
          />
        </div>
        <div>
          <span className="label">Review Language</span>
          <Select
            value={lang}
            onChange={(v) => onScope((s) => ({ ...s, lang: v }))}
            placeholder="Select language"
            options={languages.map((l) => ({ value: l.code, label: l.name }))}
          />
        </div>
      </div>
      {pagesError ? (
        <p className="error-message">
          {pagesError === "forbidden" ? "Permission denied loading pages" : pagesError}
        </p>
      ) : null}

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
          action={
            !segments.length ? (
              <button type="button" className="tertiary-button" onClick={translatePage} disabled={busy}>
                {busy ? "Translating…" : "Translate this page"}
              </button>
            ) : null
          }
        />
      ) : (
        <>
          <div className="table-wrapper">
            <table className="content-table">
              <thead>
                <tr>
                  <th className="table-header">#</th>
                  <th className="table-header">Source</th>
                  <th className="table-header">Translation</th>
                  <th className="table-header">Status</th>
                  <th className="table-header table-header-actions">Actions</th>
                </tr>
              </thead>
              <tbody>
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
              </tbody>
            </table>
          </div>
          <p className="placeholder-text">
            Showing {clampedOffset * rowsPerPage + 1} to{" "}
            {Math.min(clampedOffset * rowsPerPage + rowsPerPage, filtered.length)} of {filtered.length}
          </p>
          <Pagination current={clampedOffset} total={pageCount} onChange={(i) => setPageOffset(i)} />

          <div className="button-group" style={{ marginTop: 16 }}>
            <button type="button" className="action-ghost-button" onClick={revertAll}>
              Revert all
            </button>
            <button
              type="button"
              className="action-ghost-button"
              onClick={() => {
                setSavedAt(Date.now());
                toast({ message: "Changes saved", tone: "good" });
              }}
            >
              Save changes
            </button>
            <button type="button" className="tertiary-button" onClick={approveAll}>
              Approve all
            </button>
          </div>

          <p className="placeholder-text" style={{ marginTop: 8 }}>
            {savedAt ? <>Last saved {new Date(savedAt).toLocaleTimeString()}</> : "All changes auto-saved"}
          </p>
        </>
      )}
    </div>
  );
}

export default WorkspaceScreen;
