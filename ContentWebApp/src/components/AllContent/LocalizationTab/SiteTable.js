import React, { useMemo, useState } from "react";

const SiteTable = ({
  sites = [],
  projects = [],
  onCreate,
  onEdit,
  onDelete,
}) => {
  const [search, setSearch] = useState("");

  const filteredSites = useMemo(() => {
    return sites.filter((site) => {
      const keyword = search.toLowerCase();

      return (
        (site.name || "").toLowerCase().includes(keyword) ||
        (site.url || "").toLowerCase().includes(keyword)
      );
    });
  }, [sites, search]);

  const getProjectName = (projectId) => {
    const project = projects.find(
      (p) => String(p.id) === String(projectId)
    );

    return project ? project.name : "Unassigned";
  };

  return (
    <div className="table-container">

      <div className="table-header">

        <h2>Website Registration</h2>

        <button
          className="primary-btn"
          onClick={onCreate}
        >
          Register Site
        </button>

      </div>

      <input
        type="text"
        className="search-box"
        placeholder="Search by Site Name or URL..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      <table className="project-table">

        <thead>
          <tr>
            <th>Site Name</th>
            <th>Website URL</th>
            <th>Project</th>
            <th>Status</th>
            <th>Created</th>
            <th>Actions</th>
          </tr>
        </thead>

        <tbody>

          {filteredSites.length === 0 ? (
            <tr>
              <td
                colSpan="6"
                className="empty-row"
              >
                No websites registered.
                <br />
                Click <strong>"Register Site"</strong> to add your first website.
              </td>
            </tr>
          ) : (
            filteredSites.map((site) => (
              <tr key={site.id}>

                <td>{site.name}</td>

                <td>
                  <a
                    href={site.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {site.url}
                  </a>
                </td>

                <td>{getProjectName(site.projectId)}</td>

                <td>
                  <span
                    className={
                      site.status === "Active"
                        ? "status-active"
                        : "status-inactive"
                    }
                  >
                    {site.status}
                  </span>
                </td>

                <td>{site.created}</td>

                <td>

                  <button
                    className="table-action-btn edit-btn"
                    onClick={() => onEdit(site)}
                  >
                    Edit
                  </button>

                  <button
                    className="table-action-btn delete-btn"
                    onClick={() => onDelete(site.id)}
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

export default SiteTable;