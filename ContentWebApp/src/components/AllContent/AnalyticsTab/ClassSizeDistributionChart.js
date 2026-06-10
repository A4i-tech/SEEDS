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
import "./css/AnalyticsCharts.css";

const colorPalette = ["#4CAF50", "#2196F3", "#FF9800", "#9C27B0", "#f44336"];

const ClassSizeDistributionChart = ({ data }) => {
  if (!data || data.every((bucket) => bucket.count === 0)) {
    return <div className="no-data-message">No class size data for the selected range.</div>;
  }

  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload[0]) {
      const { bucket, count } = payload[0].payload;
      return (
        <div className="chart-tooltip">
          <p className="chart-tooltip-date">{bucket} students</p>
          <p className="chart-tooltip-accent">Conferences: {count}</p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="chart-block">
      <div className="chart-header">
        <h4 className="chart-title">Class Size Distribution</h4>
      </div>
      <div className="chart-card">
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={data} margin={{ top: 5, right: 30, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="bucket" tick={{ fontSize: 12, fill: "#666" }} />
            <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: "#666" }} />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="count" fill="#2196F3" isAnimationActive={true}>
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={colorPalette[index % colorPalette.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default ClassSizeDistributionChart;
