import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import { ParticipantCard } from "../../src/components/participants/ParticipantCard";

const connectedStudent = {
  name: "Test Student",
  phoneNumber: "911234567890",
  call_status: "connected",
  is_muted: false,
};

describe("ParticipantCard - Remove participant", () => {
  test("renders remove button for connected student when onRemove is provided", () => {
    const onRemove = jest.fn();
    render(
      <ParticipantCard
        participant={connectedStudent}
        isTeacher={false}
        onRemove={onRemove}
        onMuteToggle={jest.fn()}
      />
    );
    const removeButton = screen.getByRole("button", { name: /remove participant/i });
    expect(removeButton).toBeInTheDocument();
  });

  test("does not render remove button for teacher", () => {
    const onRemove = jest.fn();
    render(
      <ParticipantCard
        participant={{ ...connectedStudent, name: "Teacher" }}
        isTeacher={true}
        onRemove={onRemove}
        onMuteToggle={jest.fn()}
      />
    );
    expect(screen.queryByRole("button", { name: /remove participant/i })).not.toBeInTheDocument();
  });

  test("does not render remove button when participant is disconnected", () => {
    const onRemove = jest.fn();
    render(
      <ParticipantCard
        participant={{ ...connectedStudent, call_status: "disconnected" }}
        isTeacher={false}
        onRemove={onRemove}
        onMuteToggle={jest.fn()}
      />
    );
    expect(screen.queryByRole("button", { name: /remove participant/i })).not.toBeInTheDocument();
  });

  test("does not render remove button when onRemove is not provided", () => {
    render(
      <ParticipantCard participant={connectedStudent} isTeacher={false} onMuteToggle={jest.fn()} />
    );
    expect(screen.queryByRole("button", { name: /remove participant/i })).not.toBeInTheDocument();
  });

  test("calls onRemove with participant when remove button is clicked", () => {
    const onRemove = jest.fn();
    render(
      <ParticipantCard
        participant={connectedStudent}
        isTeacher={false}
        onRemove={onRemove}
        onMuteToggle={jest.fn()}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /remove participant/i }));
    expect(onRemove).toHaveBeenCalledTimes(1);
    expect(onRemove).toHaveBeenCalledWith(connectedStudent);
  });

  test("remove button is disabled and shows loading when isRemoving is true", () => {
    const onRemove = jest.fn();
    render(
      <ParticipantCard
        participant={connectedStudent}
        isTeacher={false}
        onRemove={onRemove}
        onMuteToggle={jest.fn()}
        isRemoving={true}
      />
    );
    const removeButton = screen.getByRole("button", { name: /remove participant/i });
    expect(removeButton).toBeDisabled();
    expect(removeButton).toHaveAttribute("aria-label", "Remove participant");
  });

  test("renders hold indicator for on-hold participant", () => {
    render(
      <ParticipantCard
        participant={{ ...connectedStudent, call_status: "on_hold" }}
        isTeacher={false}
        onMuteToggle={jest.fn()}
      />
    );

    expect(screen.getByLabelText("On hold")).toBeInTheDocument();
  });
});
