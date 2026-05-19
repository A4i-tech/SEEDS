import React from "react";
import "../shared/tables.css";
import "../shared/buttons.css";
import "../shared/utilities.css";

// Visual + semantic mapping of content types. Keep glyph + label paired so
// color is never the sole signal (works for color-blind + low-vision teachers).
const TYPE_META = {
  story:            { label: "Story",      glyph: "❦", aria: "Story content" },
  poem:             { label: "Poem",       glyph: "❋", aria: "Poem content" },
  quiz:             { label: "Quiz",       glyph: "◆", aria: "Quiz content" },
  riddle:           { label: "Riddle",     glyph: "◈", aria: "Riddle content" },
  song:             { label: "Song",       glyph: "♪", aria: "Song content" },
  // v3 generic type — vendor distinguisher is `sourcePlatform` on the row.
  imported_content: { label: "Imported Course", glyph: "✦", aria: "Imported LMS course" },
  // Legacy type retained for any rows yet to be migrated.
  subodha_course:   { label: "Subodha Course",  glyph: "✦", aria: "Subodha LMS imported course" },
};

const TypeChip = ({ type }) => {
  const m = TYPE_META[type] || { label: type, glyph: "•", aria: `${type} content` };
  const variantClass = TYPE_META[type]
    ? `content-type-chip--${type}`
    : "content-type-chip--default";
  return (
    <span
      className={`content-type-chip ${variantClass}`}
      role="img"
      aria-label={m.aria}
      title={m.aria}
    >
      <span className="ct-glyph" aria-hidden="true">{m.glyph}</span>
      <span className="ct-label">{m.label}</span>
    </span>
  );
};

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
              const rowClass =
                itemType === "subodha_course" || itemType === "imported_content"
                  ? "table-row-white row-subodha"
                  : "table-row-white";
              return (
                <tr key={itemId} className={rowClass}>
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
                    <TypeChip type={itemType} />
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
                      {onDelete && (
                        <button
                          onClick={() => onDelete(itemType, itemId)}
                          className="action-button-base action-button-delete"
                        >
                          Delete
                        </button>
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
