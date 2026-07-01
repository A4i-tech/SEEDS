import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import IvrAnalytics from "../../src/components/AllContent/AnalyticsTab/IvrAnalytics";
import { getRole } from "../../src/utils/authHelpers";

jest.mock("../../src/utils/authHelpers", () => ({
  getRole: jest.fn(),
}));
jest.mock(
  "../../src/components/AllContent/AnalyticsTab/ContentUsageChart",
  () => () => <div data-testid="content-usage-chart" />
);

const DATA = {
  totals: {
    totalCalls: 10,
    completedCalls: 7,
    failedCalls: 2,
    droppedCalls: 1,
    dropFailureRate: 0.3,
    unattributedCalls: 2,
  },
  sessionLength: { averageSeconds: 120, medianSeconds: 90, totalSeconds: 1200 },
  statusBreakdown: { completed: 7 },
  bySchool: [
    {
      schoolId: "s1",
      schoolName: "School A",
      totalCalls: 8,
      averageSeconds: 100,
      medianSeconds: 95,
      failureRate: 0.25,
    },
  ],
  byTeacher: [
    {
      teacherId: "t1",
      teacherName: "Teacher A",
      schoolName: "School A",
      totalCalls: 5,
      averageSeconds: 110,
      failureRate: 0.2,
    },
  ],
  contentUsage: [],
  calls: [],
};

describe("IvrAnalytics", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getRole.mockReturnValue("tenant");
  });

  test("renders stat cards with formatted values", () => {
    render(<IvrAnalytics data={DATA} onExport={jest.fn()} />);

    expect(screen.getAllByText("Total Calls").length).toBeGreaterThan(0);
    expect(screen.getByText("10")).toBeInTheDocument();
    expect(screen.getByText("2m 0s")).toBeInTheDocument();
    expect(screen.getByText("30%")).toBeInTheDocument();
  });

  test("renders by-school table for tenant and unattributed note", () => {
    render(<IvrAnalytics data={DATA} onExport={jest.fn()} />);

    expect(screen.getByText("By School")).toBeInTheDocument();
    expect(screen.getAllByText("School A").length).toBeGreaterThan(0);
    expect(screen.getByText(/could not be matched/)).toBeInTheDocument();
  });

  test("hides by-school table for school_admin", () => {
    getRole.mockReturnValue("school_admin");
    render(<IvrAnalytics data={DATA} onExport={jest.fn()} />);

    expect(screen.queryByText("By School")).not.toBeInTheDocument();
    expect(screen.getByText("By Teacher")).toBeInTheDocument();
  });

  test("export button calls onExport with kind and section", () => {
    const onExport = jest.fn();
    render(<IvrAnalytics data={DATA} onExport={onExport} />);

    fireEvent.click(screen.getAllByText("Export CSV")[0]);
    expect(onExport).toHaveBeenCalledWith("ivr", "calls");
  });

  test("shows empty state for zero calls", () => {
    render(
      <IvrAnalytics data={{ ...DATA, totals: { ...DATA.totals, totalCalls: 0 } }} onExport={jest.fn()} />
    );
    expect(screen.getByText(/No IVR calls found/)).toBeInTheDocument();
  });

  test("renders nothing without data", () => {
    const { container } = render(<IvrAnalytics data={null} onExport={jest.fn()} />);
    expect(container.firstChild).toBeNull();
  });
});
