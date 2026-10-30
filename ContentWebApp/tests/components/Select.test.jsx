import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import Select from "../../src/components/AllContent/shared/Select";

const options = [
  { value: "a", label: "Alpha" },
  { value: "b", label: "Beta" },
];

const openSelect = () => {
  const onChange = jest.fn();
  render(<Select value="" onChange={onChange} options={options} placeholder="Pick" />);
  fireEvent.click(screen.getByRole("button", { name: "Pick" }));
  fireEvent.change(screen.getByLabelText("Search options"), { target: { value: "BET" } });
  return onChange;
};

test("search filters options ignoring case", () => {
  openSelect();
  expect(screen.queryByRole("option", { name: "Alpha" })).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Search options"), { target: { value: "zzz" } });
  expect(screen.getByText("No results")).toBeInTheDocument();
});

test("selecting a filtered option calls onChange with its value", () => {
  const onChange = openSelect();
  fireEvent.click(screen.getByRole("option", { name: "Beta" }));
  expect(onChange).toHaveBeenCalledWith("b");
});

test.each([undefined, null, 42])("malformed label %p does not crash and search still works", (label) => {
  render(
    <Select
      value=""
      onChange={jest.fn()}
      options={[{ value: "x", label }, { value: "b", label: "Beta" }]}
      placeholder="Pick"
    />
  );
  fireEvent.click(screen.getByRole("button", { name: "Pick" }));
  fireEvent.change(screen.getByLabelText("Search options"), { target: { value: "bet" } });
  expect(screen.getByRole("option", { name: "Beta" })).toBeInTheDocument();
});
