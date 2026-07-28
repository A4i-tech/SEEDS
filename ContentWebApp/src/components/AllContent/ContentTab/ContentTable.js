import React from "react";
import "../shared/tables.css";
import "../shared/buttons.css";
import "../shared/utilities.css";

const ContentTable = ({
  content,
  isLoading,
  onEdit,
  onView,
  onDelete,
  courseSyncStates = {},
  onSyncCourse,
  onDeleteSubodhaCourse,
}) => {
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
              const itemId = item.id;
              const itemType = item.type.toLowerCase();
              const isSubodha = item.source === "subodha";
              const syncState = courseSyncStates[itemId];
              const syncing = syncState === "running";
              return (
                <tr key={itemId} className="table-row-white">
                  <td className="table-cell">
                    {item.title.english}
                    <br />
                    <span className="table-cell-secondary">{item.title.local}</span>
                  </td>
                  <td className="table-cell">
                    {item.theme.english}
                    <br />
                    <span className="table-cell-secondary">{item.theme.local}</span>
                  </td>
                  <td className="table-cell">
                    {isSubodha
                      ? item.synced
                        ? "Synced"
                        : "Never synced"
                      : (
                        <>
                          {item.is_teacher_app && "TA"}
                          {item.is_pull_model && ", IVR"}
                          {itemType === "quiz" && " IVR"}
                        </>
                      )}
                  </td>
                  <td className="table-cell">{item.language}</td>
                  <td className="table-cell">
                    <span className="content-type">
                      {isSubodha ? "Subodha" : itemType}
                      {itemType === "quiz" && (
                        <span className="content-type-badge-quiz" title="Quiz Content">
                          Q
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="table-cell">
                    <div className="action-buttons-wrapper">
                      {isSubodha ? (
                        <>
                          <button
                            onClick={() => onSyncCourse(itemId, item.title.english)}
                            disabled={syncing}
                            className="action-button-base action-button-sync"
                          >
                            {syncing ? "Syncing..." : "Sync"}
                          </button>
                          <button
                            onClick={() => onView(itemType, itemId)}
                            className="action-button-base action-button-view"
                          >
                            View
                          </button>
                          {onDeleteSubodhaCourse && (
                            <button
                              onClick={() => onDeleteSubodhaCourse(itemId, item.title.english)}
                              className="action-button-base action-button-delete"
                            >
                              Delete
                            </button>
                          )}
                        </>
                      ) : (
                        <>
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
                          {onDelete && (
                            <button
                              onClick={() => onDelete(itemType, itemId)}
                              className="action-button-base action-button-delete"
                            >
                              Delete
                            </button>
                          )}
                        </>
                      )}
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
