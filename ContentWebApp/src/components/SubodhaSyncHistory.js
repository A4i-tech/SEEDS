import React, { useCallback, useEffect, useState } from "react";
import { subodhaService } from "../services/subodhaService";
import "./SubodhaSyncHistory.css";

const STATUS_LABEL = { saved: "Saved", skipped: "Skipped", empty: "Empty", failed: "Failed" };

const SubodhaSyncHistory = ({ onClose }) => {
  const [jobs, setJobs] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedId, setExpandedId] = useState(null);

  const load = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await subodhaService.getSyncJobs({ limit: 20 });
      setJobs(data.jobs || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="subodha-sync-history-overlay" onClick={onClose}>
      <div className="subodha-sync-history-panel" onClick={(e) => e.stopPropagation()}>
        <div className="subodha-sync-history-header">
          <h3>Sync History</h3>
          <button onClick={onClose} className="secondary-button">
            Close
          </button>
        </div>

        {isLoading && <p>Loading...</p>}
        {error && <p className="content-details-error">Error: {error}</p>}
        {!isLoading && !error && jobs.length === 0 && <p>No sync runs yet.</p>}

        <ul className="subodha-sync-history-list">
          {jobs.map((job) => (
            <li key={job.job_id} className="subodha-sync-history-item">
              <button
                type="button"
                className="subodha-sync-history-summary"
                onClick={() => setExpandedId(expandedId === job.job_id ? null : job.job_id)}
              >
                <span>{job.scope === "course" ? job.course_id : "All courses"}</span>
                <span>{job.status}</span>
                <span>{job.started_at}</span>
                <span>
                  {job.stats?.saved ?? 0} saved / {job.stats?.skipped ?? 0} skipped /{" "}
                  {job.stats?.empty ?? 0} empty / {job.stats?.failed ?? 0} failed
                </span>
              </button>
              {expandedId === job.job_id && (
                <table className="subodha-sync-history-detail">
                  <thead>
                    <tr>
                      <th>Course</th>
                      <th>Name</th>
                      <th>Status</th>
                      <th>Error</th>
                      <th>At</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(job.items || []).map((c, i) => (
                      <tr key={`${c.source_id}-${i}`}>
                        <td>{c.source_id}</td>
                        <td>{c.name}</td>
                        <td>{STATUS_LABEL[c.status] || c.status}</td>
                        <td>{c.error || "—"}</td>
                        <td>{c.at}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

export default SubodhaSyncHistory;
