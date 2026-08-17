import React from "react";

export function SyncAllProgress({ syncingAll, syncAllProgress }) {
  if (!syncingAll || !syncAllProgress) return null;

  if (syncAllProgress.total > 0) {
    const pct = Math.min(100, Math.round((syncAllProgress.processed / syncAllProgress.total) * 100));
    return (
      <div className="content-aggregator-sync-all-progress">
        <div className="content-aggregator-sync-all-progress-track">
          <div className="content-aggregator-sync-all-progress-fill" style={{ width: `${pct}%` }} />
        </div>
        <span className="content-aggregator-sync-all-progress-label">
          {syncAllProgress.processed}/{syncAllProgress.total} courses synced
        </span>
      </div>
    );
  }

  return (
    <div className="content-aggregator-sync-all-progress">
      <div className="content-aggregator-sync-all-progress-track">
        <div className="content-aggregator-sync-all-progress-fill content-aggregator-sync-all-progress-fill-diff" />
      </div>
      <span className="content-aggregator-sync-all-progress-label">Calculating diff…</span>
    </div>
  );
}
