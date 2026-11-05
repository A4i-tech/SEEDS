import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axiosInstance from "../../src/services/axiosInstance";
import Login from "../../src/pages/Login";
import * as authHelpers from "../../src/utils/authHelpers";
import { useNavigation } from "../../src/hooks/useNavigation";
import { useAuthContext } from "../../src/contexts/AuthContext";

// Mock dependencies
jest.mock("../../src/services/axiosInstance", () => ({
  __esModule: true,
  default: {
    post: jest.fn(),
  },
}));
jest.mock("../../src/hooks/useNavigation");
jest.mock("../../src/utils/authHelpers");
jest.mock("../../src/contexts/AuthContext");

describe("Login", () => {
  const mockNavigate = {
    goToClassroom: jest.fn(),
    goToRegister: jest.fn(),
  };

  const localStorageMock = (() => {
    let store = {};
    return {
      getItem: jest.fn((key) => store[key] || null),
      setItem: jest.fn((key, value) => {
        store[key] = value.toString();
      }),
      removeItem: jest.fn((key) => {
        delete store[key];
      }),
      clear: jest.fn(() => {
        store = {};
      }),
    };
  })();

  beforeEach(() => {
    Object.defineProperty(window, "localStorage", {
      value: localStorageMock,
      writable: true,
    });
    localStorageMock.clear();
    jest.clearAllMocks();
    useNavigation.mockReturnValue(mockNavigate);
    authHelpers.isLocalStorageAvailable.mockReturnValue(true);
    useAuthContext.mockReturnValue({
      login: jest.fn(),
      loginState: { data: null, error: null, isLoading: false },
    });
  });

  describe("localStorage availability check", () => {
    test("prevents login when localStorage is not available", async () => {
      authHelpers.isLocalStorageAvailable.mockReturnValueOnce(false);

      render(<Login />);

      const phoneInput = screen.getByRole("textbox", { name: /phone/i });
      const passwordInput = screen.getByLabelText(/password input/i);

      await userEvent.type(phoneInput, "1234567890");
      await userEvent.type(passwordInput, "password123");

      const loginButton = screen.getByRole("button", { name: /login/i });
      fireEvent.click(loginButton);

      await waitFor(() => {
        expect(screen.getByText(/local storage is not available/i)).toBeInTheDocument();
      });

      expect(axiosInstance.post).not.toHaveBeenCalled();
      expect(localStorageMock.setItem).not.toHaveBeenCalled();
    });

    test("shows appropriate error message when localStorage is unavailable", async () => {
      authHelpers.isLocalStorageAvailable.mockReturnValueOnce(false);

      render(<Login />);

      const phoneInput = screen.getByRole("textbox", { name: /phone/i });
      const passwordInput = screen.getByLabelText(/password input/i);

      await userEvent.type(phoneInput, "1234567890");
      await userEvent.type(passwordInput, "password123");

      const loginButton = screen.getByRole("button", { name: /login/i });
      fireEvent.click(loginButton);

      await waitFor(() => {
        const errorMessage = screen.getByText(/local storage is not available.*enable cookies/i);
        expect(errorMessage).toBeInTheDocument();
      });
    });

    test("when localStorage is available, does not show local-storage error", async () => {
      authHelpers.isLocalStorageAvailable.mockReturnValueOnce(true);

      render(<Login />);

      const loginButton = screen.getByRole("button", { name: /login/i });
      fireEvent.click(loginButton);

      await waitFor(() => {
        expect(screen.queryByText(/local storage is not available/i)).toBeNull();
      });
    });
  });

  describe("form validation", () => {
    test("shows error when fields are empty", async () => {
      render(<Login />);

      const loginButton = screen.getByRole("button", { name: /login/i });
      fireEvent.click(loginButton);

      const errorAlert = await screen.findByRole("alert");
      expect(errorAlert).toBeInTheDocument();
      expect(errorAlert).toHaveTextContent(/all fields are required/i);

      expect(axiosInstance.post).not.toHaveBeenCalled();
    });
  });

  describe("login failure error messages", () => {
    test("401 shows invalid-credentials message", async () => {
      useAuthContext.mockReturnValue({
        login: jest.fn(),
        loginState: { data: null, error: { response: { status: 401, data: { message: "Invalid phone or password" } } }, isLoading: false },
      });

      render(<Login />);

      const errorAlert = await screen.findByRole("alert");
      expect(errorAlert).toHaveTextContent(/username or password incorrect/i);
    });

    test("500 shows a server-error message, not invalid credentials", async () => {
      useAuthContext.mockReturnValue({
        login: jest.fn(),
        loginState: { data: null, error: { response: { status: 500, data: { message: "Internal server error" } } }, isLoading: false },
      });

      render(<Login />);

      const errorAlert = await screen.findByRole("alert");
      expect(errorAlert).toHaveTextContent(/internal server error/i);
      expect(errorAlert).not.toHaveTextContent(/username or password incorrect/i);
    });

    test("network/unknown error shows a connectivity message, not invalid credentials", async () => {
      useAuthContext.mockReturnValue({
        login: jest.fn(),
        loginState: { data: null, error: { message: "Network Error" }, isLoading: false },
      });

      render(<Login />);

      const errorAlert = await screen.findByRole("alert");
      expect(errorAlert).toHaveTextContent(/unable to reach the server/i);
      expect(errorAlert).not.toHaveTextContent(/username or password incorrect/i);
    });

    test("successful login shows no error alert", async () => {
      useAuthContext.mockReturnValue({
        login: jest.fn(),
        loginState: { data: { token: "tok" }, error: null, isLoading: false },
      });

      render(<Login />);

      expect(screen.queryByRole("alert")).toBeNull();
    });
  });
});
