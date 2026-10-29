import { render, screen } from "@testing-library/react";
import VolunteersPanel from "../../src/components/AllContent/RegistrationTab/VolunteersPanel";

const noop = () => {};

test("loading with zero volunteers shows the table skeleton", () => {
  render(<VolunteersPanel volunteers={[]} isLoading={true} onCreateVolunteer={noop} />);
  expect(screen.queryByText("No volunteers yet.")).not.toBeInTheDocument();
  expect(screen.getByRole("table")).toBeInTheDocument();
});

test("empty volunteer list shows the empty state", () => {
  render(<VolunteersPanel volunteers={[]} isLoading={false} onCreateVolunteer={noop} />);
  expect(screen.getByText("No volunteers yet.")).toBeInTheDocument();
  expect(screen.queryByRole("table")).not.toBeInTheDocument();
});

test("populated volunteer list renders the table", () => {
  const volunteers = [{ id: "vol-1", name: "Volunteer One", email: "vol1@example.com" }];
  render(<VolunteersPanel volunteers={volunteers} isLoading={false} onCreateVolunteer={noop} />);
  expect(screen.getByText("Volunteer One")).toBeInTheDocument();
  expect(screen.getByText("vol1@example.com")).toBeInTheDocument();
  expect(screen.queryByText("No volunteers yet.")).not.toBeInTheDocument();
});

test("flash message renders with the given messageType", () => {
  render(
    <VolunteersPanel
      volunteers={[]}
      isLoading={false}
      onCreateVolunteer={noop}
      message="Failed to create volunteer"
      messageType="error"
    />
  );
  expect(screen.getByText("Failed to create volunteer")).toHaveClass("error-message");
});
