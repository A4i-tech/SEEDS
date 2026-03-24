import React from "react";
import "../shared/tables.css";
import "../shared/buttons.css";
import "../shared/utilities.css";

const ContentTable = ({ content, isLoading, onEdit, onView, onDelete }) => {
  return (
    <div className="table-wrapper">
      {isLoading && content.length === 0 ? (
        <table className="content-table">
          <thead>
            <tr>
              <th className="table-header">Title</th>
              <th className="table-header">Theme</th>
              <th className="table-header">Uploaded</th>
              <th className="table-header">Language</th>
              <th className="table-header">Type</th>
              <th className="table-header">Actions</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 4 }).map((_, i) => (
              <tr key={i} className="skeleton-row">
                <td colSpan={6} className="skeleton-cell"></td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : !isLoading && content.length === 0 ? (
        <div className="no-content">No content found.</div>
      ) : (
        <table className="content-table">
          <thead>
            <tr>
              <th className="table-header">Title</th>
              <th className="table-header">Theme</th>
              <th className="table-header">Uploaded</th>
              <th className="table-header">Language</th>
              <th className="table-header">Type</th>
              <th className="table-header">Actions</th>
            </tr>
          </thead>
          <tbody>
            {content.map((item) => {
              // Get ID - standardized to use id field (backend always provides id)
              const itemId = item.id.toString();
              // Get type and normalize to lowercase
              const itemType = item.type.toLowerCase();
              return (
                <tr key={itemId} className="table-row-white">
                  <td className="table-cell">
                    {item.title && typeof item.title === "object"
                      ? item.title.english
                      : item.title}
                    <br />
                    <span className="table-cell-secondary">
                      {item.title && typeof item.title === "object"
                        ? item.title.local
                        : item.localTitle}
                    </span>
                  </td>
                  <td className="table-cell">
                    {item.theme && typeof item.theme === "object"
                      ? item.theme.english
                      : item.theme}
                    <br />
                    <span className="table-cell-secondary">
                      {item.theme && typeof item.theme === "object"
                        ? item.theme.local
                        : item.localTheme}
                    </span>
                  </td>
                  <td className="table-cell">
                    {item.isTeacherApp && "TA"}
                    {item.isPullModel && ", IVR"}
                    {itemType === "quiz" && " IVR"}
                  </td>
                  <td className="table-cell">{item.language}</td>
                  <td className="table-cell">
                    <span className="content-type">
                      {itemType}
                      {itemType === "quiz" && (
                        <span className="content-type-badge-quiz" title="Quiz Content">
                          Q
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="table-cell">
                    <div className="action-buttons-wrapper">
                      <button
                        onClick={() => onEdit(itemType, itemId)}
                        className="action-button-base action-button-edit"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => onView(itemType, itemId)}
                        className="action-button-base action-button-view"
                      >
                        View
                      </button>
                      <button
                        onClick={() => onDelete(itemType, itemId)}
                        className="action-button-base action-button-delete"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
};

export default ContentTable;
