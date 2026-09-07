import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AuthProvider, useAuthContext } from "../../src/contexts/AuthContext";
import { apiFetch, initSession, ApiError } from "../../src/services/api";
import { getAccessToken, setAccessToken, clearAccessToken } from "../../src/utils/tokenStore";

jest.mock("../../src/services/api", () => {
  class ApiError extends Error {
    constructor(message, status) {
      super(message);
      this.name = "ApiError";
      this.status = status;
    }
  }
  return { ApiError, apiFetch: jest.fn(), initSession: jest.fn() };
});

const Probe = () => {
  const { isAuthenticated, logout } = useAuthContext();
  const [outcome, setOutcome] = React.useState("pending");
  return (
    <>
      <span data-testid="authed">{String(isAuthenticated)}</span>
      <span data-testid="token">{String(getAccessToken())}</span>
      <span data-testid="outcome">{outcome}</span>
      <button
        onClick={() =>
          logout().then(
            () => setOutcome("resolved"),
            (error) => setOutcome(`rejected:${error.message}`)
          )
        }
      >
        logout
      </button>
    </>
  );
};

const renderAuthed = async () => {
  initSession.mockResolvedValue({ data: { token: "access-1" }, error: null });
  setAccessToken("access-1");
  render(
    <AuthProvider>
      <Probe />
    </AuthProvider>
  );
  await waitFor(() => expect(screen.getByTestId("authed").textContent).toBe("true"));
};

describe("AuthProvider logout", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearAccessToken();
  });

  it("tears down the session when the server confirms the revoke", async () => {
    await renderAuthed();
    apiFetch.mockResolvedValue({ message: "logged out" });

    await userEvent.click(screen.getByRole("button", { name: "logout" }));

    await waitFor(() => expect(screen.getByTestId("outcome").textContent).toBe("resolved"));
    expect(screen.getByTestId("authed").textContent).toBe("false");
    expect(screen.getByTestId("token").textContent).toBe("null");
  });

  it("keeps the session and rethrows when the server never confirmed", async () => {
    await renderAuthed();
    apiFetch.mockRejectedValue(new ApiError("Network request failed", 0));

    await userEvent.click(screen.getByRole("button", { name: "logout" }));

    await waitFor(() =>
      expect(screen.getByTestId("outcome").textContent).toBe("rejected:Network request failed")
    );
    expect(screen.getByTestId("authed").textContent).toBe("true");
    expect(screen.getByTestId("token").textContent).toBe("access-1");
  });

  it("treats 401 as an already-terminated session", async () => {
    await renderAuthed();
    apiFetch.mockRejectedValue(new ApiError("Missing refresh token", 401));

    await userEvent.click(screen.getByRole("button", { name: "logout" }));

    await waitFor(() => expect(screen.getByTestId("outcome").textContent).toBe("resolved"));
    expect(screen.getByTestId("authed").textContent).toBe("false");
    expect(screen.getByTestId("token").textContent).toBe("null");
  });
});
