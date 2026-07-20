import React from "react";
import "../shared/tables.css";
import "../shared/utilities.css";
import "./css/AnalyticsStats.css";
import MetricCards from "./MetricCards";
import DistributionChart from "./DistributionChart";
import { formatDuration, formatPercent, formatNumber } from "./format";
import { exportToCSV } from "../../../utils/exportHelpers";

const IvrAnalytics = ({ data }) => {
  if (!data) return null;

  const totals = data.totals || {};
  const session = data.sessionLength || {};
  const bySchool = data.bySchool || [];
  const byTeacher = data.byTeacher || [];
  const contentUsage = data.contentUsage || [];
  const statusBreakdown = data.statusBreakdown || {};

  const summaryCards = [
    { label: "Total Calls", value: formatNumber(totals.totalCalls), color: "#4CAF50" },
    { label: "Completed", value: formatNumber(totals.completedCalls), color: "#2196F3" },
    { label: "Failed", value: formatNumber(totals.failedCalls), color: "#F44336" },
    { label: "Dropped", value: formatNumber(totals.droppedCalls), color: "#FF9800" },
    {
      label: "Drop / Failure Rate",
      value: formatPercent(totals.dropFailureRate),
      color: "#E91E63",
    },
    { label: "Unattributed", value: formatNumber(totals.unattributedCalls), color: "#9E9E9E" },
  ];

  const sessionCards = [
    { label: "Avg Session", value: formatDuration(session.averageSeconds), color: "#673AB7" },
    { label: "Median Session", value: formatDuration(session.medianSeconds), color: "#3F51B5" },
    { label: "Total Session Time", value: formatDuration(session.totalSeconds), color: "#009688" },
  ];

  const statusData = Object.entries(statusBreakdown).map(([label, count]) => ({
    label,
    count,
  }));

  return (
    <div className="stats-container">
      <h3 className="stats-title">IVR Call Summary</h3>
      <MetricCards cards={summaryCards} />

      <h3 className="stats-title" style={{ marginTop: 30 }}>
        Session Length
      </h3>
      <MetricCards cards={sessionCards} />

      {statusData.length > 0 && (
        <div className="chart-section">
          <DistributionChart title="Call Status Breakdown" data={statusData} color="#2196F3" />
        </div>
      )}

      {contentUsage.length > 0 && (
        <div className="chart-section">
          <div className="chart-header">
            <h4 className="chart-title">Audio Content Usage</h4>
            <div className="export-buttons">
              <button
                className="export-button"
                onClick={() =>
                  exportToCSV(
                    contentUsage,
                    ["title", "playCount", "completedPlays", "uniqueCallers"],
                    "ivr-content-usage"
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
                  <th className="table-header">Content</th>
                  <th className="table-header">Plays</th>
                  <th className="table-header">Completed Plays</th>
                  <th className="table-header">Unique Callers</th>
                </tr>
              </thead>
              <tbody>
                {contentUsage.map((c, i) => (
                  <tr key={c.contentId || c.streamUrl || i} className="table-row-white">
                    <td className="table-cell">{c.title}</td>
                    <td className="table-cell">{formatNumber(c.playCount)}</td>
                    <td className="table-cell">{formatNumber(c.completedPlays)}</td>
                    <td className="table-cell">{formatNumber(c.uniqueCallers)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {bySchool.length > 0 && (
        <div className="chart-section">
          <div className="chart-header">
            <h4 className="chart-title">By School</h4>
            <div className="export-buttons">
              <button
                className="export-button"
                onClick={() =>
                  exportToCSV(
                    bySchool,
                    ["schoolName", "totalCalls", "averageSeconds", "medianSeconds", "failureRate"],
                    "ivr-by-school"
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
                  <th className="table-header">School</th>
                  <th className="table-header">Total Calls</th>
                  <th className="table-header">Avg</th>
                  <th className="table-header">Median</th>
                  <th className="table-header">Failure Rate</th>
                </tr>
              </thead>
              <tbody>
                {bySchool.map((s, i) => (
                  <tr key={s.schoolId || i} className="table-row-white">
                    <td className="table-cell">{s.schoolName}</td>
                    <td className="table-cell">{formatNumber(s.totalCalls)}</td>
                    <td className="table-cell">{formatDuration(s.averageSeconds)}</td>
                    <td className="table-cell">{formatDuration(s.medianSeconds)}</td>
                    <td className="table-cell">{formatPercent(s.failureRate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
                    ["teacherName", "schoolName", "totalCalls", "averageSeconds", "failureRate"],
                    "ivr-by-teacher"
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
                  <th className="table-header">Total Calls</th>
                  <th className="table-header">Avg</th>
                  <th className="table-header">Failure Rate</th>
                </tr>
              </thead>
              <tbody>
                {byTeacher.map((t, i) => (
                  <tr key={t.teacherId || i} className="table-row-white">
                    <td className="table-cell">{t.teacherName}</td>
                    <td className="table-cell">{t.schoolName}</td>
                    <td className="table-cell">{formatNumber(t.totalCalls)}</td>
                    <td className="table-cell">{formatDuration(t.averageSeconds)}</td>
                    <td className="table-cell">{formatPercent(t.failureRate)}</td>
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

export default IvrAnalytics;
