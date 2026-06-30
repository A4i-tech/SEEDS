import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import DuplicateStudentModal from "../../src/components/AllContent/RegistrationTab/DuplicateStudentModal";

const defaultDuplicates = [
  {
    phoneNumber: "911111111111",
    existingName: "Existing Name",
    submittedName: "New Name",
  },
];

describe("DuplicateStudentModal", () => {
  test("renders nothing when open is false", () => {
    const { container } = render(
      <DuplicateStudentModal open={false} duplicates={defaultDuplicates} onResolve={() => {}} onCancel={() => {}} />
    );
    expect(container.firstChild).toBeNull();
  });

  test("renders dialog with title and duplicate info when open", () => {
    render(
      <DuplicateStudentModal open={true} duplicates={defaultDuplicates} onResolve={() => {}} onCancel={() => {}} />
    );
    expect(screen.getByRole("dialog", { name: /student already registered/i })).toBeInTheDocument();
    expect(screen.getByText(/student already registered/i)).toBeInTheDocument();
    expect(screen.getByText("911111111111")).toBeInTheDocument();
    expect(screen.getByText(/registered as/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /keep "existing name"/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /update to "new name"/i })).toBeInTheDocument();
  });

  test("Confirm is disabled until user chooses keep or update for the duplicate", () => {
    render(
      <DuplicateStudentModal open={true} duplicates={defaultDuplicates} onResolve={jest.fn()} onCancel={jest.fn()} />
    );
    const confirmBtn = screen.getByRole("button", { name: /confirm/i });
    expect(confirmBtn).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /keep "existing name"/i }));
    expect(confirmBtn).not.toBeDisabled();
  });

  test("calls onResolve with resolution when user chooses keep and confirms", () => {
    const onResolve = jest.fn();
    render(
      <DuplicateStudentModal open={true} duplicates={defaultDuplicates} onResolve={onResolve} onCancel={jest.fn()} />
    );
    fireEvent.click(screen.getByRole("button", { name: /keep "existing name"/i }));
    fireEvent.click(screen.getByRole("button", { name: /confirm/i }));
    expect(onResolve).toHaveBeenCalledTimes(1);
    expect(onResolve).toHaveBeenCalledWith([
      {
        phoneNumber: "911111111111",
        existingName: "Existing Name",
        submittedName: "New Name",
        keepName: true,
      },
    ]);
  });

  test("calls onResolve with keepName false when user chooses update and confirms", () => {
    const onResolve = jest.fn();
    render(
      <DuplicateStudentModal open={true} duplicates={defaultDuplicates} onResolve={onResolve} onCancel={jest.fn()} />
    );
    fireEvent.click(screen.getByRole("button", { name: /update to "new name"/i }));
    fireEvent.click(screen.getByRole("button", { name: /confirm/i }));
    expect(onResolve).toHaveBeenCalledWith([
      {
        phoneNumber: "911111111111",
        existingName: "Existing Name",
        submittedName: "New Name",
        keepName: false,
      },
    ]);
  });

  test("calls onCancel when Cancel is clicked", () => {
    const onCancel = jest.fn();
    render(
      <DuplicateStudentModal open={true} duplicates={defaultDuplicates} onResolve={jest.fn()} onCancel={onCancel} />
    );
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  test("does not throw when onResolve is omitted (default no-op) on confirm", () => {
    const { unmount } = render(<DuplicateStudentModal open={true} duplicates={defaultDuplicates} />);
    fireEvent.click(screen.getByRole("button", { name: /keep "existing name"/i }));
    expect(() => fireEvent.click(screen.getByRole("button", { name: /^confirm$/i }))).not.toThrow();
    unmount();
  });

  test("does not throw when onCancel is omitted (default no-op) on cancel", () => {
    render(<DuplicateStudentModal open={true} duplicates={defaultDuplicates} />);
    expect(() => fireEvent.click(screen.getByRole("button", { name: /cancel/i }))).not.toThrow();
  });

  test("calls onCancel when Escape key is pressed", () => {
    const onCancel = jest.fn();
    render(
      <DuplicateStudentModal open={true} duplicates={defaultDuplicates} onResolve={jest.fn()} onCancel={onCancel} />
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  test("calls onCancel when backdrop overlay is clicked", () => {
    const onCancel = jest.fn();
    render(
      <DuplicateStudentModal open={true} duplicates={defaultDuplicates} onResolve={jest.fn()} onCancel={onCancel} />
    );
    fireEvent.click(screen.getByRole("dialog"));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  test("does not call onCancel when clicking inside the modal content", () => {
    const onCancel = jest.fn();
    render(
      <DuplicateStudentModal open={true} duplicates={defaultDuplicates} onResolve={jest.fn()} onCancel={onCancel} />
    );
    fireEvent.click(screen.getByText(/student already registered/i));
    expect(onCancel).not.toHaveBeenCalled();
  });

  test("renders multiple duplicates and requires choice for each", () => {
    const duplicates = [
      { phoneNumber: "911111111111", existingName: "A", submittedName: "A2" },
      { phoneNumber: "912222222222", existingName: "B", submittedName: "B2" },
    ];
    const onResolve = jest.fn();
    render(<DuplicateStudentModal open={true} duplicates={duplicates} onResolve={onResolve} onCancel={jest.fn()} />);
    const confirmBtn = screen.getByRole("button", { name: /confirm/i });
    expect(confirmBtn).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /keep "a"/i }));
    expect(confirmBtn).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /update to "b2"/i }));
    expect(confirmBtn).not.toBeDisabled();
    fireEvent.click(confirmBtn);
    expect(onResolve).toHaveBeenCalledWith([
      { phoneNumber: "911111111111", existingName: "A", submittedName: "A2", keepName: true },
      { phoneNumber: "912222222222", existingName: "B", submittedName: "B2", keepName: false },
    ]);
  });
});
