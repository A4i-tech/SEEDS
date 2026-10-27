import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axiosInstance, { initSession } from "../../src/services/axiosInstance";
import { AuthProvider, useAuthContext } from "../../src/contexts/AuthContext";
import { setAccessToken, getAccessToken, clearAccessToken } from "../../src/utils/tokenStore";
import Login from "../../src/pages/Login";
import { useNavigation } from "../../src/hooks/useNavigation";
import * as authHelpers from "../../src/utils/authHelpers";

jest.mock("../../src/services/axiosInstance", () => ({
  __esModule: true,
  default: { post: jest.fn() },
  initSession: jest.fn(),
}));
jest.mock("../../src/hooks/useNavigation");
jest.mock("../../src/utils/authHelpers");

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
  useNavigation.mockReturnValue({ goToClassroom: jest.fn(), goToRegister: jest.fn() });
  authHelpers.isLocalStorageAvailable.mockReturnValue(true);
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

  it("still sends the revoke request when no in-memory access token is present", async () => {
    initSession.mockResolvedValue({ data: null, error: { message: "no session" } });
    clearAccessToken();
    axiosInstance.post.mockResolvedValue({ data: {} });
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );
    await waitFor(() => expect(screen.getByTestId("authed")).toHaveTextContent("false"));

    await userEvent.click(screen.getByText("logout"));

    await waitFor(() => expect(screen.getByTestId("outcome")).toHaveTextContent("resolved"));
    expect(getAccessToken()).toBeNull();
    expect(screen.getByTestId("authed")).toHaveTextContent("false");
    expect(axiosInstance.post).toHaveBeenCalled();
  });

  it("treats an interceptor-raised session-expired error (status, no response) as terminated", async () => {
    const sessionExpiredError = new Error("Session expired. Please login again.");
    sessionExpiredError.status = 401;
    axiosInstance.post.mockRejectedValue(sessionExpiredError);
    await renderProbe();

    await userEvent.click(screen.getByText("logout"));

    await waitFor(() => expect(screen.getByTestId("outcome")).toHaveTextContent("resolved"));
    expect(getAccessToken()).toBeNull();
    expect(screen.getByTestId("authed")).toHaveTextContent("false");
  });
});

const ToggleLogin = () => {
  const { isAuthenticated, loginState } = useAuthContext();
  const [show, setShow] = React.useState(true);
  return (
    <div>
      <span data-testid="authed">{String(isAuthenticated)}</span>
      <span data-testid="err">{String(!!loginState.error)}</span>
      <button onClick={() => setShow((prev) => !prev)}>toggle-login</button>
      {show && <Login />}
    </div>
  );
};

describe("Login unmount/remount clears stale error (PR #305 #14)", () => {
  beforeEach(() => {
    initSession.mockResolvedValue({ data: null, error: null });
  });

  const fillAndSubmit = async () => {
    await userEvent.type(screen.getByRole("textbox", { name: /phone/i }), "1234567890");
    await userEvent.type(document.querySelector('input[type="password"]'), "password123");
    await userEvent.click(screen.getByRole("button", { name: /^login$/i }));
  };

  it("does not resurface a stale login error after Login unmounts and remounts", async () => {
    axiosInstance.post.mockRejectedValueOnce({ response: { status: 401 } });
    render(
      <AuthProvider>
        <ToggleLogin />
      </AuthProvider>
    );

    await fillAndSubmit();
    await waitFor(() =>
      expect(screen.getByText(/username or password incorrect/i)).toBeInTheDocument()
    );

    await userEvent.click(screen.getByText("toggle-login"));
    expect(screen.queryByRole("button", { name: /^login$/i })).toBeNull();
    await waitFor(() => expect(screen.getByTestId("err")).toHaveTextContent("false"));

    await userEvent.click(screen.getByText("toggle-login"));
    expect(screen.queryByText(/username or password incorrect/i)).toBeNull();
  });

  it("does not clear unrelated auth state when the stale login error is cleared", async () => {
    axiosInstance.post.mockRejectedValueOnce({ response: { status: 401 } });
    render(
      <AuthProvider>
        <ToggleLogin />
      </AuthProvider>
    );
    await waitFor(() => expect(screen.getByTestId("authed")).toHaveTextContent("false"));

    await fillAndSubmit();
    await waitFor(() =>
      expect(screen.getByText(/username or password incorrect/i)).toBeInTheDocument()
    );

    await userEvent.click(screen.getByText("toggle-login"));
    await userEvent.click(screen.getByText("toggle-login"));

    expect(screen.getByTestId("authed")).toHaveTextContent("false");
    expect(getAccessToken()).toBe("tok");
  });
});
