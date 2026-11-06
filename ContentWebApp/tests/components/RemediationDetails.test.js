import { render, screen } from "@testing-library/react";
import RemediationDetails from "../../src/components/RemediationDetails";
import { textbookRemediationService } from "../../src/services/textbookRemediationService";

jest.mock("react-router-dom", () => ({
  useNavigate: () => jest.fn(),
  useParams: () => ({ jobId: "job-1" }),
}));

jest.mock("react-markdown", () => () => null);
jest.mock("../../src/components/remediationMarkdown", () => ({
  remediationRemarkPlugins: [],
  remediationRehypePlugins: [],
}));

jest.mock("../../src/services/textbookRemediationService", () => ({
  textbookRemediationService: {
    getJob: jest.fn(),
    streamJob: jest.fn(),
    getReviewSummary: jest.fn(),
  },
}));

beforeEach(() => {
  jest.clearAllMocks();
  textbookRemediationService.getReviewSummary.mockResolvedValue({ flagged_items: [] });
});

test("a revoked stream event shows an error instead of staying on loading", async () => {
  textbookRemediationService.getJob.mockResolvedValue({ job_id: "job-1", status: "running", artifacts: {} });
  let emit;
  textbookRemediationService.streamJob.mockImplementation((jobId, onEvent) => {
    emit = onEvent;
    return new Promise(() => {});
  });

  render(<RemediationDetails />);

  await screen.findByText((content, element) => element.tagName === "P" && content.startsWith("Loading"));

  emit({ event: "revoked", reason: "unassigned" });

  expect(await screen.findByText("Access to this job was revoked.")).toBeInTheDocument();
  expect(screen.queryByText((content, element) => element.tagName === "P" && content.startsWith("Loading"))).not.toBeInTheDocument();
});
