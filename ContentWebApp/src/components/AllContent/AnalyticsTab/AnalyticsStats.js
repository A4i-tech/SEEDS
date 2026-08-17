import React from "react";
import "../shared/tables.css";
import "../shared/utilities.css";
import "./css/AnalyticsStats.css";
import CallsByDateChart from "./CallsByDateChart";
import StepDepthChart from "./StepDepthChart";

const AnalyticsStats = ({ stats }) => {
  const statCards = [
    { label: "Total Calls", value: stats.totalCalls, color: "var(--color-stat-green)" },
    { label: "Unique Users", value: stats.uniqueUsers, color: "var(--color-stat-blue)" },
    { label: "Average Duration", value: stats.avgDuration, color: "var(--color-stat-orange)" },
    { label: "Total Duration", value: stats.totalDuration, color: "var(--color-stat-purple)" },
  ];

  const hasCallsByDate = Object.keys(stats.callsByDate).length > 0;
  const hasStepDepth = stats.stepDepthData && stats.stepDepthData.length > 0;

  return (
    <div className="stats-container">
      <h3 className="stats-title">Summary Statistics</h3>
      <div className="stat-cards">
        {statCards.map((stat, index) => (
          <div key={index} className="stat-card" style={{ "--stat-accent": stat.color }}>
            <div className="stat-label">{stat.label}</div>
            <div className="stat-value">{stat.value}</div>
          </div>
        ))}
      </div>

      {hasCallsByDate && <CallsByDateChart data={stats.callsByDate} />}

      {hasStepDepth && <StepDepthChart data={stats.stepDepthData} />}

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
