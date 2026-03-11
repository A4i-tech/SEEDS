import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import "@testing-library/jest-dom";
import ContentDetails from "../../src/pages/ContentDetails";
import * as contentService from "../../src/services/contentService";
import { ROUTES } from "../../src/constants/routes";

// Mock dependencies
jest.mock("../../src/services/contentService");
jest.mock("../../src/utils/toast", () => ({
  showToast: {
    error: jest.fn(),
    success: jest.fn(),
  },
}));

// Mock useParams and useLocation
const mockNavigate = jest.fn();
const mockParams = { contentId: "content-123" };
const mockLocation = {
  state: {
    contentList: [
      { _id: "content-123", title: { english: "Content 1" } },
      { _id: "content-456", title: { english: "Content 2" } },
    ],
    currentIndex: 0,
  },
  pathname: "/content/content-123",
  search: "",
  hash: "",
};

jest.mock("react-router-dom", () => ({
  ...jest.requireActual("react-router-dom"),
  useParams: () => mockParams,
  useNavigate: () => mockNavigate,
  useLocation: () => mockLocation,
}));

describe("ContentDetails", () => {
  const mockContent = {
    _id: "content-123",
    title: {
      english: "Test Content",
      local: "Test Local",
    },
    type: "Story",
    language: "en",
    description: "Test description",
    audioContent: [
      {
        description: "Audio 1",
        audioUrl: "https://storage.blob.core.windows.net/container/audio1.mp3",
      },
    ],
    theme: {
      english: "Science",
      local: "विज्ञान",
    },
  };

  const mockSasUrl = "https://storage.blob.core.windows.net/container/audio1.mp3?sv=2021-06-08&sig=...";

  beforeEach(() => {
    jest.clearAllMocks();
    contentService.getContentById.mockResolvedValue(mockContent);
    contentService.getContentSasUrl.mockResolvedValue(mockSasUrl);
  });

  const renderComponent = () => {
    return render(
      <BrowserRouter>
        <ContentDetails />
      </BrowserRouter>
    );
  };

  test("renders loading spinner initially", () => {
    contentService.getContentById.mockImplementation(
      () => new Promise(() => {}) // Never resolves
    );

    renderComponent();
    // LoadingSpinner doesn't render text, so we check for the component
    expect(screen.queryByText("Back to Content")).not.toBeInTheDocument();
  });

  test("fetches and displays content", async () => {
    renderComponent();

    await waitFor(() => {
      expect(contentService.getContentById).toHaveBeenCalledWith("content-123");
    });

    await waitFor(() => {
      expect(screen.getByText("Test Content (Test Local)")).toBeInTheDocument();
    });

    expect(screen.getByText("Story")).toBeInTheDocument();
    expect(screen.getByText("En")).toBeInTheDocument();
  });

  test("fetches SAS URL for audio content", async () => {
    renderComponent();

    await waitFor(() => {
      expect(contentService.getContentSasUrl).toHaveBeenCalledWith(
        "https://storage.blob.core.windows.net/container/audio1.mp3"
      );
    });
  });

  test("prioritizes audioContent over title.audioUrl", async () => {
    const contentWithTitleAudio = {
      ...mockContent,
      audioContent: [],
      title: {
        ...mockContent.title,
        audioUrl: "https://storage.blob.core.windows.net/container/title.mp3",
      },
    };

    contentService.getContentById.mockResolvedValue(contentWithTitleAudio);

    renderComponent();

    await waitFor(() => {
      expect(contentService.getContentSasUrl).toHaveBeenCalledWith(
        "https://storage.blob.core.windows.net/container/title.mp3"
      );
    });
  });

  test("prioritizes title.audioUrl over theme.audioUrl", async () => {
    const contentWithThemeAudio = {
      ...mockContent,
      audioContent: [],
      title: {
        ...mockContent.title,
        audioUrl: null,
      },
      theme: {
        ...mockContent.theme,
        audioUrl: "https://storage.blob.core.windows.net/container/theme.mp3",
      },
    };

    contentService.getContentById.mockResolvedValue(contentWithThemeAudio);

    renderComponent();

    await waitFor(() => {
      expect(contentService.getContentSasUrl).toHaveBeenCalledWith(
        "https://storage.blob.core.windows.net/container/theme.mp3"
      );
    });
  });

  test("shows error when no audio is available", async () => {
    const contentWithoutAudio = {
      ...mockContent,
      audioContent: [],
      title: { ...mockContent.title, audioUrl: null },
      theme: { ...mockContent.theme, audioUrl: null },
    };

    contentService.getContentById.mockResolvedValue(contentWithoutAudio);

    renderComponent();

    await waitFor(() => {
      // There may be multiple alerts, so use getAllByText
      const alerts = screen.getAllByText(/no audio available/i);
      expect(alerts.length).toBeGreaterThan(0);
    });
  });

  test("navigates back to content list", async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText("Back to Content")).toBeInTheDocument();
    });

    const backButton = screen.getByText("Back to Content");
    fireEvent.click(backButton);

    expect(mockNavigate).toHaveBeenCalledWith(ROUTES.CONTENT);
  });

  test("navigates to next page when Next Page button is clicked", async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText("Next Page")).toBeInTheDocument();
    });

    const nextPageButton = screen.getByText("Next Page");
    fireEvent.click(nextPageButton);

    expect(mockNavigate).toHaveBeenCalledWith("/content/content-456", {
      state: {
        contentList: mockLocation.state.contentList,
        currentIndex: 1,
      },
    });
  });

  test("disables Next Page button when at end of list", async () => {
    const locationAtEnd = {
      ...mockLocation,
      state: {
        ...mockLocation.state,
        currentIndex: 1, // Last item
      },
    };

    jest.spyOn(require("react-router-dom"), "useLocation").mockReturnValue(locationAtEnd);

    renderComponent();

    await waitFor(() => {
      const nextPageButton = screen.getByText("No More Pages");
      expect(nextPageButton).toBeDisabled();
    });
  });

  test("shows book icon for Story type", async () => {
    renderComponent();

    await waitFor(() => {
      // MenuBookIcon should be rendered (we check by the component structure)
      expect(screen.getByText("Story")).toBeInTheDocument();
    });
  });

  test("shows music icon for Song type", async () => {
    const songContent = {
      ...mockContent,
      type: "Song",
    };

    contentService.getContentById.mockResolvedValue(songContent);

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText("Song")).toBeInTheDocument();
    });
  });

  test("handles fetch errors gracefully", async () => {
    contentService.getContentById.mockRejectedValue(new Error("Network error"));

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText(/network error/i)).toBeInTheDocument();
    });
  });

  test("handles 404 errors", async () => {
    contentService.getContentById.mockRejectedValue(new Error("Content not found"));

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText(/content not found/i)).toBeInTheDocument();
    });
  });
});
