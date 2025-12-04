import React from "react";
import "../shared/tables.css";
import "../shared/utilities.css";

const AnalyticsStats = ({ stats }) => {
  const statCards = [
    { label: "Total Calls", value: stats.totalCalls, color: "#4CAF50" },
    { label: "Unique Users", value: stats.uniqueUsers, color: "#2196F3" },
    { label: "Average Duration", value: stats.avgDuration, color: "#FF9800" },
    { label: "Total Duration", value: stats.totalDuration, color: "#9C27B0" },
  ];

  return (
    <div style={{ padding: "20px" }}>
      <h3 style={{ marginBottom: "20px", fontSize: "18px", fontWeight: "600" }}>
        Summary Statistics
      </h3>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: "20px",
        }}
      >
        {statCards.map((stat, index) => (
          <div
            key={index}
            style={{
              backgroundColor: "#f5f5f5",
              borderRadius: "8px",
              padding: "20px",
              borderLeft: `4px solid ${stat.color}`,
              boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
            }}
          >
            <div
              style={{ fontSize: "14px", color: "#666", marginBottom: "8px" }}
            >
              {stat.label}
            </div>
            <div
              style={{ fontSize: "28px", fontWeight: "bold", color: "#333" }}
            >
              {stat.value}
            </div>
          </div>
        ))}
      </div>

      {/* Calls by Date */}
      {Object.keys(stats.callsByDate).length > 0 && (
        <div style={{ marginTop: "30px" }}>
          <h4
            style={{
              marginBottom: "15px",
              fontSize: "16px",
              fontWeight: "600",
            }}
          >
            Calls by Date
          </h4>
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
