import { render, screen, fireEvent, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import AddStory from "../../src/components/AddStory";
import { contentService } from "../../src/services/contentService";

jest.mock("../../src/services/contentService", () => ({
  contentService: { getAllContent: jest.fn() },
}));

jest.mock("@azure/storage-blob", () => ({
  BlockBlobClient: jest.fn(),
}));

const content = {
  id: "story1",
  type: "Story",
  description: "",
  language: "en",
  title: { english: "Original Title", local: "Original Title", audio_url: "" },
  theme: { english: "Animals", local: "Animals", audio_url: "" },
  audio_content: [],
  created_by: "tester",
  is_pull_model: false,
  is_teacher_app: false,
  is_processed: false,
  is_deleted: false,
};

describe("AddStory #594 title race", () => {
  it("does not overwrite a user's in-progress title edit when the content list fetch resolves late", async () => {
    let resolveGetAllContent;
    contentService.getAllContent.mockReturnValue(
      new Promise((resolve) => {
        resolveGetAllContent = resolve;
      }),
    );

    render(
      <MemoryRouter>
        <AddStory content={content} contentType="Story" onContentTypeChange={() => {}} />
      </MemoryRouter>,
    );

    const titleInput = screen.getByDisplayValue("Original Title");
    fireEvent.change(titleInput, { target: { value: "User Edited Title" } });
    expect(titleInput.value).toBe("User Edited Title");

    await act(async () => {
      resolveGetAllContent([]);
    });

    expect(await screen.findByDisplayValue("User Edited Title")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("Original Title")).not.toBeInTheDocument();
  });
});
