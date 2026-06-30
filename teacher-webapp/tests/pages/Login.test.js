import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axiosInstance from "../../src/services/axiosInstance";
import Login from "../../src/pages/Login";
import * as authHelpers from "../../src/utils/authHelpers";
import { useNavigation } from "../../src/hooks/useNavigation";

// Mock dependencies
jest.mock("../../src/services/axiosInstance", () => ({
  __esModule: true,
  default: {
    post: jest.fn(),
  },
}));
jest.mock("../../src/hooks/useNavigation");
jest.mock("../../src/utils/authHelpers");

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
});
