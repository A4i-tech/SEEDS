import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import AppHeader from "../../src/components/AllContent/Header/AppHeader";

function renderHeader(props) {
  render(
    <MemoryRouter>
      <AppHeader
        activeTab="content"
        onTabChange={() => {}}
        currentUser="Test User"
        onLogout={() => {}}
        {...props}
      />
    </MemoryRouter>
  );
}

test("shows the Localization nav link for a tenant user", () => {
  renderHeader({ showLocalization: true });
  expect(screen.getByRole("button", { name: "Localization" })).toBeInTheDocument();
});

test("hides the Localization nav link for a school_admin user", () => {
  renderHeader({ showLocalization: false });
  expect(screen.queryByRole("button", { name: "Localization" })).not.toBeInTheDocument();
});
