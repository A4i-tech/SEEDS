import React from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import "./css/AnalyticsCharts.css";

/**
 * Simple labelled bar chart for distributions (class size, status breakdown).
 * @param {{title: string, data: {label: string, count: number}[], color?: string}} props
 */
const DistributionChart = ({ title, data, color = "#2196F3" }) => {
  if (!data || data.length === 0) {
    return null;
  }

  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload[0]) {
      const { label, count } = payload[0].payload;
      return (
        <div className="chart-tooltip">
          <p className="chart-tooltip-date">{label}</p>
          <p className="chart-tooltip-accent">Count: {count}</p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="chart-block">
      <div className="chart-header">
        <h4 className="chart-title">{title}</h4>
      </div>
      <div className="chart-card">
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={data} margin={{ top: 5, right: 30, left: 0, bottom: 50 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis
              dataKey="label"
              angle={-45}
              textAnchor="end"
              height={90}
              tick={{ fontSize: 12, fill: "#666" }}
            />
            <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: "#666" }} />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(0,0,0,0.04)" }} />
            <Bar dataKey="count" fill={color} radius={[4, 4, 0, 0]} isAnimationActive={true} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default DistributionChart;
