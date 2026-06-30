import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import App from "./App";
import { ConferenceProvider } from "./context/ConferenceContext";
import * as apiService from "./services/apiService";

// Mock the API service
jest.mock("./services/apiService");
const mockedCreateConference = apiService.createConference;

// Mock EventSource
global.EventSource = jest.fn(() => ({
  onmessage: null,
  onerror: null,
  close: jest.fn(),
}));

// Mock environment variables
process.env.REACT_APP_CONF_SERVER_BASE_URI = "http://localhost:3001";

describe("App Component", () => {
  const renderApp = () =>
    render(
      <ConferenceProvider>
        <App />
      </ConferenceProvider>
    );

  const teacherName = "John Doe";
  const studentName = "Smart Phone Motorola";
  const teacherPhone = "911234567890";
  const studentPhone = "911234567890";

  const selectTeacherAndStudent = () => {
    fireEvent.click(screen.getByText(new RegExp(teacherName)));
    fireEvent.click(screen.getByText(new RegExp(studentName)));
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("Rendering", () => {
    test("renders welcome title and sample data", () => {
      renderApp();

      expect(screen.getByText("Welcome")).toBeInTheDocument();
      expect(screen.getByText("Teacher")).toBeInTheDocument();
      expect(screen.getByText("Students")).toBeInTheDocument();

      // Teachers
      expect(screen.getByText(new RegExp(teacherName))).toBeInTheDocument();
      expect(screen.getByText(/Jane Smith/)).toBeInTheDocument();

      // Students
      expect(screen.getByText(new RegExp(studentName))).toBeInTheDocument();
      expect(screen.getByText(/Jack Brown/)).toBeInTheDocument();
      expect(screen.getByText(/Feature Phone/)).toBeInTheDocument();
    });
  });

  describe("Submit Button State", () => {
    test("disables when no selection, enables when teacher and student selected", () => {
      renderApp();

      const submitButton = screen.getByRole("button", { name: /submit/i });
      expect(submitButton).toBeDisabled();

      selectTeacherAndStudent();
      expect(submitButton).toBeEnabled();
    });
  });

  describe("Form Submission", () => {
    test("handles successful submission", async () => {
      mockedCreateConference.mockResolvedValue({ id: "conf-123" });
      renderApp();

      selectTeacherAndStudent();
      fireEvent.click(screen.getByRole("button", { name: /submit/i }));

      expect(screen.getByText("Submitting...")).toBeInTheDocument();

      await waitFor(() => {
        expect(mockedCreateConference).toHaveBeenCalledWith(teacherPhone, [studentPhone]);
      });
    });

    test("handles submission error", async () => {
      const consoleError = jest.spyOn(console, "error").mockImplementation();
      mockedCreateConference.mockRejectedValue(new Error("API Error"));
      renderApp();

      selectTeacherAndStudent();
      fireEvent.click(screen.getByRole("button", { name: /submit/i }));

      await waitFor(() => {
        expect(consoleError).toHaveBeenCalledWith("Error in API call:", expect.any(Error));
      });

      consoleError.mockRestore();
    });
  });
});
