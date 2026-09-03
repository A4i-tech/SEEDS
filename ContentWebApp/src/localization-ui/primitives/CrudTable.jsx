import React from "react";
import { Pencil, Trash2 } from "lucide-react";
import { Button } from "./Button";
import { EmptyState } from "./EmptyState";

function RowActions({ onEdit, onDelete }) {
  return (
    <div className="t-actions">
      <Button size="sm" variant="ghost" onClick={onEdit}>
        <Pencil size={13} /> Edit
      </Button>
      <Button size="sm" variant="danger" onClick={onDelete}>
        <Trash2 size={13} /> Delete
      </Button>
    </div>
  );
}

export function CrudTable({
  columns,
  rows,
  getId,
  onEdit,
  onDelete,
  emptyIcon,
  emptyTitle,
  emptyMessage,
}) {
  if (!rows.length) {
    return <EmptyState icon={emptyIcon} title={emptyTitle} message={emptyMessage} />;
  }
  return (
    <table className="data-table">
      <thead>
        <tr>
          {columns.map((c) => (
            <th key={c.key}>{c.header}</th>
          ))}
          <th></th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={getId(row)}>
            {columns.map((c) => (
              <td key={c.key} className={c.className}>
                {c.render(row)}
              </td>
            ))}
            <td>
              <RowActions onEdit={() => onEdit(row)} onDelete={() => onDelete(row)} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default CrudTable;
