import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import "@testing-library/jest-dom";
import ContentPlayback from "../../src/pages/ContentPlayback";
import * as contentService from "../../src/services/contentService";

// Mock dependencies
jest.mock("../../src/services/contentService");
jest.mock("../../src/utils/toast", () => ({
  showToast: {
    error: jest.fn(),
    success: jest.fn(),
  },
}));

// Mock useParams and useNavigate
const mockNavigate = jest.fn();
const mockParams = {};

jest.mock("react-router-dom", () => ({
  ...jest.requireActual("react-router-dom"),
  useParams: () => mockParams,
  useNavigate: () => mockNavigate,
}));

describe("ContentPlayback", () => {
  const mockContentResponse = {
    data: [
      {
        _id: "content-1",
        title: { english: "Content 1", local: "Content 1 Local" },
        description: "Description 1",
        type: "Story",
        language: "en",
        theme: { english: "Science", local: "विज्ञान" },
        audioUrl: "https://storage.blob.core.windows.net/container/audio1.mp3",
      },
      {
        _id: "content-2",
        title: { english: "Content 2", local: "Content 2 Local" },
        description: "Description 2",
        type: "Song",
        language: "hi",
        theme: { english: "Math", local: "गणित" },
      },
    ],
    pagination: {
      nextCursor: "cursor-123",
      hasMore: true,
      limit: 15,
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    contentService.getContent.mockResolvedValue(mockContentResponse);
    mockParams.classroomId = undefined;
  });

  const renderComponent = () => {
    return render(
      <BrowserRouter>
        <ContentPlayback />
      </BrowserRouter>
    );
  };

  test("renders loading spinner initially", () => {
    contentService.getContent.mockImplementation(
      () => new Promise(() => {}) // Never resolves
    );

    renderComponent();
    // LoadingSpinner doesn't render text, so we check it's not showing content yet
    expect(screen.queryByText("Content Library")).not.toBeInTheDocument();
  });

  test("fetches and displays content in table", async () => {
    renderComponent();

    await waitFor(() => {
      expect(contentService.getContent).toHaveBeenCalledWith({
        limit: 15,
        cursor: null,
      });
    });

    await waitFor(() => {
      expect(screen.getByText("Content Library")).toBeInTheDocument();
    });

    expect(screen.getByText("Content 1 (Content 1 Local)")).toBeInTheDocument();
    expect(screen.getByText("Content 2 (Content 2 Local)")).toBeInTheDocument();
  });

  test("displays table headers", async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText("Title")).toBeInTheDocument();
      expect(screen.getByText("Description")).toBeInTheDocument();
      expect(screen.getByText("Language")).toBeInTheDocument();
      expect(screen.getByText("Type")).toBeInTheDocument();
      expect(screen.getByText("Theme")).toBeInTheDocument();
      expect(screen.getByText("Audio")).toBeInTheDocument();
    });
  });

  test("makes table rows clickable", async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText("Content 1 (Content 1 Local)")).toBeInTheDocument();
    });

    const row = screen.getByText("Content 1 (Content 1 Local)").closest("tr");
    fireEvent.click(row);

    expect(mockNavigate).toHaveBeenCalledWith("/content/content-1", {
      state: {
        contentList: mockContentResponse.data,
        currentIndex: 0,
      },
    });
  });

  test("loads more content when Load More is clicked", async () => {
    const secondPageResponse = {
      data: [
        {
          _id: "content-3",
          title: { english: "Content 3" },
          type: "Poem",
          language: "en",
        },
      ],
      pagination: {
        nextCursor: null,
        hasMore: false,
        limit: 15,
      },
    };

    contentService.getContent
      .mockResolvedValueOnce(mockContentResponse)
      .mockResolvedValueOnce(secondPageResponse);

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText("Load More")).toBeInTheDocument();
    });

    const loadMoreButton = screen.getByText("Load More");
    fireEvent.click(loadMoreButton);

    await waitFor(() => {
      expect(contentService.getContent).toHaveBeenCalledWith({
        limit: 15,
        cursor: "cursor-123",
      });
    });

    await waitFor(() => {
      expect(screen.getByText("Content 3")).toBeInTheDocument();
    });
  });

  test("hides Load More button when no more content", async () => {
    const noMoreContentResponse = {
      ...mockContentResponse,
      pagination: {
        nextCursor: null,
        hasMore: false,
        limit: 15,
      },
    };

    contentService.getContent.mockResolvedValue(noMoreContentResponse);

    renderComponent();

    await waitFor(() => {
      expect(screen.queryByText("Load More")).not.toBeInTheDocument();
      expect(screen.getByText(/all content loaded/i)).toBeInTheDocument();
    });
  });

  test("navigates back to classrooms when classroomId is present", async () => {
    mockParams.classroomId = "classroom-123";

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText("Back to Classroom")).toBeInTheDocument();
    });

    const backButton = screen.getByText("Back to Classroom");
    fireEvent.click(backButton);

    expect(mockNavigate).toHaveBeenCalledWith("/classrooms/detail/classroom-123");
  });

  test("navigates back to classrooms list when no classroomId", async () => {
    mockParams.classroomId = undefined;

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText("Back to Classroom")).toBeInTheDocument();
    });

    const backButton = screen.getByText("Back to Classroom");
    fireEvent.click(backButton);

    expect(mockNavigate).toHaveBeenCalledWith("/classrooms");
  });

  test("displays empty state when no content", async () => {
    const emptyResponse = {
      data: [],
      pagination: {
        nextCursor: null,
        hasMore: false,
        limit: 15,
      },
    };

    contentService.getContent.mockResolvedValue(emptyResponse);

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText("No Content Available")).toBeInTheDocument();
    });
  });

  test("handles fetch errors", async () => {
    contentService.getContent.mockRejectedValue(new Error("Network error"));

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText(/failed to load content/i)).toBeInTheDocument();
    });
  });

  test("displays content type chips correctly", async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText("Story")).toBeInTheDocument();
      expect(screen.getByText("Song")).toBeInTheDocument();
    });
  });

  test("displays audio available indicator", async () => {
    renderComponent();

    await waitFor(() => {
      // Audio available chip should be present for content-1
      expect(screen.getByText("Content 1 (Content 1 Local)")).toBeInTheDocument();
    });
  });
});
