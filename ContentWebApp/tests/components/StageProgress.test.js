import React from "react";
import { render } from "@testing-library/react";
import { StageProgress } from "../../src/components/AllContent/RemediationTab/StageProgress";

const job = (overrides = {}) => ({
  status: "running",
  stage_index: 2,
  stage_count: 3,
  progress: { message: null, percent: null },
  ...overrides,
});

test("marks the running stage as current without also marking it done", () => {
  const { container } = render(<StageProgress job={job()} />);
  const stages = container.querySelectorAll(".remediation-stage");
  expect(stages[0].className).toContain("remediation-stage-done");
  expect(stages[1].className).toContain("remediation-stage-current");
  expect(stages[1].className).not.toContain("remediation-stage-done");
});

test("treats ready_to_review, in_review and verified as done", () => {
  for (const status of ["ready_to_review", "in_review", "verified"]) {
    const { container } = render(<StageProgress job={job({ status, stage_index: 3 })} />);
    expect(container.querySelectorAll(".remediation-stage-done")).toHaveLength(3);
  }
});

test("announces the numeric stage position", () => {
  const { container } = render(<StageProgress job={job({ status: "pending", stage_index: 0, stage_count: 3 })} />);
  expect(container.querySelector(".remediation-stages")).toHaveAttribute("aria-label", "stage 0 of 3");
});
