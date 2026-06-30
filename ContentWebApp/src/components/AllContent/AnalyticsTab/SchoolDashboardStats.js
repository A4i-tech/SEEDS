import React from "react";
import "./css/AnalyticsStats.css";

const SchoolDashboardStats = ({ dashboard }) => {
  const { school, teachers, students, classes } = dashboard;

  const statCards = [
    { label: "Teachers", value: teachers, color: "#16a34a" },
    { label: "Students", value: students, color: "#f59e0b" },
    { label: "Classes", value: classes, color: "#8b5cf6" },
  ];

  return (
    <div className="stats-container">
      <h3 className="stats-title">{school?.name || "School"} Overview</h3>
      <div className="stat-cards">
        {statCards.map((stat) => (
          <div key={stat.label} className="stat-card" style={{ borderLeftColor: stat.color }}>
            <div className="stat-label">{stat.label}</div>
            <div className="stat-value">{stat.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default SchoolDashboardStats;
