import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import { SeekControls } from "../../src/components/SeekControls";

describe("SeekControls", () => {
  const defaultProps = {
    disabled: false,
    seekingDirection: null,
    onSeekBackward: jest.fn(),
    onSeekForward: jest.fn(),
  };

  const renderControls = (props = {}) => {
    const merged = { ...defaultProps, ...props };
    merged.onSeekBackward.mockClear();
    merged.onSeekForward.mockClear();
    return render(<SeekControls {...merged} />);
  };

  test("renders buttons with default labels", () => {
    renderControls();
    expect(screen.getByRole("button", { name: "Seek backward 10 seconds" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Seek forward 10 seconds" })).toBeInTheDocument();
  });

  test("disables buttons when component is disabled", () => {
    renderControls({ disabled: true });
    expect(screen.getByRole("button", { name: "Seek backward 10 seconds" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Seek forward 10 seconds" })).toBeDisabled();
  });

  test("invokes callbacks when clicked", () => {
    renderControls();
    fireEvent.click(screen.getByRole("button", { name: "Seek backward 10 seconds" }));
    fireEvent.click(screen.getByRole("button", { name: "Seek forward 10 seconds" }));
    expect(defaultProps.onSeekBackward).toHaveBeenCalledTimes(1);
    expect(defaultProps.onSeekForward).toHaveBeenCalledTimes(1);
  });

  test("shows seeking state for active direction", () => {
    const { rerender } = renderControls({ seekingDirection: "backward" });
    const backwardButton = screen.getByRole("button", { name: "Seek backward 10 seconds" });
    expect(backwardButton).toBeDisabled();
    expect(screen.getByText("Seeking...")).toBeInTheDocument();

    rerender(<SeekControls {...defaultProps} seekingDirection="forward" />);
    expect(screen.getAllByText("Seeking...")).toHaveLength(1);
    const forwardButton = screen.getByRole("button", { name: "Seek forward 10 seconds" });
    expect(forwardButton).toBeDisabled();
  });
});
