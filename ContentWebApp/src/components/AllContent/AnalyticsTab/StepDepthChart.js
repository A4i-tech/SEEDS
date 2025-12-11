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
import "./css/AnalyticsCharts.css";

const StepDepthChart = ({ data }) => {
  if (!data || data.length === 0) {
    return (
      <div className="no-data-message">
        No step depth data available for the selected date range.
      </div>
    );
  }

  // Color palette matching the design system
  const colorPalette = [
    "#4CAF50", // green
    "#2196F3", // blue
    "#FF9800", // orange
    "#9C27B0", // purple
    "#f44336", // red
    "#00BCD4", // cyan
    "#8BC34A", // light green
    "#FFC107", // amber
  ];

  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload[0]) {
      const { label, count } = payload[0].payload;
      return (
        <div className="chart-tooltip">
          <p className="chart-tooltip-date">{label}</p>
          <p className="chart-tooltip-accent">Calls: {count}</p>
        </div>
      );
    }
    return null;
  };

  const handleExportCSV = () => {
    exportToCSV(data, ["depth", "label", "count"], "step-depth-distribution");
  };

  const handleExportJSON = () => {
    exportToJSON(data, "step-depth-distribution");
  };

  return (
    <div className="chart-block">
      <div className="chart-header">
        <h4 className="chart-title">IVR Step Depth Distribution</h4>
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
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 5, right: 30, left: 100, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis
              type="number"
              tick={{ fontSize: 12, fill: "#666" }}
              label={{
                value: "Number of Calls",
                position: "insideBottomRight",
                offset: -5,
              }}
            />
            <YAxis
              dataKey="label"
              type="category"
              width={90}
              tick={{ fontSize: 12, fill: "#666" }}
            />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="count" fill="#2196F3" isAnimationActive={true}>
              {data.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={colorPalette[index % colorPalette.length]}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="chart-summary">
        <strong>Total calls analyzed:</strong>{" "}
        {data.reduce((sum, d) => sum + d.count, 0)}
        <br />
        <strong>Most common depth:</strong>{" "}
        {data.reduce((max, d) => (d.count > max.count ? d : max))?.label ||
          "N/A"}
      </div>
    </div>
  );
};

export default StepDepthChart;
