import { render, screen } from "@testing-library/react";
import AllContent from "../../src/components/AllContent";
import { contentService } from "../../src/services/contentService";
import { contentAggregatorService } from "../../src/services/contentAggregatorService";
import { getRole } from "../../src/utils/authHelpers";

jest.mock("react-router-dom", () => ({
  useNavigate: () => jest.fn(),
  useSearchParams: () => [new URLSearchParams()],
}));

jest.mock("../../src/utils/authHelpers", () => ({ getRole: jest.fn() }));

jest.mock("../../src/services/contentService", () => ({
  contentService: { getContent: jest.fn(), deleteContent: jest.fn() },
}));

jest.mock("../../src/services/contentAggregatorService", () => ({
  contentAggregatorService: {
    getCourses: jest.fn(),
    getActiveJobs: jest.fn(),
    deleteCourse: jest.fn(),
    streamJob: jest.fn(),
    getSyncStatus: jest.fn(),
    syncAll: jest.fn(),
    syncCourse: jest.fn(),
  },
}));

jest.mock("../../src/services/ivrService", () => ({ ivrService: { updateIVR: jest.fn() } }));

const mockGetCurrentUser = jest.fn();

jest.mock("../../src/hooks/useAuth", () => ({
  useAuth: () => ({
    getAuthHeaders: () => ({}),
    logout: jest.fn(),
    getCurrentUser: mockGetCurrentUser,
  }),
}));

jest.mock("../../src/hooks/useTeachers", () => ({
  useTeachers: () => ({
    teachers: [],
    students: [],
    isLoading: false,
    message: "",
    messageType: "success",
    registerTeacher: jest.fn(),
    addStudent: jest.fn(),
    updateStudentById: jest.fn(),
    deleteStudentById: jest.fn(),
    updateTeacher: jest.fn(),
    deleteTeacher: jest.fn(),
    transferTeacher: jest.fn(),
  }),
}));

jest.mock("../../src/hooks/useSchools", () => ({
  useSchools: () => ({
    schools: [],
    isLoading: false,
    message: "",
    messageType: "success",
    createSchool: jest.fn(),
    updateSchool: jest.fn(),
    deleteSchool: jest.fn(),
  }),
}));

jest.mock("../../src/hooks/useVolunteers", () => ({
  useVolunteers: () => ({
    volunteers: [],
    isLoading: false,
    message: "",
    messageType: "success",
    createVolunteer: jest.fn(),
  }),
}));

jest.mock("../../src/components/AllContent/RemediationTab/RemediationTab", () => () => (
  <div>Remediation Tab Content</div>
));
jest.mock("../../src/components/AllContent/ContentTab/ContentTab", () => () => <div>Content Tab</div>);
jest.mock("../../src/components/AllContent/RegistrationTab/RegistrationTab", () => () => <div>Registration Tab</div>);
jest.mock("../../src/components/AllContent/AnalyticsTab/AnalyticsTab", () => () => <div>Analytics Tab</div>);
jest.mock("../../src/components/AllContent/LocalizationTab/LocalizationTab", () => () => <div>Localization Tab</div>);
jest.mock("../../src/components/AllContent/IVRTab/IVRTab", () => () => <div>IVR Tab</div>);

beforeEach(() => {
  jest.clearAllMocks();
  getRole.mockReturnValue("textbook_remediation_volunteer");
  mockGetCurrentUser.mockResolvedValue({ name: "Vera Volunteer", role: "textbook_remediation_volunteer" });
});

test("a volunteer never calls content or content-aggregator APIs, and only sees Textbooks", async () => {
  render(<AllContent />);

  expect(await screen.findByText("Remediation Tab Content")).toBeInTheDocument();

  expect(screen.getByRole("button", { name: "Textbooks" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Content" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Registration" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Analytics" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Localization" })).not.toBeInTheDocument();

  expect(contentService.getContent).not.toHaveBeenCalled();
  expect(contentAggregatorService.getCourses).not.toHaveBeenCalled();
});

test("a role with no tabs shows the no-sections message", async () => {
  getRole.mockReturnValue("student");
  mockGetCurrentUser.mockResolvedValue({ name: "Sam Student", role: "student" });

  render(<AllContent />);

  expect(await screen.findByText("No sections are available for your role.")).toBeInTheDocument();
  expect(screen.queryByText("Remediation Tab Content")).not.toBeInTheDocument();
});

test("a removed active tab resets to the first available tab", async () => {
  mockGetCurrentUser.mockResolvedValueOnce({ name: "Terry Teacher", role: "teacher" });
  contentService.getContent.mockResolvedValue({ items: [], next_cursor: null, has_more: false });
  contentAggregatorService.getCourses.mockResolvedValue({ courses: [], next_cursor: null, has_more: false });
  contentAggregatorService.getActiveJobs.mockResolvedValue([]);
  contentAggregatorService.getSyncStatus.mockResolvedValue({});

  render(<AllContent />);

  expect(await screen.findByText("Content Tab")).toBeInTheDocument();
  expect(screen.queryByText("Remediation Tab Content")).not.toBeInTheDocument();
});
