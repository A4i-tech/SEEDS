import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import ConferenceAnalytics from "../../src/components/AllContent/AnalyticsTab/ConferenceAnalytics";

jest.mock(
  "../../src/components/AllContent/AnalyticsTab/ClassSizeDistributionChart",
  () => () => <div data-testid="class-size-chart" />
);

const DATA = {
  totals: { totalConferences: 3, completedConferences: 2, liveConferences: 1, neverStarted: 0 },
  duration: { averageSeconds: 1200, medianSeconds: 1200, totalSeconds: 2400 },
  classSize: {
    average: 3,
    median: 2,
    distribution: [{ bucket: "1-5", count: 2 }],
  },
  raisedHands: { totalEvents: 4, averagePerConference: 1.3 },
  byTeacher: [
    {
      teacherId: "t1",
      teacherName: "Teacher A",
      schoolName: "School A",
      totalConferences: 2,
      totalDurationSeconds: 1800,
      averageDurationSeconds: 900,
      averageClassSize: 2.5,
      raisedHandEvents: 4,
    },
  ],
  conferences: [
    {
      conferenceId: "conf-1",
      teacherName: "Teacher A",
      schoolName: "School A",
      startedAt: "2026-06-01T10:01:00.000Z",
      endedAt: "2026-06-01T10:31:00.000Z",
      durationSeconds: 1800,
      studentCount: 2,
      raisedHandEvents: 1,
      isRunning: false,
    },
    {
      conferenceId: "conf-2",
      teacherName: "Teacher A",
      schoolName: "School A",
      startedAt: "2026-06-05T09:01:00.000Z",
      endedAt: null,
      durationSeconds: null,
      studentCount: 1,
      raisedHandEvents: 0,
      isRunning: true,
    },
  ],
};

describe("ConferenceAnalytics", () => {
  test("renders stat cards and chart", () => {
    render(<ConferenceAnalytics data={DATA} onExport={jest.fn()} />);

    expect(screen.getByText("Total Conferences")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getAllByText("Raised Hands").length).toBeGreaterThan(0);
    expect(screen.getByTestId("class-size-chart")).toBeInTheDocument();
  });

  test("renders by-teacher and sessions tables", () => {
    render(<ConferenceAnalytics data={DATA} onExport={jest.fn()} />);

    expect(screen.getByText("By Teacher")).toBeInTheDocument();
    expect(screen.getByText("Sessions")).toBeInTheDocument();
    expect(screen.getByText("Live")).toBeInTheDocument();
  });

  test("export buttons call onExport with section", () => {
    const onExport = jest.fn();
    render(<ConferenceAnalytics data={DATA} onExport={onExport} />);

    const buttons = screen.getAllByText("Export CSV");
    fireEvent.click(buttons[0]);
    expect(onExport).toHaveBeenCalledWith("conference", "conferences");
    fireEvent.click(buttons[1]);
    expect(onExport).toHaveBeenCalledWith("conference", "byTeacher");
  });

  test("shows empty state for zero conferences", () => {
    render(
      <ConferenceAnalytics
        data={{ ...DATA, totals: { ...DATA.totals, totalConferences: 0 } }}
        onExport={jest.fn()}
      />
    );
    expect(screen.getByText(/No conferences found/)).toBeInTheDocument();
  });

  test("renders nothing without data", () => {
    const { container } = render(<ConferenceAnalytics data={null} onExport={jest.fn()} />);
    expect(container.firstChild).toBeNull();
  });
});
