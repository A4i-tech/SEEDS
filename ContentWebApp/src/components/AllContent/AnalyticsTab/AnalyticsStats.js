import React from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { exportToCSV, exportToJSON } from "../../../utils/exportHelpers";
import { colorPalette } from "../../../utils/analyticsHelpers";
import "../shared/tables.css";
import "../shared/utilities.css";
import "./css/AnalyticsStats.css";
import "./css/AnalyticsCharts.css";
import CallsByDateChart from "./CallsByDateChart";
import StepDepthChart from "./StepDepthChart";

const AnalyticsStats = ({ stats, teacherMap }) => {
  const statCards = [
    { label: "Total Calls", value: stats.totalCalls, color: "#4CAF50" },
    { label: "Unique Users", value: stats.uniqueUsers, color: "#2196F3" },
    { label: "Average Duration", value: stats.avgDuration, color: "#FF9800" },
    { label: "Median Duration", value: stats.medianDuration, color: "#00BCD4" },
    { label: "Total Duration", value: stats.totalDuration, color: "#9C27B0" },
    {
      label: "Drop/Failure Rate",
      value: `${stats.dropRate}% (${stats.droppedCalls})`,
      color: "#f44336",
    },
  ];

  const hasCallsByDate = Object.keys(stats.callsByDate).length > 0;
  const hasStepDepth = stats.stepDepthData && stats.stepDepthData.length > 0;
  const hasContentUsage = stats.contentUsage && stats.contentUsage.length > 0;
  const hasCallsByPhone =
    stats.callsByPhone && Object.keys(stats.callsByPhone).length > 0;

  const callsByPhoneData = hasCallsByPhone
    ? Object.entries(stats.callsByPhone)
        .map(([phone, count]) => ({
          caller: (teacherMap && teacherMap[phone]) || phone,
          count,
        }))
        .sort((a, b) => b.count - a.count)
    : [];

  return (
    <div className="stats-container">
      <h3 className="stats-title">IVR Statistics</h3>
      <div className="stat-cards">
        {statCards.map((stat, index) => (
          <div key={index} className="stat-card" style={{ borderLeftColor: stat.color }}>
            <div className="stat-label">{stat.label}</div>
            <div className="stat-value">{stat.value}</div>
          </div>
        ))}
      </div>

      {hasCallsByDate && <CallsByDateChart data={stats.callsByDate} />}

      {hasStepDepth && <StepDepthChart data={stats.stepDepthData} />}

      {hasContentUsage && (
        <div className="chart-block">
          <div className="chart-header">
            <h4 className="chart-title">Audio Content Usage</h4>
            <div className="export-buttons">
              <button
                className="export-button"
                onClick={() =>
                  exportToCSV(stats.contentUsage, ["content", "count"], "content-usage")
                }
              >
                CSV
              </button>
              <button
                className="export-button"
                onClick={() => exportToJSON(stats.contentUsage, "content-usage")}
              >
                JSON
              </button>
            </div>
          </div>
          <div className="chart-card">
            <ResponsiveContainer width="100%" height={Math.max(300, stats.contentUsage.length * 35)}>
              <BarChart
                data={stats.contentUsage}
                layout="vertical"
                margin={{ top: 5, right: 30, left: 150, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis type="number" tick={{ fontSize: 12, fill: "#666" }} />
                <YAxis
                  dataKey="content"
                  type="category"
                  width={140}
                  tick={{ fontSize: 11, fill: "#666" }}
                />
                <Tooltip />
                <Bar dataKey="count" isAnimationActive={true}>
                  {stats.contentUsage.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={colorPalette[index % colorPalette.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {callsByPhoneData.length > 0 && (
        <div className="chart-block">
          <div className="chart-header">
            <h4 className="chart-title">Calls by Caller</h4>
            <div className="export-buttons">
              <button
                className="export-button"
                onClick={() =>
                  exportToCSV(callsByPhoneData, ["caller", "count"], "calls-by-caller")
                }
              >
                CSV
              </button>
              <button
                className="export-button"
                onClick={() => exportToJSON(callsByPhoneData, "calls-by-caller")}
              >
                JSON
              </button>
            </div>
          </div>
          <div className="chart-card">
            <ResponsiveContainer width="100%" height={Math.max(300, callsByPhoneData.length * 40)}>
              <BarChart
                data={callsByPhoneData}
                layout="vertical"
                margin={{ top: 5, right: 30, left: 100, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis type="number" tick={{ fontSize: 12, fill: "#666" }} />
                <YAxis
                  dataKey="caller"
                  type="category"
                  width={90}
                  tick={{ fontSize: 12, fill: "#666" }}
                />
                <Tooltip />
                <Bar dataKey="count" isAnimationActive={true}>
                  {callsByPhoneData.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={colorPalette[index % colorPalette.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {hasCallsByDate && (
        <div className="chart-section">
          <h4 className="chart-title">Calls by Date (Detailed)</h4>
          <div className="table-wrapper">
            <table className="content-table">
              <thead>
                <tr>
                  <th className="table-header">Date</th>
                  <th className="table-header">Number of Calls</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(stats.callsByDate)
                  .sort(([dateA], [dateB]) => new Date(dateA) - new Date(dateB))
                  .map(([date, count]) => (
                    <tr key={date} className="table-row-white">
                      <td className="table-cell">{date}</td>
                      <td className="table-cell">{count}</td>
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

export default AnalyticsStats;
