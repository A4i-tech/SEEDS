import React from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { exportToCSV, exportToJSON } from "../../../utils/exportHelpers";
import "./css/AnalyticsCharts.css";

const CallsByDateChart = ({ data }) => {
  if (!data || Object.keys(data).length === 0) {
    return <div className="no-data-message">No data available for the selected date range.</div>;
  }

  // Convert callsByDate object to array for charting
  const chartData = Object.entries(data)
    .map(([date, count]) => ({
      date,
      count,
    }))
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload[0]) {
      const { date, count } = payload[0].payload;
      return (
        <div className="chart-tooltip">
          <p className="chart-tooltip-date">{date}</p>
          <p className="chart-tooltip-accent">Calls: {count}</p>
        </div>
      );
    }
    return null;
  };

  const handleExportCSV = () => {
    exportToCSV(chartData, ["date", "count"], "calls-by-date");
  };

  const handleExportJSON = () => {
    exportToJSON(chartData, "calls-by-date");
  };

  return (
    <div className="chart-block">
      <div className="chart-header">
        <h4 className="chart-title">Calls by Date Trend</h4>
        <div className="export-buttons">
          <button className="export-button" onClick={handleExportCSV}>
            CSV
          </button>
          <button className="export-button" onClick={handleExportJSON}>
            JSON
          </button>
        </div>
      </div>
      <div className="chart-card">
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={chartData} margin={{ top: 5, right: 30, left: 0, bottom: 50 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis
              dataKey="date"
              angle={-45}
              textAnchor="end"
              height={100}
              tick={{ fontSize: 12, fill: "#666" }}
            />
            <YAxis
              label={{
                value: "Number of Calls",
                angle: -90,
                position: "insideLeft",
              }}
              tick={{ fontSize: 12, fill: "#666" }}
            />
            <Tooltip content={<CustomTooltip />} />
            <Line
              type="monotone"
              dataKey="count"
              stroke="#2196F3"
              strokeWidth={2}
              dot={{ fill: "#2196F3", r: 4 }}
              activeDot={{ r: 6 }}
              isAnimationActive={true}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default CallsByDateChart;
