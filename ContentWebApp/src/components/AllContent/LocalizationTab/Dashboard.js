import React from "react";

const Dashboard = ({
  projectCount,
  siteCount,
  languageCount,
}) => {
  return (
    <>
      {/* Statistics Cards */}

      <div className="dashboard-cards">

        <div className="dashboard-card">
          <div className="dashboard-icon">📁</div>

          <h3>Projects</h3>

          <h1>{projectCount}</h1>

          <p>Total Localization Projects</p>
        </div>

        <div className="dashboard-card">
          <div className="dashboard-icon">🌍</div>

          <h3>Languages</h3>

          <h1>{languageCount}</h1>

          <p>Supported Languages</p>
        </div>

        <div className="dashboard-card">
          <div className="dashboard-icon">🌐</div>

          <h3>Sites</h3>

          <h1>{siteCount}</h1>

          <p>Connected Websites</p>
        </div>

      </div>

      {/* Quick Actions */}

      <div className="quick-actions">

        <h2>Quick Actions</h2>

        <div className="action-buttons">

          <button>
            ➕ Create Project
          </button>

          <button>
            🌐 Register Site
          </button>

          <button>
            🌍 Add Language
          </button>

        </div>

      </div>
    </>
  );
};

export default Dashboard;