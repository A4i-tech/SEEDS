import React from "react";
import {
  LineChart,
  Line,
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
import "../shared/tables.css";
import "../shared/utilities.css";
import "./css/AnalyticsStats.css";
import "./css/AnalyticsCharts.css";

const colorPalette = [
  "#4CAF50",
  "#2196F3",
  "#FF9800",
  "#9C27B0",
  "#f44336",
  "#00BCD4",
  "#8BC34A",
  "#FFC107",
];

const ChartTooltip = ({ active, payload, labelKey, valueKey, valueLabel }) => {
  if (active && payload && payload[0]) {
    return (
      <div className="chart-tooltip">
        <p className="chart-tooltip-date">{payload[0].payload[labelKey]}</p>
        <p className="chart-tooltip-accent">
          {valueLabel}: {payload[0].payload[valueKey]}
        </p>
      </div>
    );
  }
  return null;
};

const ConferenceAnalyticsStats = ({ stats }) => {
  const statCards = [
    { label: "Total Conferences", value: stats.totalConferences, color: "#4CAF50" },
    { label: "Average Duration", value: stats.avgDuration, color: "#2196F3" },
    { label: "Median Duration", value: stats.medianDuration, color: "#FF9800" },
    { label: "Total Raised Hands", value: stats.totalRaisedHands, color: "#9C27B0" },
  ];

  const hasConferencesByDate = Object.keys(stats.conferencesByDate).length > 0;
  const hasConferencesByTeacher = stats.conferencesByTeacher.length > 0;
  const hasClassSize = stats.classSizeDistribution.length > 0;

  const conferencesByDateData = Object.entries(stats.conferencesByDate)
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  return (
    <div className="stats-container">
      <h3 className="stats-title">Conference Statistics</h3>
      <div className="stat-cards">
        {statCards.map((stat, index) => (
          <div key={index} className="stat-card" style={{ borderLeftColor: stat.color }}>
            <div className="stat-label">{stat.label}</div>
            <div className="stat-value">{stat.value}</div>
          </div>
        ))}
      </div>

      {hasConferencesByDate && (
        <div className="chart-block">
          <div className="chart-header">
            <h4 className="chart-title">Conferences by Date</h4>
            <div className="export-buttons">
              <button
                className="export-button"
                onClick={() =>
                  exportToCSV(conferencesByDateData, ["date", "count"], "conferences-by-date")
                }
              >
                CSV
              </button>
              <button
                className="export-button"
                onClick={() => exportToJSON(conferencesByDateData, "conferences-by-date")}
              >
                JSON
              </button>
            </div>
          </div>
          <div className="chart-card">
            <ResponsiveContainer width="100%" height={300}>
              <LineChart
                data={conferencesByDateData}
                margin={{ top: 5, right: 30, left: 0, bottom: 50 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis
                  dataKey="date"
                  angle={-45}
                  textAnchor="end"
                  height={100}
                  tick={{ fontSize: 12, fill: "#666" }}
                />
                <YAxis
                  label={{ value: "Conferences", angle: -90, position: "insideLeft" }}
                  tick={{ fontSize: 12, fill: "#666" }}
                />
                <Tooltip
                  content={
                    <ChartTooltip
                      labelKey="date"
                      valueKey="count"
                      valueLabel="Conferences"
                    />
                  }
                />
                <Line
                  type="monotone"
                  dataKey="count"
                  stroke="#4CAF50"
                  strokeWidth={2}
                  dot={{ fill: "#4CAF50", r: 4 }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {hasConferencesByTeacher && (
        <div className="chart-block">
          <div className="chart-header">
            <h4 className="chart-title">Conferences by Teacher</h4>
            <div className="export-buttons">
              <button
                className="export-button"
                onClick={() =>
                  exportToCSV(
                    stats.conferencesByTeacher,
                    ["teacher", "count"],
                    "conferences-by-teacher"
                  )
                }
              >
                CSV
              </button>
              <button
                className="export-button"
                onClick={() =>
                  exportToJSON(stats.conferencesByTeacher, "conferences-by-teacher")
                }
              >
                JSON
              </button>
            </div>
          </div>
          <div className="chart-card">
            <ResponsiveContainer width="100%" height={Math.max(300, stats.conferencesByTeacher.length * 40)}>
              <BarChart
                data={stats.conferencesByTeacher}
                layout="vertical"
                margin={{ top: 5, right: 30, left: 100, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis
                  type="number"
                  tick={{ fontSize: 12, fill: "#666" }}
                  label={{ value: "Conferences", position: "insideBottomRight", offset: -5 }}
                />
                <YAxis
                  dataKey="teacher"
                  type="category"
                  width={90}
                  tick={{ fontSize: 12, fill: "#666" }}
                />
                <Tooltip
                  content={
                    <ChartTooltip
                      labelKey="teacher"
                      valueKey="count"
                      valueLabel="Conferences"
                    />
                  }
                />
                <Bar dataKey="count" isAnimationActive={true}>
                  {stats.conferencesByTeacher.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={colorPalette[index % colorPalette.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {hasClassSize && (
        <div className="chart-block">
          <div className="chart-header">
            <h4 className="chart-title">Class Size Distribution</h4>
            <div className="export-buttons">
              <button
                className="export-button"
                onClick={() =>
                  exportToCSV(
                    stats.classSizeDistribution,
                    ["size", "label", "count"],
                    "class-size-distribution"
                  )
                }
              >
                CSV
              </button>
              <button
                className="export-button"
                onClick={() =>
                  exportToJSON(stats.classSizeDistribution, "class-size-distribution")
                }
              >
                JSON
              </button>
            </div>
          </div>
          <div className="chart-card">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart
                data={stats.classSizeDistribution}
                margin={{ top: 5, right: 30, left: 0, bottom: 50 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis
                  dataKey="label"
                  angle={-45}
                  textAnchor="end"
                  height={80}
                  tick={{ fontSize: 12, fill: "#666" }}
                />
                <YAxis
                  label={{ value: "Sessions", angle: -90, position: "insideLeft" }}
                  tick={{ fontSize: 12, fill: "#666" }}
                />
                <Tooltip
                  content={
                    <ChartTooltip labelKey="label" valueKey="count" valueLabel="Sessions" />
                  }
                />
                <Bar dataKey="count" fill="#9C27B0" isAnimationActive={true}>
                  {stats.classSizeDistribution.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={colorPalette[index % colorPalette.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="chart-summary">
            <strong>Total sessions:</strong>{" "}
            {stats.classSizeDistribution.reduce((sum, d) => sum + d.count, 0)}
            <br />
            <strong>Most common class size:</strong>{" "}
            {stats.classSizeDistribution.reduce((max, d) => (d.count > max.count ? d : max), {
              count: 0,
            })?.label || "N/A"}
          </div>
        </div>
      )}

      {hasConferencesByDate && (
        <div className="chart-section">
          <h4 className="chart-title">Conferences by Date (Detailed)</h4>
          <div className="table-wrapper">
            <table className="content-table">
              <thead>
                <tr>
                  <th className="table-header">Date</th>
                  <th className="table-header">Number of Conferences</th>
                </tr>
              </thead>
              <tbody>
                {conferencesByDateData.map(({ date, count }) => (
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

export default ConferenceAnalyticsStats;
