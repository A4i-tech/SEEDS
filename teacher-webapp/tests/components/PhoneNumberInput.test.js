import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import { ThemeProvider } from "@mui/material/styles";
import { createTheme } from "@mui/material/styles";
import { PhoneNumberInput } from "../../src/components/common/PhoneNumberInput";

const theme = createTheme();

const renderWithTheme = (ui) =>
  render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>);

describe("PhoneNumberInput", () => {
  test("calls onChange with sanitized value (digits only)", () => {
    const onChange = jest.fn();
    renderWithTheme(<PhoneNumberInput value="" onChange={onChange} />);
    const input = screen.getByRole("textbox", { name: /phone number/i });
    fireEvent.change(input, { target: { value: "12a34b56" } });
    expect(onChange).toHaveBeenCalledWith("123456");
  });

  test("limits input to 10 digits", () => {
    const onChange = jest.fn();
    renderWithTheme(<PhoneNumberInput value="" onChange={onChange} />);
    const input = screen.getByRole("textbox", { name: /phone number/i });
    fireEvent.change(input, { target: { value: "12345678901234" } });
    expect(onChange).toHaveBeenCalledWith("1234567890");
  });

  test("input has maxLength 10", () => {
    const onChange = jest.fn();
    renderWithTheme(<PhoneNumberInput value="" onChange={onChange} />);
    const input = screen.getByRole("textbox", { name: /phone number/i });
    expect(input).toHaveAttribute("maxLength", "10");
  });

  test("displays controlled value", () => {
    const onChange = jest.fn();
    renderWithTheme(<PhoneNumberInput value="9876543210" onChange={onChange} />);
    const input = screen.getByRole("textbox", { name: /phone number/i });
    expect(input).toHaveValue("9876543210");
  });
});
