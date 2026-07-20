import React from "react";
import "../shared/tables.css";
import "../shared/utilities.css";
import "./css/AnalyticsStats.css";
import MetricCards from "./MetricCards";
import DistributionChart from "./DistributionChart";
import { formatDuration, formatNumber } from "./format";
import { exportToCSV } from "../../../utils/exportHelpers";

const ConferenceAnalytics = ({ data }) => {
  if (!data) return null;

  const totals = data.totals || {};
  const duration = data.duration || {};
  const classSize = data.classSize || {};
  const raisedHands = data.raisedHands || {};
  const byTeacher = data.byTeacher || [];

  const summaryCards = [
    { label: "Total Conferences", value: formatNumber(totals.totalConferences), color: "#4CAF50" },
    { label: "Completed", value: formatNumber(totals.completedConferences), color: "#2196F3" },
    { label: "Live Now", value: formatNumber(totals.liveConferences), color: "#009688" },
    { label: "Never Started", value: formatNumber(totals.neverStarted), color: "#9E9E9E" },
  ];

  const durationCards = [
    { label: "Avg Duration", value: formatDuration(duration.averageSeconds), color: "#673AB7" },
    { label: "Median Duration", value: formatDuration(duration.medianSeconds), color: "#3F51B5" },
    { label: "Total Duration", value: formatDuration(duration.totalSeconds), color: "#009688" },
    { label: "Avg Class Size", value: formatNumber(classSize.average), color: "#FF9800" },
    { label: "Median Class Size", value: formatNumber(classSize.median), color: "#FF5722" },
    {
      label: "Raised Hands (total)",
      value: formatNumber(raisedHands.totalEvents),
      color: "#E91E63",
    },
    {
      label: "Raised Hands / Conf",
      value: formatNumber(raisedHands.averagePerConference),
      color: "#C2185B",
    },
  ];

  // classSize.distribution: backend returns an array of {bucket, count};
  // tolerate {label, count} arrays and {label: count} objects too.
  const distributionData = (
    Array.isArray(classSize.distribution)
      ? classSize.distribution
      : Object.entries(classSize.distribution || {}).map(([label, count]) => ({ label, count }))
  ).map((d) => ({ label: d.label ?? d.bucket ?? "", count: d.count ?? 0 }));

  return (
    <div className="stats-container">
      <h3 className="stats-title">Conference Summary</h3>
      <MetricCards cards={summaryCards} />

      <h3 className="stats-title" style={{ marginTop: 30 }}>
        Duration, Class Size & Engagement
      </h3>
      <MetricCards cards={durationCards} />

      {distributionData.length > 0 && (
        <div className="chart-section">
          <DistributionChart
            title="Class Size Distribution"
            data={distributionData}
            color="#FF9800"
          />
        </div>
      )}

      {byTeacher.length > 0 && (
        <div className="chart-section">
          <div className="chart-header">
            <h4 className="chart-title">By Teacher</h4>
            <div className="export-buttons">
              <button
                className="export-button"
                onClick={() =>
                  exportToCSV(
                    byTeacher,
                    [
                      "teacherName",
                      "schoolName",
                      "totalConferences",
                      "totalDurationSeconds",
                      "averageDurationSeconds",
                      "averageClassSize",
                      "raisedHandEvents",
                    ],
                    "conference-by-teacher"
                  )
                }
              >
                CSV
              </button>
            </div>
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
                {byTeacher.map((t, i) => (
                  <tr key={t.teacherId || i} className="table-row-white">
                    <td className="table-cell">{t.teacherName}</td>
                    <td className="table-cell">{t.schoolName}</td>
                    <td className="table-cell">{formatNumber(t.totalConferences)}</td>
                    <td className="table-cell">{formatDuration(t.totalDurationSeconds)}</td>
                    <td className="table-cell">{formatDuration(t.averageDurationSeconds)}</td>
                    <td className="table-cell">{formatNumber(t.averageClassSize)}</td>
                    <td className="table-cell">{formatNumber(t.raisedHandEvents)}</td>
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
