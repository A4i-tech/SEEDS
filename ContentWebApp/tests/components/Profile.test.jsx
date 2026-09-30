import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Profile from "../../src/components/Profile";
import { useAuth } from "../../src/hooks/useAuth";

jest.mock("../../src/hooks/useAuth");

function mockProfile(role) {
  useAuth.mockReturnValue({
    getAuthHeaders: () => ({}),
    logout: () => {},
    getCurrentUser: jest.fn().mockResolvedValue({ name: "Test User", role }),
  });
}

test("shows the Localization nav link for a tenant user", async () => {
  mockProfile("tenant");
  render(
    <MemoryRouter>
      <Profile />
    </MemoryRouter>
  );
  expect(await screen.findByRole("button", { name: "Localization" })).toBeInTheDocument();
});

test("hides the Localization nav link for a school_admin user", async () => {
  mockProfile("school_admin");
  render(
    <MemoryRouter>
      <Profile />
    </MemoryRouter>
  );
  await screen.findByText("Test User", { exact: false });
  expect(screen.queryByRole("button", { name: "Localization" })).not.toBeInTheDocument();
});
