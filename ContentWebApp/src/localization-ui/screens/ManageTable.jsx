import React from "react";
import RowActions from "../../components/AllContent/shared/RowActions";
import "../../components/AllContent/shared/tables.css";
import { EmptyState } from "../primitives";

export function ManageTable({ columns, rows, getId, onEdit, onDelete, emptyTitle, emptyMessage }) {
  if (!rows.length) {
    return <EmptyState title={emptyTitle} message={emptyMessage} />;
  }
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
            <th className="table-header table-header-actions">Actions</th>
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
              <td className="table-cell table-cell-actions">
                <RowActions
                  horizontal
                  actions={[
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
