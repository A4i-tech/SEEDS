import React, { useState } from "react";

const ProjectTable = ({ projects, onCreate, onEdit, onDelete }) => {
  const [search, setSearch] = useState("");

  const filteredProjects = projects.filter((project) =>
    project.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="table-container">

      <div className="table-header">

        <h2>Localization Projects</h2>

        <button
          className="primary-btn"
          onClick={onCreate}
        >
          Create Project
        </button>

      </div>

      <input
        type="text"
        className="search-box"
        placeholder="Search Projects..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      <table className="project-table">

        <thead>

          <tr>
            <th>Project Name</th>
            <th>Description</th>
            <th>Source Language</th>
            <th>Status</th>
            <th>Created</th>
            <th>Actions</th>
          </tr>

        </thead>

        <tbody>

          {filteredProjects.length === 0 ? (

            <tr>

              <td
                colSpan="6"
                className="empty-row"
              >
                No localization projects found.
                <br />
                Click <strong>"Create Project"</strong> to create your first
                localization project.
              </td>

            </tr>

          ) : (

            filteredProjects.map((project) => (

              <tr key={project.id}>

                <td>{project.name}</td>

                <td>{project.description || "-"}</td>

                <td>{project.sourceLanguage}</td>

                <td>

                  <span
                    className={
                      project.status === "Active"
                        ? "status-active"
                        : "status-inactive"
                    }
                  >
                    {project.status}
                  </span>

                </td>

                <td>{project.created}</td>

                <td>

                  <button 
                    className="table-action-btn edit-btn"
                    onClick={() => onEdit(project)}
                  >
                    Edit
                  </button>

                  <button 
                    className="table-action-btn delete-btn"
                    onClick={() => onDelete(project.id)}
                  >  
                    Delete
                  </button>

                </td>

              </tr>

            ))

          )}

        </tbody>

      </table>

    </div>
  );
};

export default ProjectTable;