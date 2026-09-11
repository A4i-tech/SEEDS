import React from "react";

const STAGE_LABELS = { ocr: "OCR", review: "Review", docx: "Remediate" };
const STAGES = ["ocr", "review", "docx"];

export function StageProgress({ job }) {
  const done = job.status === "completed";
  const progressMsg = job.status === "running" && job.progress ? job.progress.message : "";
  const progressPct = job.status === "running" && job.progress && job.progress.percent != null ? ` (${job.progress.percent}%)` : "";

  return (
    <div className="remediation-stages-wrapper">
      <div className="remediation-stages" aria-label={`stage ${job.stage_index} of ${job.stage_count}`}>
        {STAGES.map((stage, index) => {
          const reached = done || index < job.stage_index;
          const current = !done && index + 1 === job.stage_index && job.status === "running";
          return (
            <span
              key={stage}
              className={`remediation-stage${reached ? " remediation-stage-done" : ""}${current ? " remediation-stage-current" : ""}`}
            >
              {STAGE_LABELS[stage]}
            </span>
          );
        })}
      </div>
      {progressMsg && (
        <div className="remediation-stage-live-msg" title={progressMsg}>
          <span className="remediation-pulse-dot" />
          {progressMsg}{progressPct}
        </div>
      )}
    </div>
  );
}
