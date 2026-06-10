import React from "react";
import ClassSizeDistributionChart from "./ClassSizeDistributionChart";
import { formatSeconds } from "../../../utils/durationHelpers";
import "../shared/tables.css";
import "./css/AnalyticsStats.css";

const ConferenceAnalytics = ({ data, onExport }) => {
  if (!data) {
    return null;
  }

  const { totals, duration, classSize, raisedHands, byTeacher, conferences } = data;

  if (totals.totalConferences === 0) {
    return (
      <div className="no-data-message">
        No conferences found for the selected date range and filters.
      </div>
    );
  }

  const statCards = [
    { label: "Total Conferences", value: totals.totalConferences, color: "#4CAF50" },
    { label: "Average Duration", value: formatSeconds(duration.averageSeconds), color: "#2196F3" },
    { label: "Median Duration", value: formatSeconds(duration.medianSeconds), color: "#FF9800" },
    { label: "Total Duration", value: formatSeconds(duration.totalSeconds), color: "#9C27B0" },
    { label: "Raised Hands", value: raisedHands.totalEvents, color: "#f44336" },
  ];

  return (
    <div className="stats-container">
      <div className="analytics-section-header">
        <h3 className="stats-title">Conference Analytics</h3>
        <button
          type="button"
          className="export-button"
          onClick={() => onExport("conference", "conferences")}
        >
          Export CSV
        </button>
      </div>

      <div className="stat-cards">
        {statCards.map((stat, index) => (
          <div key={index} className="stat-card" style={{ borderLeftColor: stat.color }}>
            <div className="stat-label">{stat.label}</div>
            <div className="stat-value">{stat.value}</div>
          </div>
        ))}
      </div>

      <ClassSizeDistributionChart data={classSize.distribution} />

      {byTeacher.length > 0 && (
        <div className="chart-section">
          <div className="analytics-section-header">
            <h4 className="chart-title">By Teacher</h4>
            <button
              type="button"
              className="export-button"
              onClick={() => onExport("conference", "byTeacher")}
            >
              Export CSV
            </button>
          </div>
          <div className="table-wrapper">
            <table className="content-table">
              <thead>
                <tr>
                  <th className="table-header">Teacher</th>
                  <th className="table-header">School</th>
                  <th className="table-header">Conferences</th>
                  <th className="table-header">Total Duration</th>
                  <th className="table-header">Avg Duration</th>
                  <th className="table-header">Avg Class Size</th>
                  <th className="table-header">Raised Hands</th>
                </tr>
              </thead>
              <tbody>
                {byTeacher.map((teacher) => (
                  <tr key={teacher.teacherId || teacher.teacherName} className="table-row-white">
                    <td className="table-cell">{teacher.teacherName}</td>
                    <td className="table-cell">{teacher.schoolName || "—"}</td>
                    <td className="table-cell">{teacher.totalConferences}</td>
                    <td className="table-cell">{formatSeconds(teacher.totalDurationSeconds)}</td>
                    <td className="table-cell">{formatSeconds(teacher.averageDurationSeconds)}</td>
                    <td className="table-cell">{teacher.averageClassSize ?? "—"}</td>
                    <td className="table-cell">{teacher.raisedHandEvents}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {conferences.length > 0 && (
        <div className="chart-section">
          <h4 className="chart-title">Sessions</h4>
          <div className="table-wrapper">
            <table className="content-table">
              <thead>
                <tr>
                  <th className="table-header">Teacher</th>
                  <th className="table-header">School</th>
                  <th className="table-header">Started</th>
                  <th className="table-header">Ended</th>
                  <th className="table-header">Duration</th>
                  <th className="table-header">Students</th>
                  <th className="table-header">Raised Hands</th>
                </tr>
              </thead>
              <tbody>
                {conferences.map((conference) => (
                  <tr key={conference.conferenceId} className="table-row-white">
                    <td className="table-cell">{conference.teacherName}</td>
                    <td className="table-cell">{conference.schoolName || "—"}</td>
                    <td className="table-cell">
                      {conference.startedAt ? new Date(conference.startedAt).toLocaleString() : "—"}
                    </td>
                    <td className="table-cell">
                      {conference.isRunning
                        ? "Live"
                        : conference.endedAt
                          ? new Date(conference.endedAt).toLocaleString()
                          : "—"}
                    </td>
                    <td className="table-cell">{formatSeconds(conference.durationSeconds)}</td>
                    <td className="table-cell">{conference.studentCount}</td>
                    <td className="table-cell">{conference.raisedHandEvents}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default ConferenceAnalytics;
