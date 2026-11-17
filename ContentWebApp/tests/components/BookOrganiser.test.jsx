import { useState } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import BookOrganiser from "../../src/components/AllContent/RemediationTab/BookOrganiser";

const ITEMS = [
  { id: "a", name: "Unit_10.pdf", sizeMb: 1 },
  { id: "b", name: "Unit_2.pdf", sizeMb: 2 },
  { id: "c", name: "Unit_1.pdf", sizeMb: 3 },
];

const Harness = ({ initial = ITEMS, allowRemove = false }) => {
  const [items, setItems] = useState(initial);
  return <BookOrganiser items={items} onChange={setItems} allowRemove={allowRemove} />;
};

const names = () => screen.getAllByRole("listitem").map((row) => within(row).getByText(/\.pdf$/).textContent);

test("Down moves a row, announces it and keeps focus on the same button", () => {
  render(<Harness />);
  const down = screen.getByRole("button", { name: "Move Unit_10.pdf down, now position 2 of 3" });
  down.focus();
  fireEvent.click(down);
  expect(names()).toEqual(["Unit_2.pdf", "Unit_10.pdf", "Unit_1.pdf"]);
  expect(screen.getByRole("status")).toHaveTextContent("Unit_10.pdf moved to position 2 of 3");
  expect(screen.getByRole("button", { name: "Move Unit_10.pdf down, now position 3 of 3" })).toHaveFocus();
});

test("Up moves a row and the first row has no Up", () => {
  render(<Harness />);
  expect(screen.getByRole("button", { name: "Move Unit_10.pdf up" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Move Unit_1.pdf up, now position 2 of 3" }));
  expect(names()).toEqual(["Unit_10.pdf", "Unit_1.pdf", "Unit_2.pdf"]);
});

test("Alt+ArrowDown and Alt+ArrowUp move a row, plain arrows do not", () => {
  render(<Harness />);
  const row = screen.getAllByRole("listitem")[0];
  fireEvent.keyDown(row, { key: "ArrowDown" });
  expect(names()[0]).toBe("Unit_10.pdf");
  fireEvent.keyDown(row, { key: "ArrowDown", altKey: true });
  expect(names()).toEqual(["Unit_2.pdf", "Unit_10.pdf", "Unit_1.pdf"]);
  fireEvent.keyDown(screen.getAllByRole("listitem")[1], { key: "ArrowUp", altKey: true });
  expect(names()).toEqual(["Unit_10.pdf", "Unit_2.pdf", "Unit_1.pdf"]);
});

test("Remove shows only when allowed and drops the row", () => {
  const { unmount } = render(<Harness />);
  expect(screen.queryByRole("button", { name: /^Remove/ })).toBeNull();
  unmount();
  render(<Harness allowRemove />);
  fireEvent.click(screen.getByRole("button", { name: "Remove Unit_2.pdf" }));
  expect(names()).toEqual(["Unit_10.pdf", "Unit_1.pdf"]);
  expect(screen.getByRole("status")).toHaveTextContent("Unit_2.pdf removed");
});

test("a file over the size limit shows an inline problem", () => {
  render(<Harness initial={[{ id: "a", name: "big.pdf", sizeMb: 12 }, ITEMS[1]]} />);
  expect(screen.getAllByText(/Over the 10 MB limit\. Compress or remove this file\./)).toHaveLength(1);
});

test("Sort by name orders numbers by value", () => {
  render(<Harness />);
  fireEvent.click(screen.getByRole("button", { name: "Sort by name" }));
  expect(names()).toEqual(["Unit_1.pdf", "Unit_2.pdf", "Unit_10.pdf"]);
});

test("dropping a row on another row reorders", () => {
  render(<Harness />);
  const rows = screen.getAllByRole("listitem");
  const dataTransfer = { setData: jest.fn(), effectAllowed: "" };
  fireEvent.dragStart(rows[0], { dataTransfer });
  fireEvent.dragOver(rows[2], { dataTransfer });
  fireEvent.drop(rows[2], { dataTransfer });
  expect(names()).toEqual(["Unit_2.pdf", "Unit_1.pdf", "Unit_10.pdf"]);
});
