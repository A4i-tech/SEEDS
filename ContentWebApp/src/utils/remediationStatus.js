export const JOB_STATUS = Object.freeze({
  PENDING: "pending",
  RUNNING: "running",
  READY_TO_REVIEW: "ready_to_review",
  IN_REVIEW: "in_review",
  VERIFIED: "verified",
  FAILED: "failed",
});

export const JOB_STAGE = Object.freeze({
  OCR: "ocr",
  REVIEW: "review",
  DOCX: "docx",
});

export const isRemediationDone = (status) =>
  status === JOB_STATUS.READY_TO_REVIEW || status === JOB_STATUS.IN_REVIEW || status === JOB_STATUS.VERIFIED;
