import React from "react";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import ConferenceAudioPlayer from "../../../src/components/audio/ConferenceAudioPlayer";

jest.mock("../../../src/services/apiService", () => ({
  pauseAudio: jest.fn(),
  resumeAudio: jest.fn(),
  seekAudio: jest.fn(),
  seekAudioAbsolute: jest.fn(),
  setPlaybackSpeed: jest.fn(),
}));

const renderPlayer = (audioContentState) =>
  render(
    <ConferenceAudioPlayer
      trackTitle="Lesson"
      confId="conf1"
      audioContentState={{ status: "Playing", position_seconds: 0, duration_seconds: 60, ...audioContentState }}
    />
  );

describe("ConferenceAudioPlayer speed fallback", () => {
  test("keeps the selected speed and shows a notice when playing the 1x fallback", () => {
    renderPlayer({ speed: 2, actual_speed: 1 });

    expect(screen.getByRole("combobox")).toHaveTextContent("2x");
    expect(screen.getByText("2x audio unavailable for this track. Playing at 1x.")).toBeInTheDocument();
  });

  test("shows no notice when the selected speed is playing", () => {
    renderPlayer({ speed: 1.5, actual_speed: 1.5 });

    expect(screen.getByRole("combobox")).toHaveTextContent("1.5x");
    expect(screen.queryByText(/audio unavailable/)).not.toBeInTheDocument();
  });
});
