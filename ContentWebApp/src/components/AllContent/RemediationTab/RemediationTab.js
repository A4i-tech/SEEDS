import React, { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useRemediationJobs } from "../../../hooks/useRemediationJobs";
import { textbookRemediationService } from "../../../services/textbookRemediationService";
import MiddleEllipsis from "../shared/MiddleEllipsis";
import RowActions from "../shared/RowActions";
import { StageProgress } from "./StageProgress";
import { SyncAllProgress } from "../shared/SyncAllProgress";
import "../shared/cards.css";
import "../shared/buttons.css";
import "../shared/tables.css";

const RemediationTab = () => {
  const navigate = useNavigate();
  const { jobs, isLoading, isUploading, error, upload, remove } = useRemediationJobs();
  const fileRef = useRef(null);
  const [selectedFile, setSelectedFile] = useState(null);

  const handleFile = (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) setSelectedFile(file);
  };

  const handleUpload = async () => {
    if (!selectedFile) return;
    await upload(selectedFile, "auto");
    setSelectedFile(null);
  };

  return (
    <div className="card">
      <div className="card-header">
        <div>
          <div className="card-title">Textbook Remediation</div>
          <div className="card-description">
            PDF to an accessible Word document: OCR, then a reviewed Markdown, then the .docx
          </div>
        </div>
      </div>

      <div className="registration-card" style={{ alignItems: "center", marginBottom: "16px" }}>
        <div className="registration-title" style={{ textAlign: "center", textTransform: "uppercase" }}>
          Upload Textbook
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap", justifyContent: "center" }}>
          <span style={{ fontWeight: 600 }}>
            Textbook PDF <span style={{ color: "#dc2626" }}>*</span>
          </span>
          <input ref={fileRef} type="file" accept="application/pdf" onChange={handleFile} style={{ display: "none" }} />
          <button type="button" className="action-ghost-button" onClick={() => fileRef.current && fileRef.current.click()}>
            Choose PDF File
          </button>
          {selectedFile && <span className="table-cell-secondary">{selectedFile.name}</span>}
          <button
            type="button"
            className="primary-button"
            disabled={!selectedFile || isUploading}
            onClick={handleUpload}
          >
            {isUploading ? "Uploading…" : "Upload textbook"}
          </button>
          <SyncAllProgress
            syncingAll={isUploading}
            syncAllProgress={isUploading ? {} : null}
            indeterminateLabel="Uploading textbook…"
          />
        </div>
      </div>

      {error && <p className="content-details-error">Error: {error}</p>}
      {isLoading && jobs.length === 0 && <p className="table-cell-secondary">Loading…</p>}
      {!isLoading && jobs.length === 0 && <p className="table-cell-secondary">No textbooks queued yet.</p>}

      {jobs.length > 0 && (
        <div className="table-wrapper">
          <table className="content-table">
            <thead>
              <tr>
                <th className="table-header">Textbook</th>
                <th className="table-header">Language</th>
                <th className="table-header">Status</th>
                <th className="table-header">Stage</th>
                <th className="table-header">Artifacts</th>
                <th className="table-header">Actions</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <tr key={job.job_id}>
                  <td className="table-cell table-cell-truncate">
                    <MiddleEllipsis text={job.source_name} />
                  </td>
                  <td className="table-cell">
                    {job.detected_language ? (
                      <span style={{ fontWeight: 600, color: "var(--color-fg-default)" }}>
                        {job.detected_language}
                      </span>
                    ) : job.language === "auto" || job.language === "detecting" ? (
                      <span className="remediation-status" style={{ backgroundColor: "#f1f5f9", color: "#475569", fontWeight: 500, fontSize: "12px" }}>
                        Detecting…
                      </span>
                    ) : (
                      <span style={{ fontWeight: 600 }}>{job.language}</span>
                    )}
                  </td>
                  <td className="table-cell">
                    <span className={`remediation-status remediation-status-${job.status}`}>{job.status}</span>
                    {job.error && <div className="table-cell-secondary">{job.error}</div>}
                  </td>
                  <td className="table-cell">
                    <StageProgress job={job} />
                  </td>
                  <td className="table-cell">
                    {job.artifacts.docx ? (
                      <button
                        type="button"
                        className="remediation-link"
                        onClick={() =>
                          textbookRemediationService.downloadArtifact(
                            job.job_id,
                            "docx",
                            `${job.source_name.replace(/\.pdf$/i, "")}.docx`
                          )
                        }
                      >
                        Download .docx
                      </button>
                    ) : (
                      <span className="table-cell-secondary">—</span>
                    )}
                  </td>
                  <td className="table-cell">
                    <RowActions
                      actions={[
                        { key: "edit", label: "Edit", variant: "edit", onClick: () => navigate(`/content/remediation/${job.job_id}`) },
                        {
                          key: "delete",
                          label: "Delete",
                          variant: "delete",
                          onClick: () => {
                            if (window.confirm(`Delete "${job.source_name}"?`)) remove(job.job_id);
                          },
                        },
                      ]}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default RemediationTab;
