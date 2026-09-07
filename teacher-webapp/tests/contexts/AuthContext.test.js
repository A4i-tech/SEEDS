import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

jest.mock("../../src/services/axiosInstance", () => ({
  __esModule: true,
  default: { post: jest.fn() },
  initSession: jest.fn(),
}));

import axiosInstance, { initSession } from "../../src/services/axiosInstance";
import { AuthProvider, useAuthContext } from "../../src/contexts/AuthContext";
import { setAccessToken, getAccessToken, clearAccessToken } from "../../src/utils/tokenStore";

const Probe = () => {
  const { isAuthenticated, logout } = useAuthContext();
  const [outcome, setOutcome] = React.useState("");
  return (
    <div>
      <span data-testid="authed">{String(isAuthenticated)}</span>
      <span data-testid="outcome">{outcome}</span>
      <button
        onClick={async () => {
          try {
            await logout();
            setOutcome("resolved");
          } catch (error) {
            setOutcome(`rejected:${error.message}`);
          }
        }}
      >
        logout
      </button>
    </div>
  );
};

const renderProbe = async () => {
  render(
    <AuthProvider>
      <Probe />
    </AuthProvider>
  );
  await waitFor(() => expect(screen.getByTestId("authed")).toHaveTextContent("true"));
};

beforeEach(() => {
  jest.clearAllMocks();
  clearAccessToken();
  initSession.mockResolvedValue({ data: { token: "tok" }, error: null });
  setAccessToken("tok");
});

describe("AuthContext logout", () => {
  it("clears the access token when the server confirms the revoke", async () => {
    axiosInstance.post.mockResolvedValue({ data: {} });
    await renderProbe();

    await userEvent.click(screen.getByText("logout"));

    await waitFor(() => expect(screen.getByTestId("outcome")).toHaveTextContent("resolved"));
    expect(getAccessToken()).toBeNull();
    expect(screen.getByTestId("authed")).toHaveTextContent("false");
  });

  it("keeps the session and rethrows when the server revoke fails", async () => {
    axiosInstance.post.mockRejectedValue({ response: { status: 500 } });
    await renderProbe();

    await userEvent.click(screen.getByText("logout"));

    await waitFor(() => expect(screen.getByTestId("outcome")).toHaveTextContent("rejected:"));
    expect(getAccessToken()).toBe("tok");
    expect(screen.getByTestId("authed")).toHaveTextContent("true");
  });

  it("treats 401 as an already-terminated session and clears state", async () => {
    axiosInstance.post.mockRejectedValue({ response: { status: 401 } });
    await renderProbe();

    await userEvent.click(screen.getByText("logout"));

    await waitFor(() => expect(screen.getByTestId("outcome")).toHaveTextContent("resolved"));
    expect(getAccessToken()).toBeNull();
    expect(screen.getByTestId("authed")).toHaveTextContent("false");
  });
});
