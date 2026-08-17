import React from "react";
import "./css/AnalyticsStats.css";

const SchoolDashboardStats = ({ dashboard }) => {
  const { school, teachers, students, classes } = dashboard;

  const statCards = [
    { label: "Teachers", value: teachers, color: "var(--color-stat-green)" },
    { label: "Students", value: students, color: "var(--color-stat-orange)" },
    { label: "Classes", value: classes, color: "var(--color-stat-purple)" },
  ];

  return (
    <div className="stats-container">
      <h3 className="stats-title">{school.name} Overview</h3>
      <div className="stat-cards">
        {statCards.map((stat) => (
          <div key={stat.label} className="stat-card" style={{ "--stat-accent": stat.color }}>
            <div className="stat-label">{stat.label}</div>
            <div className="stat-value">{stat.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default SchoolDashboardStats;
