import React from "react";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axios from "axios";
import Login from "../../src/pages/Login";
import * as authHelpers from "../../src/utils/authHelpers";
import { useNavigation } from "../../src/hooks/useNavigation";

// Mock dependencies
jest.mock("axios");
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

      // Mock schools data
      axios.get.mockResolvedValueOnce({
        status: 200,
        data: [{ id: "school-1", tenantName: "Test School" }],
      });

      render(<Login />);

      // Wait for schools to load
      await waitFor(() => {
        expect(axios.get).toHaveBeenCalled();
      });

      // Fill in form - use getByRole for inputs
      const phoneInput = screen.getByRole('textbox', { name: /phone/i });
      const passwordInput = screen.getByLabelText(/password input/i);

      await userEvent.type(phoneInput, "1234567890");
      await userEvent.type(passwordInput, "password123");

      // Click login button once it is enabled
      const loginButton = screen.getByRole("button", { name: /login/i });
      await waitFor(() => {
        expect(loginButton).not.toBeDisabled();
      });
      fireEvent.click(loginButton);

      // Wait for error message
      await waitFor(() => {
        expect(
          screen.getByText(/local storage is not available/i)
        ).toBeInTheDocument();
      });

      // Verify login API was not called
      expect(axios.post).not.toHaveBeenCalled();
      expect(localStorageMock.setItem).not.toHaveBeenCalled();
    });

    test("shows appropriate error message when localStorage is unavailable", async () => {
      authHelpers.isLocalStorageAvailable.mockReturnValueOnce(false);

      // Mock schools data
      axios.get.mockResolvedValueOnce({
        status: 200,
        data: [{ id: "school-1", tenantName: "Test School" }],
      });

      render(<Login />);

      // Wait for schools to load
      await waitFor(() => {
        expect(axios.get).toHaveBeenCalled();
      });

      // Fill in form - use getByRole for inputs
      const phoneInput = screen.getByRole('textbox', { name: /phone/i });
      const passwordInput = screen.getByLabelText(/password input/i);

      await userEvent.type(phoneInput, "1234567890");
      await userEvent.type(passwordInput, "password123");

      const loginButton = screen.getByRole("button", { name: /login/i });
      await waitFor(() => {
        expect(loginButton).not.toBeDisabled();
      });
      fireEvent.click(loginButton);

      await waitFor(() => {
        const errorMessage = screen.getByText(
          /local storage is not available.*enable cookies/i
        );
        expect(errorMessage).toBeInTheDocument();
      });
    });

    test("when localStorage is available, does not show local-storage error", async () => {
      authHelpers.isLocalStorageAvailable.mockReturnValueOnce(true);

      // Mock schools fetch
      axios.get.mockResolvedValueOnce({
        status: 200,
        data: [{ id: "school-1", tenantName: "Test School" }],
      });

      render(<Login />);

      // Wait for schools to load
      await waitFor(() => {
        expect(axios.get).toHaveBeenCalled();
      });

      const loginButton = screen.getByRole("button", { name: /login/i });
      await waitFor(() => {
        expect(loginButton).not.toBeDisabled();
      });
      fireEvent.click(loginButton);

      await waitFor(() => {
        // Should not show the local-storage specific error when it is available
        expect(
          screen.queryByText(/local storage is not available/i)
        ).toBeNull();
      });
    });
  });

  describe("form validation", () => {
    test("shows error when fields are empty", async () => {
      axios.get.mockResolvedValueOnce({
        status: 200,
        data: [{ id: "school-1", tenantName: "Test School" }],
      });

      render(<Login />);

      // Wait for schools to load
      await waitFor(() => {
        expect(axios.get).toHaveBeenCalled();
      });

      const loginButton = screen.getByRole("button", { name: /login/i });
      await waitFor(() => {
        expect(loginButton).not.toBeDisabled();
      });
      fireEvent.click(loginButton);

      const errorAlert = await screen.findByRole("alert");
      expect(errorAlert).toBeInTheDocument();

      expect(axios.post).not.toHaveBeenCalled();
    });
  });
});
