import React, { useMemo, useState } from "react";

const LanguageTable = ({
  languages = [],
  onCreate,
  onEdit,
  onDelete,
  onToggleStatus,
}) => {
  const [search, setSearch] = useState("");

  const filteredLanguages = useMemo(() => {
    return languages.filter((language) => {
      const keyword = search.toLowerCase();

      return (
        language.name.toLowerCase().includes(keyword) ||
        language.code.toLowerCase().includes(keyword)
      );
    });
  }, [languages, search]);

  return (
    <div className="table-container">

      <div className="table-header">

        <h2>Supported Languages</h2>

        <button
          className="primary-btn"
          onClick={onCreate}
        >
          + Add Language
        </button>

      </div>

      <input
        type="text"
        className="search-box"
        placeholder="Search by Language or Code..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      <table className="project-table">

        <thead>
          <tr>
            <th>Language</th>
            <th>Code</th>
            <th>Direction</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>

        <tbody>

          {filteredLanguages.length === 0 ? (

            <tr>
              <td
                colSpan="5"
                className="empty-row"
              >
                No languages configured.

                <br />

                Click <strong>Add Language</strong> to create your first language.
              </td>
            </tr>

          ) : (

            filteredLanguages.map((language) => (

              <tr key={language.id}>

                <td>{language.name}</td>

                <td>{language.code}</td>

                <td>{language.direction}</td>

                <td>

                  <span
                    className={
                      language.enabled
                        ? "status-active"
                        : "status-inactive"
                    }
                  >
                    {language.enabled ? "Enabled" : "Disabled"}
                  </span>

                </td>

                <td>

                  <button
                    className="table-action-btn edit-btn"
                    onClick={() => onEdit(language)}
                  >
                    Edit
                  </button>

                  <button
                    className="table-action-btn"
                    onClick={() => onToggleStatus(language.id)}
                  >
                    {language.enabled ? "Disable" : "Enable"}
                  </button>

                  <button
                    className="table-action-btn delete-btn"
                    onClick={() => onDelete(language.id)}
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

export default LanguageTable;