import React, { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useRemediationJobs } from "../../../hooks/useRemediationJobs";
import { textbookRemediationService } from "../../../services/textbookRemediationService";
import MiddleEllipsis from "../shared/MiddleEllipsis";
import { StageProgress } from "./StageProgress";
import "../shared/cards.css";
import "../shared/buttons.css";
import "../shared/tables.css";
import "./css/RemediationTab.css";

const LANGUAGES = [
  { code: "en", label: "English (no translation)" },
  { code: "kn", label: "Kannada" },
  { code: "ta", label: "Tamil" },
  { code: "hi", label: "Hindi" },
  { code: "mr", label: "Marathi" },
];

const RemediationTab = () => {
  const navigate = useNavigate();
  const { jobs, isLoading, isUploading, error, upload } = useRemediationJobs();
  const [language, setLanguage] = useState("en");
  const fileRef = useRef(null);

  const handleFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) await upload(file, language);
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
        <div className="remediation-upload">
          <select
            className="remediation-language"
            value={language}
            onChange={(event) => setLanguage(event.target.value)}
            aria-label="Language for figure descriptions"
          >
            {LANGUAGES.map(({ code, label }) => (
              <option key={code} value={code}>
                {label}
              </option>
            ))}
          </select>
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf"
            onChange={handleFile}
            className="remediation-file-input"
          />
          <button
            type="button"
            className="primary-button"
            disabled={isUploading}
            onClick={() => fileRef.current?.click()}
          >
            {isUploading ? "Uploading…" : "Upload textbook"}
          </button>
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
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <tr key={job.job_id}>
                  <td className="table-cell table-cell-truncate">
                    <button
                      type="button"
                      className="remediation-link"
                      onClick={() => navigate(`/content/remediation/${job.job_id}`)}
                    >
                      <MiddleEllipsis text={job.source_name} />
                    </button>
                  </td>
                  <td className="table-cell">{job.language}</td>
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
                        className="secondary-button"
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
