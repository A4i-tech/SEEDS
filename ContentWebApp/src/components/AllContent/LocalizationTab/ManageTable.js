import React from "react";
import RowActions from "../shared/RowActions";
import "../shared/tables.css";
import "../shared/utilities.css";

export function ManageTable({
  columns,
  rows,
  getId,
  onEdit,
  onDelete,
  extraActions = [],
  emptyTitle,
  emptyMessage,
}) {
  if (!rows.length) {
    return (
      <div className="no-content">
        {emptyTitle}
        <p className="placeholder-text">{emptyMessage}</p>
      </div>
    );
  }
  const actionsStyle = extraActions.length ? { width: 380 } : undefined;
  return (
    <div className="table-wrapper">
      <table className="content-table">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} className="table-header">
                {c.header}
              </th>
            ))}
            <th className="table-header table-header-actions" style={actionsStyle}>
              Actions
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={getId(row)} className="table-row-white">
              {columns.map((c) => (
                <td key={c.key} className={`table-cell ${c.className || ""}`}>
                  {c.render(row)}
                </td>
              ))}
              <td className="table-cell table-cell-actions" style={actionsStyle}>
                <RowActions
                  horizontal
                  actions={[
                    ...extraActions.map((a) => ({ ...a, onClick: () => a.onClick(row) })),
                    { key: "edit", label: "Edit", variant: "edit", onClick: () => onEdit(row) },
                    { key: "delete", label: "Delete", variant: "delete", onClick: () => onDelete(row) },
                  ]}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default ManageTable;
