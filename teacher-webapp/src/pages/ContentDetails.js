import React, { useState, useEffect, useCallback } from "react";
import { Box, Card, CardContent, Typography, Button, Alert, CircularProgress } from "@mui/material";
import {
  ArrowBack as ArrowBackIcon,
  MenuBook as MenuBookIcon,
  LibraryMusic as LibraryMusicIcon,
} from "@mui/icons-material";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { getContentById, getContentSasUrl } from "../services/contentService";
import { showToast } from "../utils/toast";
import { LoadingSpinner } from "../components/common/LoadingSpinner";
import { PageContainer } from "../components/layout/PageContainer";
import { ROUTES } from "../constants/routes";
import AudioPlayer from "../components/audio/AudioPlayer";

const ContentDetails = () => {
  const navigate = useNavigate();
  const { contentId } = useParams();
  const location = useLocation();
  const [content, setContent] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingAudio, setLoadingAudio] = useState(false);
  const [error, setError] = useState(null);

  // Content list and navigation state (passed from ContentPlayback)
  const [contentList, setContentList] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(-1);

  useEffect(() => {
    if (location.state?.contentList && location.state?.currentIndex !== undefined) {
      setContentList(location.state.contentList);
      setCurrentIndex(location.state.currentIndex);
    }
  }, [location.state]);

  const fetchContent = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      setAudioUrl(null);

      const contentData = await getContentById(contentId);
      setContent(contentData);

      // Determine audio URL priority
      const audioSource = getAudioSource(contentData);
      if (audioSource) {
        await fetchSasUrl(audioSource);
      } else {
        setError("No audio available for this content");
      }
    } catch (err) {
      console.error("Error fetching content:", err);
      setError(err.message || "Failed to load content");
      showToast.error("Failed to load content");
    } finally {
      setLoading(false);
    }
  }, [contentId]);

  useEffect(() => {
    fetchContent();
  }, [fetchContent]);

  const getAudioSource = (contentData) => {
    // Priority: audioContent[0] > title.audioUrl > theme.audioUrl
    if (contentData.audioContent && contentData.audioContent.length > 0) {
      return contentData.audioContent[0].audioUrl;
    }
    if (contentData.title?.audioUrl) {
      return contentData.title.audioUrl;
    }
    if (contentData.theme?.audioUrl) {
      return contentData.theme.audioUrl;
    }
    return null;
  };

  const fetchSasUrl = async (url) => {
    try {
      setLoadingAudio(true);
      const sasUrl = await getContentSasUrl(url);
      setAudioUrl(sasUrl);
    } catch (err) {
      console.error("Error fetching SAS URL:", err);
      setError("Failed to load audio. Please try again.");
      showToast.error("Failed to load audio");
    } finally {
      setLoadingAudio(false);
    }
  };

  const handleBack = () => {
    navigate(ROUTES.CLASSROOMS);
  };

  const handleNextPage = () => {
    if (contentList.length === 0 || currentIndex < 0) {
      showToast.error("No more content available");
      return;
    }

    if (currentIndex >= contentList.length - 1) {
      showToast.error("No more pages");
      return;
    }

    const nextIndex = currentIndex + 1;
    const nextContent = contentList[nextIndex];

    // Navigate to next content
    navigate(ROUTES.CONTENT_DETAILS(nextContent._id), {
      state: {
        contentList,
        currentIndex: nextIndex,
      },
    });
  };

  const getContentIcon = () => {
    if (!content) return <MenuBookIcon />;

    const type = content.type?.toLowerCase() || "";
    if (type === "song" || type === "rhyme" || type === "poem") {
      return <LibraryMusicIcon />;
    }
    return <MenuBookIcon />;
  };

  const formatContentTitle = () => {
    if (!content) return "Unknown";
    if (content.title?.english && content.title?.local) {
      return `${content.title.english} (${content.title.local})`;
    }
    return content.title?.english || content.title?.local || "Untitled Content";
  };

  const formatContentType = () => {
    if (!content || !content.type) return "";
    return content.type.charAt(0).toUpperCase() + content.type.slice(1).toLowerCase();
  };

  const formatLanguage = () => {
    if (!content || !content.language) return "";
    return content.language.charAt(0).toUpperCase() + content.language.slice(1).toLowerCase();
  };

  if (loading) {
    return <LoadingSpinner />;
  }

  if (error && !content) {
    return (
      <PageContainer>
        <Box sx={{ mb: 3 }}>
          <Button startIcon={<ArrowBackIcon />} onClick={handleBack} sx={{ mb: 2 }}>
            Back to Content
          </Button>
        </Box>
        <Alert severity="error">{error}</Alert>
      </PageContainer>
    );
  }

  if (!content) {
    return (
      <PageContainer>
        <Box sx={{ mb: 3 }}>
          <Button startIcon={<ArrowBackIcon />} onClick={handleBack} sx={{ mb: 2 }}>
            Back to Content
          </Button>
        </Box>
        <Alert severity="warning">Content not found</Alert>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <Box sx={{ mb: 3 }}>
        <Button startIcon={<ArrowBackIcon />} onClick={handleBack} sx={{ mb: 2 }}>
          Back to Content
        </Button>
      </Box>

      {/* Content Card with Icon */}
      <Card
        sx={{
          mb: 3,
          minHeight: 300,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
        }}
      >
        <CardContent
          sx={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            width: "100%",
            minHeight: 300,
          }}
        >
          <Box
            sx={{
              fontSize: 120,
              color: "primary.main",
              mb: 2,
            }}
          >
            {getContentIcon()}
          </Box>
        </CardContent>
      </Card>

      {/* Content Title */}
      <Typography
        variant="h4"
        component="h1"
        sx={{
          fontWeight: 600,
          textAlign: "center",
          mb: 1,
          color: "primary.main",
        }}
      >
        {formatContentTitle()}
      </Typography>

      {/* Content Type and Language */}
      <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 1, mb: 3 }}>
        <Typography variant="h6" color="text.secondary">
          {formatContentType()}
        </Typography>
        <Typography variant="h6" color="text.secondary">
          •
        </Typography>
        <Typography variant="h6" color="text.secondary">
          {formatLanguage()}
        </Typography>
      </Box>

      {/* Audio Player */}
      {loadingAudio ? (
        <Box sx={{ display: "flex", justifyContent: "center", mb: 3 }}>
          <CircularProgress />
        </Box>
      ) : audioUrl ? (
        <Box sx={{ mb: 3 }}>
          <AudioPlayer audioUrl={audioUrl} autoPlay={true} />
        </Box>
      ) : (
        <Alert severity="warning" sx={{ mb: 3 }}>
          No audio available for this content
        </Alert>
      )}

      {/* Next Page Button */}
      {contentList.length > 0 && currentIndex >= 0 && (
        <Box sx={{ display: "flex", justifyContent: "center", mt: 4 }}>
          <Button
            variant="contained"
            color="primary"
            onClick={handleNextPage}
            disabled={currentIndex >= contentList.length - 1}
            sx={{ minWidth: 200 }}
          >
            {currentIndex >= contentList.length - 1 ? "No More Pages" : "Next Page"}
          </Button>
        </Box>
      )}

      {error && (
        <Alert severity="error" sx={{ mt: 2 }}>
          {error}
        </Alert>
      )}
    </PageContainer>
  );
};

export default ContentDetails;
