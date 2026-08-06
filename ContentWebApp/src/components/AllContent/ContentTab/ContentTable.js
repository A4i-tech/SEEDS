import React from "react";
import { getLanguageName } from "../../../utils/languageName";
import MiddleEllipsis from "../shared/MiddleEllipsis";
import RowActions from "../shared/RowActions";
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
              <th className="table-header table-header-actions">Actions</th>
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
              <th className="table-header table-header-actions">Actions</th>
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
                  <td className="table-cell table-cell-truncate">
                    <MiddleEllipsis text={item.title.english} />
                    <MiddleEllipsis text={item.title.local} className="table-cell-secondary" />
                  </td>
                  <td className="table-cell table-cell-truncate">
                    <MiddleEllipsis text={item.theme.english} />
                    <MiddleEllipsis text={item.theme.local} className="table-cell-secondary" />
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
                  <td className="table-cell">{getLanguageName(item.language)}</td>
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
                  <td className="table-cell table-cell-actions">
                    {isSubodha ? (
                      <RowActions
                        actions={[
                          {
                            key: "sync",
                            label: syncing ? "Syncing…" : "Sync",
                            variant: "sync",
                            disabled: syncing,
                            onClick: () => onSyncCourse(itemId, item.title.english),
                          },
                          { key: "view", label: "View", variant: "view", onClick: () => onView(itemType, itemId) },
                          ...(onDeleteSubodhaCourse
                            ? [{
                                key: "delete", label: "Delete", variant: "delete",
                                onClick: () => onDeleteSubodhaCourse(itemId, item.title.english),
                              }]
                            : []),
                        ]}
                      />
                    ) : (
                      <RowActions
                        actions={[
                          { key: "edit", label: "Edit", variant: "edit", onClick: () => onEdit(itemType, itemId) },
                          { key: "view", label: "View", variant: "view", onClick: () => onView(itemType, itemId) },
                          ...(onDelete
                            ? [{ key: "delete", label: "Delete", variant: "delete", onClick: () => onDelete(itemType, itemId) }]
                            : []),
                        ]}
                      />
                    )}
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
