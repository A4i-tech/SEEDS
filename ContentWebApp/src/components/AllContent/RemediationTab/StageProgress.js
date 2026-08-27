import React from "react";

const STAGE_LABELS = { ocr: "OCR", review: "Review", docx: "Remediate" };
const STAGES = ["ocr", "review", "docx"];

/** Three dots, one per pipeline stage, filled up to the one running now. */
export function StageProgress({ job }) {
  const done = job.status === "completed";
  return (
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
  );
}
