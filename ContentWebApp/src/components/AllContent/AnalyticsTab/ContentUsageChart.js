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

const MAX_BARS = 10;

const ContentUsageChart = ({ data }) => {
  if (!data || data.length === 0) {
    return <div className="no-data-message">No content playback data for the selected range.</div>;
  }

  const chartData = data.slice(0, MAX_BARS);

  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload[0]) {
      const { title, playCount, completedPlays } = payload[0].payload;
      return (
        <div className="chart-tooltip">
          <p className="chart-tooltip-date">{title}</p>
          <p className="chart-tooltip-accent">Plays: {playCount}</p>
          <p className="chart-tooltip-accent">Completed: {completedPlays}</p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="chart-block">
      <div className="chart-header">
        <h4 className="chart-title">Most Played Content</h4>
      </div>
      <div className="chart-card">
        <ResponsiveContainer width="100%" height={300}>
          <BarChart
            data={chartData}
            layout="vertical"
            margin={{ top: 5, right: 30, left: 100, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12, fill: "#666" }} />
            <YAxis
              dataKey="title"
              type="category"
              width={140}
              tick={{ fontSize: 12, fill: "#666" }}
            />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="playCount" fill="#2196F3" isAnimationActive={true}>
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={colorPalette[index % colorPalette.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default ContentUsageChart;
