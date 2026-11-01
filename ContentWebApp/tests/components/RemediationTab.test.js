import { render, screen } from "@testing-library/react";
import RemediationTab from "../../src/components/AllContent/RemediationTab/RemediationTab";
import { textbookRemediationService } from "../../src/services/textbookRemediationService";

jest.mock("react-router-dom", () => ({ useNavigate: () => jest.fn() }));
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
let mockJobs = [job()];
let mockAssignError = null;
jest.mock("../../src/hooks/useRemediationJobs", () => ({
  useRemediationJobs: () => ({
    jobs: mockJobs,
    isLoading: false,
    isUploading: false,
    error: null,
    assignError: mockAssignError,
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
  mockJobs = [job()];
  mockAssignError = null;
  textbookRemediationService.getLanguages.mockResolvedValue({ languages: [] });
});

test("manager sees the upload card and an assignee control", async () => {
  render(<RemediationTab volunteers={volunteers} canManage={true} />);

  expect(screen.getByText("Upload Textbook")).toBeInTheDocument();
  expect(screen.getByText("Assigned to")).toBeInTheDocument();
  expect(screen.getByText("Unassigned")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /delete/i })).toBeInTheDocument();
});

test("assigned volunteer still in the list shows their name", async () => {
  mockJobs = [job({ assigned_to: "vol-1" })];
  render(<RemediationTab volunteers={volunteers} canManage={true} />);

  expect(screen.getByText("Volunteer One")).toBeInTheDocument();
});

test("unassigned job still shows Unassigned", async () => {
  mockJobs = [job({ assigned_to: null })];
  render(<RemediationTab volunteers={volunteers} canManage={true} />);

  expect(screen.getByText("Unassigned")).toBeInTheDocument();
});

test("non-manager sees neither the upload card nor assignee controls", async () => {
  render(<RemediationTab volunteers={volunteers} canManage={false} />);

  expect(screen.queryByText("Upload Textbook")).not.toBeInTheDocument();
  expect(screen.queryByText("Assigned to")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /delete/i })).not.toBeInTheDocument();
});

test("assignment error is shown to a manager", async () => {
  mockAssignError = "volunteer_id must be an existing textbook remediation volunteer in this tenant";
  render(<RemediationTab volunteers={volunteers} canManage={true} />);

  expect(
    screen.getByText(/volunteer_id must be an existing textbook remediation volunteer in this tenant/)
  ).toBeInTheDocument();
});
