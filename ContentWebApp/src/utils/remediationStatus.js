export const isRemediationDone = (status) =>
  status === "ready_to_review" || status === "in_review" || status === "verified";
