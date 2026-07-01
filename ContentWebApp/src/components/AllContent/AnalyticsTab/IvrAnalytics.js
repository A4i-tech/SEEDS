import React from "react";
import ContentUsageChart from "./ContentUsageChart";
import { formatSeconds, formatRate } from "../../../utils/durationHelpers";
import { getRole } from "../../../utils/authHelpers";
import "../shared/tables.css";
import "./css/AnalyticsStats.css";

const IvrAnalytics = ({ data, onExport }) => {
  if (!data) {
    return null;
  }

  const { totals, sessionLength, bySchool, byTeacher, contentUsage } = data;
  const isTenant = getRole() === "tenant";

  if (totals.totalCalls === 0) {
    return (
      <div className="no-data-message">
        No IVR calls found for the selected date range and filters.
      </div>
    );
  }

  const statCards = [
    { label: "Total Calls", value: totals.totalCalls, color: "#4CAF50" },
    {
      label: "Avg Session Length",
      value: formatSeconds(sessionLength.averageSeconds),
      color: "#2196F3",
    },
    {
      label: "Median Session Length",
      value: formatSeconds(sessionLength.medianSeconds),
      color: "#FF9800",
    },
    {
      label: "Drop / Failure Rate",
      value: formatRate(totals.dropFailureRate),
      color: "#f44336",
    },
  ];

  return (
    <div className="stats-container">
      <div className="analytics-section-header">
        <h3 className="stats-title">IVR Analytics</h3>
        <button type="button" className="export-button" onClick={() => onExport("ivr", "calls")}>
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

      <ContentUsageChart data={contentUsage} />

      {isTenant && bySchool.length > 0 && (
        <div className="chart-section">
          <div className="analytics-section-header">
            <h4 className="chart-title">By School</h4>
            <button
              type="button"
              className="export-button"
              onClick={() => onExport("ivr", "bySchool")}
            >
              Export CSV
            </button>
          </div>
          <div className="table-wrapper">
            <table className="content-table">
              <thead>
                <tr>
                  <th className="table-header">School</th>
                  <th className="table-header">Total Calls</th>
                  <th className="table-header">Avg Session</th>
                  <th className="table-header">Median Session</th>
                  <th className="table-header">Failure Rate</th>
                </tr>
              </thead>
              <tbody>
                {bySchool.map((school) => (
                  <tr key={school.schoolId} className="table-row-white">
                    <td className="table-cell">{school.schoolName}</td>
                    <td className="table-cell">{school.totalCalls}</td>
                    <td className="table-cell">{formatSeconds(school.averageSeconds)}</td>
                    <td className="table-cell">{formatSeconds(school.medianSeconds)}</td>
                    <td className="table-cell">{formatRate(school.failureRate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {byTeacher.length > 0 && (
        <div className="chart-section">
          <div className="analytics-section-header">
            <h4 className="chart-title">By Teacher</h4>
            <button
              type="button"
              className="export-button"
              onClick={() => onExport("ivr", "byTeacher")}
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
                  <th className="table-header">Total Calls</th>
                  <th className="table-header">Avg Session</th>
                  <th className="table-header">Failure Rate</th>
                </tr>
              </thead>
              <tbody>
                {byTeacher.map((teacher) => (
                  <tr key={teacher.teacherId} className="table-row-white">
                    <td className="table-cell">{teacher.teacherName}</td>
                    <td className="table-cell">{teacher.schoolName}</td>
                    <td className="table-cell">{teacher.totalCalls}</td>
                    <td className="table-cell">{formatSeconds(teacher.averageSeconds)}</td>
                    <td className="table-cell">{formatRate(teacher.failureRate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {totals.unattributedCalls > 0 && (
        <div className="analytics-footnote">
          {totals.unattributedCalls} call{totals.unattributedCalls !== 1 ? "s" : ""} could not be
          matched to a registered teacher or student.
        </div>
      )}
    </div>
  );
};

export default IvrAnalytics;
