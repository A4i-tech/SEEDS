import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronDown, ChevronRight } from "lucide-react";
import Skeleton, { SkeletonTheme } from "react-loading-skeleton";
import "react-loading-skeleton/dist/skeleton.css";
import { contentAggregatorService } from "../services/contentAggregatorService";
import { useContentAggregatorSync } from "../hooks/useContentAggregatorSync";
import { Breadcrumb } from "./AllContent/shared/Breadcrumb";
import MiddleEllipsis from "./AllContent/shared/MiddleEllipsis";
import { SyncAllProgress } from "./AllContent/shared/SyncAllProgress";
import "./AllContent/shared/pageShell.css";
import "./AllContent/shared/cards.css";
import "./AllContent/shared/buttons.css";
import "./AllContent/shared/utilities.css";
import "./AllContent/shared/tables.css";
import "./AllContent/ContentTab/css/ContentTab.css";
import "./ContentDetails.css";
import "./SyncHistoryPage.css";

const STATUS_LABEL = { saved: "Saved", skipped: "Skipped", empty: "Empty", failed: "Failed" };

const SyncHistoryJobListSkeleton = () => (
  <SkeletonTheme baseColor="var(--color-skeleton-base)" highlightColor="var(--color-skeleton-highlight)">
    <ul className="sync-history-job-list">
      {Array.from({ length: 4 }).map((_, i) => (
        <li key={i} className="sync-history-job">
          <div className="sync-history-job-summary">
            <Skeleton width={16} height={16} />
            <span className="sync-history-job-scope">
              <Skeleton width={100} />
            </span>
            <Skeleton width={80} height={20} borderRadius={999} />
            <span className="sync-history-job-started">
              <Skeleton width={140} />
            </span>
            <span className="sync-history-job-stats">
              <Skeleton width={220} />
            </span>
          </div>
        </li>
      ))}
    </ul>
  </SkeletonTheme>
);

function formatLocal(isoString) {
  return new Date(isoString).toLocaleString();
}

const SyncHistoryPage = () => {
  const navigate = useNavigate();
  const { syncingAll, syncAllProgress } = useContentAggregatorSync();
  const [jobs, setJobs] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [itemsByJob, setItemsByJob] = useState({});

  const load = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await contentAggregatorService.getSyncJobs({ limit: 20 });
      setJobs(data.jobs);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!syncingAll) load();
  }, [syncingAll, load]);

  const loadJobItems = useCallback(async (jobId, after) => {
    setItemsByJob((prev) => ({
      ...prev,
      [jobId]: { ...(prev[jobId] || { items: [] }), loading: true, error: null },
    }));
    try {
      const data = await contentAggregatorService.getSyncJobItems(jobId, { limit: 50, after });
      setItemsByJob((prev) => {
        const existing = prev[jobId]?.items || [];
        return {
          ...prev,
          [jobId]: {
            items: after ? [...existing, ...data.items] : data.items,
            nextCursor: data.next_cursor,
            hasMore: Boolean(data.next_cursor),
            loading: false,
            error: null,
            loaded: true,
          },
        };
      });
    } catch (err) {
      setItemsByJob((prev) => ({
        ...prev,
        [jobId]: { ...(prev[jobId] || { items: [] }), loading: false, error: err.message },
      }));
    }
  }, []);

  const toggleExpand = useCallback(
    (jobId) => {
      const nextExpanded = expandedId === jobId ? null : jobId;
      setExpandedId(nextExpanded);
      if (nextExpanded && !itemsByJob[nextExpanded]?.loaded) {
        loadJobItems(nextExpanded);
      }
    },
    [expandedId, itemsByJob, loadJobItems]
  );

  return (
    <div className="page-shell">
      <Breadcrumb
        className="breadcrumb-standalone"
        items={[{ label: "Home", onClick: () => navigate("/content") }, { label: "Sync History" }]}
      />
      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title">Sync History</div>
            <div className="card-description">Past and in-progress Subodha sync runs</div>
          </div>
        </div>

        <SyncAllProgress syncingAll={syncingAll} syncAllProgress={syncAllProgress} />

        {isLoading && jobs.length === 0 && <SyncHistoryJobListSkeleton />}
        {error && <p className="content-details-error">Error: {error}</p>}
        {!isLoading && !error && jobs.length === 0 && <p>No sync runs yet.</p>}

        <ul className="sync-history-job-list">
          {jobs.map((job) => {
            const isExpanded = expandedId === job.job_id;
            const jobItems = itemsByJob[job.job_id];
            return (
              <li key={job.job_id} className="sync-history-job">
                <button
                  type="button"
                  className="sync-history-job-summary"
                  onClick={() => toggleExpand(job.job_id)}
                >
                  {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  <span className="sync-history-job-scope">
                    {job.scope === "course" ? job.course_id : "All courses"}
                  </span>
                  <span className={`sync-history-job-status sync-history-job-status-${job.status}`}>
                    {job.status}
                  </span>
                  <span className="sync-history-job-started">{formatLocal(job.started_at)}</span>
                  <span className="sync-history-job-stats">
                    {job.stats.saved} saved / {job.stats.skipped} skipped / {job.stats.empty} empty /{" "}
                    {job.stats.failed} failed
                  </span>
                </button>
                {isExpanded && jobItems?.loading && !jobItems.loaded && (
                  <p className="table-cell-secondary sync-history-empty">Loading…</p>
                )}
                {isExpanded && jobItems?.error && (
                  <p className="content-details-error">Error: {jobItems.error}</p>
                )}
                {isExpanded && jobItems?.loaded && jobItems.items.length === 0 && (
                  <p className="table-cell-secondary sync-history-empty">No courses processed yet.</p>
                )}
                {isExpanded && jobItems?.loaded && jobItems.items.length > 0 && (
                  <div className="sync-history-table-outer">
                  <div className="table-wrapper">
                    <table className="content-table">
                      <thead>
                        <tr>
                          <th className="table-header">Course</th>
                          <th className="table-header">Name</th>
                          <th className="table-header">Status</th>
                          <th className="table-header">Error</th>
                          <th className="table-header">At</th>
                        </tr>
                      </thead>
                      <tbody>
                        {jobItems.items.map((c, i) => (
                          <tr key={`${c.source_id}-${i}`}>
                            <td className="table-cell table-cell-truncate">
                              <MiddleEllipsis text={c.source_id} />
                            </td>
                            <td className="table-cell table-cell-truncate">
                              <MiddleEllipsis text={c.name} />
                            </td>
                            <td className="table-cell">{STATUS_LABEL[c.status]}</td>
                            <td className="table-cell table-cell-secondary">{c.error || "—"}</td>
                            <td className="table-cell">{formatLocal(c.at)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {jobItems.hasMore && (
                    <div className="load-more-wrapper">
                      <button
                        type="button"
                        className="secondary-button"
                        disabled={jobItems.loading}
                        onClick={() => loadJobItems(job.job_id, jobItems.nextCursor)}
                      >
                        {jobItems.loading ? "Loading more..." : "Load more"}
                      </button>
                    </div>
                  )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
};

export default SyncHistoryPage;
