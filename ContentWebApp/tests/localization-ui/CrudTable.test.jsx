import { render, screen, fireEvent } from "@testing-library/react";
import { CrudTable } from "../../src/localization-ui/primitives/CrudTable";

const columns = [{ key: "name", header: "Name", render: (r) => r.name }];
const rows = [{ id: "1", name: "Alpha" }];

test("renders EmptyState when rows is empty", () => {
  render(
    <CrudTable
      columns={columns}
      rows={[]}
      getId={(r) => r.id}
      onEdit={jest.fn()}
      onDelete={jest.fn()}
      emptyTitle="No items"
      emptyMessage="Nothing here yet."
    />
  );
  expect(screen.getByText("No items")).toBeInTheDocument();
});

test("renders a row per item with edit/delete actions", () => {
  const onEdit = jest.fn();
  const onDelete = jest.fn();
  render(
    <CrudTable columns={columns} rows={rows} getId={(r) => r.id} onEdit={onEdit} onDelete={onDelete} />
  );
  expect(screen.getByText("Alpha")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /edit/i }));
  expect(onEdit).toHaveBeenCalledWith(rows[0]);
  fireEvent.click(screen.getByRole("button", { name: /delete/i }));
  expect(onDelete).toHaveBeenCalledWith(rows[0]);
});
