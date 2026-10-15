import { render, screen } from "@testing-library/react";
import RemediationTab from "../../src/components/AllContent/RemediationTab/RemediationTab";
import { getRole } from "../../src/utils/authHelpers";
import { textbookRemediationService } from "../../src/services/textbookRemediationService";

jest.mock("react-router-dom", () => ({ useNavigate: () => jest.fn() }));
jest.mock("../../src/utils/authHelpers", () => ({ getRole: jest.fn() }));
jest.mock("../../src/services/textbookRemediationService", () => ({
  textbookRemediationService: {
    getLanguages: jest.fn(),
    downloadArtifact: jest.fn(),
  },
}));

const job = (overrides = {}) => ({
  job_id: "job-1",
  source_name: "book.pdf",
  language: "kn",
  status: "ready_to_review",
  stage: "docx",
  artifacts: {},
  assigned_to: null,
  ...overrides,
});

const mockAssign = jest.fn();
jest.mock("../../src/hooks/useRemediationJobs", () => ({
  useRemediationJobs: () => ({
    jobs: [job()],
    isLoading: false,
    isUploading: false,
    error: null,
    upload: jest.fn(),
    remove: jest.fn(),
    assign: mockAssign,
  }),
}));

const volunteers = [{ id: "vol-1", name: "Volunteer One" }];

beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = () => ({ measureText: () => ({ width: 0 }) });
  global.ResizeObserver = class {
    observe() {}
    disconnect() {}
  };
});

beforeEach(() => {
  jest.clearAllMocks();
  textbookRemediationService.getLanguages.mockResolvedValue({ languages: [] });
});

test("tenant sees the upload card and an assignee control", async () => {
  getRole.mockReturnValue("tenant");
  render(<RemediationTab volunteers={volunteers} />);

  expect(screen.getByText("Upload Textbook")).toBeInTheDocument();
  expect(screen.getByText("Assigned to")).toBeInTheDocument();
  expect(screen.getByText("Unassigned")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /delete/i })).toBeInTheDocument();
});

test.each([["school_admin"], ["content_creator"], ["textbook_remediation_volunteer"]])(
  "%s sees neither the upload card nor assignee controls",
  async (role) => {
    getRole.mockReturnValue(role);
    render(<RemediationTab volunteers={volunteers} />);

    expect(screen.queryByText("Upload Textbook")).not.toBeInTheDocument();
    expect(screen.queryByText("Assigned to")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /delete/i })).not.toBeInTheDocument();
  }
);
