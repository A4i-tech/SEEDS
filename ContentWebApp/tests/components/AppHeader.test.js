import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AppHeader from "../../src/components/AllContent/Header/AppHeader";

jest.mock("react-router-dom", () => ({ useNavigate: () => jest.fn() }));

const renderHeader = (onLogout) =>
  render(
    <AppHeader activeTab="content" onTabChange={jest.fn()} currentUser="Ada" onLogout={onLogout} />
  );

const clickLogout = async () => {
  await userEvent.click(screen.getByText("Welcome, Ada"));
  await userEvent.click(screen.getByRole("button", { name: "Logout" }));
};

describe("AppHeader logout", () => {
  it("shows the failure and stays on the page when logout rejects", async () => {
    const onLogout = jest.fn().mockRejectedValue(new Error("Network request failed"));
    renderHeader(onLogout);

    await clickLogout();

    await waitFor(() =>
      expect(screen.getByTestId("logout-error").textContent).toContain("Network request failed")
    );
    expect(screen.getByTestId("logout-error").textContent).toContain("still signed in");
  });

  it("renders no error when the session is terminated", async () => {
    const onLogout = jest.fn().mockResolvedValue(undefined);
    renderHeader(onLogout);

    await clickLogout();

    await waitFor(() => expect(onLogout).toHaveBeenCalled());
    expect(screen.queryByTestId("logout-error")).toBeNull();
  });
});
