import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import { DetailsPage } from "../src/callPage";
import * as apiService from "../src/services/apiService";

// Mock the API service
jest.mock("../src/services/apiService");

// Mock the App component import
jest.mock("../src/App", () => {
  return function MockedApp() {
    return <div data-testid="mocked-app">Mocked App Component</div>;
  };
});

const mockApiService = {
  startConferenceCall: jest.fn(),
  endConferenceCall: jest.fn(),
  sinkConferenceCall: jest.fn(),
  muteParticipant: jest.fn(),
  unmuteParticipant: jest.fn(),
  playAudio: jest.fn(),
  pauseAudio: jest.fn(),
  resumeAudio: jest.fn(),
  addParticipant: jest.fn(),
};

Object.assign(apiService, mockApiService);

const teacher = {
  name: "Test Teacher",
  phone_number: "1234567890",
  role: "Teacher",
  is_muted: true,
  call_status: "connected",
  is_raised: false,
};
const student1 = {
  name: "Test Student 1",
  phone_number: "0987654321",
  role: "Student",
  is_muted: false,
  call_status: "connected",
  is_raised: true,
};
const student2 = {
  name: "Test Student 2",
  phone_number: "1122334455",
  role: "Student",
  is_muted: true,
  call_status: "disconnected",
  is_raised: false,
};

const mockConferenceContext = {
  userList: [teacher, student1],
  confId: "test-conf-123",
  isConfCallRunning: false,
  audioContentState: { current_url: "", status: "Paused", paused_at: "" },
};

// Mock the useConference hook
jest.mock("../src/context/ConferenceContext", () => ({
  ...jest.requireActual("../src/context/ConferenceContext"),
  useConference: () => mockConferenceContext,
  ConferenceProvider: ({ children }) => <div>{children}</div>,
}));

describe("DetailsPage Component", () => {
  const renderDetailsPage = () => render(<DetailsPage />);

  const expectApiCall = async (apiMethod, confId, phone = null) => {
    await waitFor(() => {
      if (phone) {
        expect(apiMethod).toHaveBeenCalledWith(confId, phone);
      } else {
        expect(apiMethod).toHaveBeenCalledWith(confId);
      }
    });
  };

  beforeEach(() => {
    jest.clearAllMocks();
    Object.assign(mockConferenceContext, {
      userList: [teacher, student1],
      isConfCallRunning: false,
      audioContentState: { current_url: "", status: "Paused", paused_at: "" },
    });
  });

  describe("Rendering", () => {
    test("renders page layout and participant data", () => {
      renderDetailsPage();

      expect(screen.getByText("Details")).toBeInTheDocument();
      expect(screen.getByText("Teacher")).toBeInTheDocument();
      expect(screen.getByText("Students")).toBeInTheDocument();
      expect(screen.getByText("Test Teacher")).toBeInTheDocument();
      expect(screen.getByText("Test Student 1")).toBeInTheDocument();
      expect(screen.getAllByText("connected").length).toBeGreaterThan(0);
      expect(
        screen.getByRole("img", { name: /raised hand/i })
      ).toBeInTheDocument();
    });
  });

  describe("Call Management", () => {
    test("handles start and end call functionality", async () => {
      mockApiService.startConferenceCall.mockResolvedValue({});
      renderDetailsPage();

      fireEvent.click(screen.getByText("Start Call"));
      expect(screen.getByText("Loading...")).toBeInTheDocument();
      await expectApiCall(mockApiService.startConferenceCall, "test-conf-123");

      mockConferenceContext.isConfCallRunning = true;
      renderDetailsPage();
      expect(screen.getByText("End Call")).toBeInTheDocument();
    });

    test("handles sink conference functionality", async () => {
      mockApiService.sinkConferenceCall.mockResolvedValue({});
      renderDetailsPage();

      fireEvent.click(screen.getByText("Sink Conference"));
      expect(screen.getByText("Sinking...")).toBeInTheDocument();
      await expectApiCall(mockApiService.sinkConferenceCall, "test-conf-123");
    });
  });

  describe("Participant Management", () => {
    test("handles mute/unmute and reconnect functionality", async () => {
      mockApiService.unmuteParticipant.mockResolvedValue({});
      mockApiService.addParticipant.mockResolvedValue({});
      renderDetailsPage();

      fireEvent.click(screen.getByText("Unmute"));
      await expectApiCall(
        mockApiService.unmuteParticipant,
        "test-conf-123",
        "1234567890"
      );

      // Test disconnected participant
      mockConferenceContext.userList.push({
        ...student2,
        call_status: "disconnected",
      });
      mockConferenceContext.isConfCallRunning = true;
      renderDetailsPage();

      expect(screen.getByText("Reconnect")).toBeInTheDocument();
      fireEvent.click(screen.getByText("Reconnect"));
      await expectApiCall(
        mockApiService.addParticipant,
        "test-conf-123",
        "1122334455"
      );
    });

    test("handles add participant modal", () => {
      const { rerender } = renderDetailsPage();
      expect(screen.getByText("Add Participant")).toBeDisabled();

      mockConferenceContext.isConfCallRunning = true;
      rerender(<DetailsPage />);

      const addButton = screen.getByText("Add Participant");
      expect(addButton).toBeEnabled();
      fireEvent.click(addButton);
      expect(
        screen.getByText("Select Participants to Add")
      ).toBeInTheDocument();
    });
  });

  describe("Audio Control", () => {
    test("handles all music control states", async () => {
      mockConferenceContext.isConfCallRunning = true;

      // Play music (no current audio)
      mockConferenceContext.audioContentState = { status: "", current_url: "" };
      mockApiService.playAudio.mockResolvedValue({});
      renderDetailsPage();
      fireEvent.click(screen.getByText("Play Music"));
      await expectApiCall(mockApiService.playAudio, "test-conf-123");

      // Pause music (playing)
      mockConferenceContext.audioContentState.status = "Playing";
      mockApiService.pauseAudio.mockResolvedValue({});
      renderDetailsPage();
      fireEvent.click(screen.getByText("Pause Music"));
      await expectApiCall(mockApiService.pauseAudio, "test-conf-123");

      // Resume music (paused with URL)
      mockConferenceContext.audioContentState = {
        status: "Paused",
        current_url: "audio.wav",
      };
      mockApiService.resumeAudio.mockResolvedValue({});
      renderDetailsPage();
      fireEvent.click(screen.getByText("Resume Music"));
      await expectApiCall(mockApiService.resumeAudio, "test-conf-123");
    });
  });

  describe("Error Handling", () => {
    test("handles API errors gracefully", async () => {
      const consoleError = jest.spyOn(console, "error").mockImplementation();
      mockApiService.startConferenceCall.mockRejectedValue(
        new Error("API Error")
      );
      renderDetailsPage();

      fireEvent.click(screen.getByText("Start Call"));
      await waitFor(() => {
        expect(consoleError).toHaveBeenCalledWith(
          "Error starting the call:",
          expect.any(Error)
        );
      });
      consoleError.mockRestore();
    });
  });
});
