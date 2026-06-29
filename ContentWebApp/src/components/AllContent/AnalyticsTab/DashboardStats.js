import React from "react";
import "../shared/tables.css";
import "./css/AnalyticsStats.css";

const DashboardStats = ({ dashboard }) => {
  const { statistics, schools } = dashboard;

  const statCards = [
    { label: "Total Schools", value: statistics.totalSchools, color: "#0ea5e9" },
    { label: "Total Teachers", value: statistics.totalTeachers, color: "#16a34a" },
    { label: "Total Students", value: statistics.totalStudents, color: "#f59e0b" },
    { label: "Total Classes", value: statistics.totalClasses, color: "#8b5cf6" },
  ];

  return (
    <div className="stats-container">
      <h3 className="stats-title">Organisation Overview</h3>
      <div className="stat-cards">
        {statCards.map((stat) => (
          <div key={stat.label} className="stat-card" style={{ borderLeftColor: stat.color }}>
            <div className="stat-label">{stat.label}</div>
            <div className="stat-value">{stat.value}</div>
          </div>
        ))}
      </div>

      {schools && schools.length > 0 && (
        <div className="chart-section">
          <h4 className="chart-title">Schools Breakdown</h4>
          <div className="table-wrapper">
            <table className="content-table">
              <thead>
                <tr>
                  <th className="table-header">School</th>
                  <th className="table-header">Teachers</th>
                  <th className="table-header">Students</th>
                  <th className="table-header">Classes</th>
                </tr>
              </thead>
              <tbody>
                {schools.map((school) => (
                  <tr key={school.id} className="table-row-white">
                    <td className="table-cell">{school.name}</td>
                    <td className="table-cell">{school.teacher_count ?? "—"}</td>
                    <td className="table-cell">{school.student_count ?? "—"}</td>
                    <td className="table-cell">{school.class_count ?? "—"}</td>
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

export default DashboardStats;
