import { isRemediationDone, JOB_STATUS, JOB_STAGE } from "../../../utils/remediationStatus";
import "./StageProgress.css";

const STAGE_LABELS = { [JOB_STAGE.OCR]: "OCR", [JOB_STAGE.REVIEW]: "Review", [JOB_STAGE.DOCX]: "Remediate" };
const STAGES = [JOB_STAGE.OCR, JOB_STAGE.REVIEW, JOB_STAGE.DOCX];

export function StageProgress({ job }) {
  const done = isRemediationDone(job.status);
  const running = job.status === JOB_STATUS.RUNNING;
  const progressMsg = running ? job.progress.message : "";
  const progressPercent = running ? job.progress.percent : null;
  const hasStageCounts = typeof job.stage_index === "number" && typeof job.stage_count === "number";
  const stagesLabel = hasStageCounts
    ? `stage ${job.stage_index} of ${job.stage_count}`
    : "Stage progress not yet available";

  return (
    <div className="remediation-stages-wrapper">
      <div className="remediation-stages" aria-label={stagesLabel}>
        {STAGES.map((stage, index) => {
          const current = !done && running && index + 1 === job.stage_index;
          const reached = !current && (done || index < job.stage_index);
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
      {progressPercent != null && (
        <div className="remediation-stage-progress-track">
          <div className="remediation-stage-progress-fill" style={{ width: `${progressPercent}%` }} />
        </div>
      )}
      {progressMsg && (
        <div className="remediation-stage-live-msg" title={progressMsg}>
          <span className="remediation-pulse-dot" />
          {progressMsg}{progressPercent != null ? ` (${progressPercent}%)` : ""}
        </div>
      )}
    </div>
  );
}
