import { render, waitFor } from "@testing-library/react";
import StoryDetails from "../../src/components/StoryDetails";
import { contentService } from "../../src/services/contentService";

jest.mock("../../src/services/contentService", () => ({
  contentService: { getAudioUrl: jest.fn() },
}));
jest.mock("../../src/utils/authHelpers", () => ({ getAuthHeaders: jest.fn(() => ({})) }));

const story = (extra) => ({
  id: "c1",
  type: "Story",
  title: { english: "T" },
  theme: { english: "Th" },
  is_processed: true,
  audio_content: [],
  ...extra,
});

beforeEach(() => {
  contentService.getAudioUrl.mockImplementation((_id, variant) => Promise.resolve(`signed-${variant}`));
  global.fetch = jest.fn(() => Promise.resolve({ json: () => Promise.resolve({ url: "signed-primary" }) }));
});

test("primary audio url is signed through sasUrl, not the default variant", async () => {
  const { container } = render(<StoryDetails type="story" story={story({ primary_audio_url: "http://b/x.wav" })} />);
  await waitFor(() => expect(container.querySelector("audio")).toHaveAttribute("src", "signed-primary"));
  expect(contentService.getAudioUrl).not.toHaveBeenCalled();
});

test("story without primary audio falls back to the final variant", async () => {
  const { container } = render(<StoryDetails type="story" story={story()} />);
  await waitFor(() => expect(container.querySelector("audio")).toHaveAttribute("src", "signed-final"));
  expect(global.fetch).not.toHaveBeenCalled();
});

test("riddle loads question and answer variants", async () => {
  const { container } = render(<StoryDetails type="riddle" story={story({ primary_audio_url: "http://b/x.wav" })} />);
  await waitFor(() => {
    const srcs = [...container.querySelectorAll("audio")].map((a) => a.getAttribute("src"));
    expect(srcs).toEqual(["signed-question", "signed-answer"]);
  });
});
