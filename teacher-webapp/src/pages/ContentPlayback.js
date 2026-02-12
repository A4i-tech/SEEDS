import React, { useState, useEffect } from "react";
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  Alert,
  Chip,
  CircularProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
} from "@mui/material";
import {
  ArrowBack as ArrowBackIcon,
  LibraryMusic as LibraryMusicIcon,
  Language as LanguageIcon,
  Category as CategoryIcon,
  PlayArrow as PlayArrowIcon,
} from "@mui/icons-material";
import { useNavigate, useParams } from "react-router-dom";
import { getContent } from "../services/contentService";
import { showToast } from "../utils/toast";
import { LoadingSpinner } from "../components/common/LoadingSpinner";
import { PageContainer } from "../components/layout/PageContainer";
import { ROUTES } from "../constants/routes";

const ContentPlayback = () => {
  const navigate = useNavigate();
  const { classroomId } = useParams();
  const [content, setContent] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [pagination, setPagination] = useState({
    nextCursor: null,
    hasMore: false,
    limit: 15,
  });

  // Column widths state - default widths for each column
  const [columnWidths, setColumnWidths] = useState({
    title: 200,
    description: 300,
    language: 120,
    type: 120,
    theme: 200,
    audio: 150,
  });

  // Resizing state
  const [resizing, setResizing] = useState({
    isResizing: false,
    column: null,
    startX: 0,
    startWidth: 0,
  });

  useEffect(() => {
    fetchContent();
  }, []);

  const fetchContent = async (cursor = null) => {
    try {
      if (cursor) {
        setLoadingMore(true);
      } else {
        setLoading(true);
        setError(null);
      }

      const response = await getContent({
        limit: 15,
        cursor: cursor,
      });

      if (cursor) {
        // Append new content to existing list
        setContent((prevContent) => [...prevContent, ...response.data]);
      } else {
        // Replace content with new data
        setContent(response.data);
      }

      setPagination({
        nextCursor: response.pagination?.nextCursor || null,
        hasMore: response.pagination?.hasMore || false,
        limit: response.pagination?.limit || 15,
      });
    } catch (err) {
      console.error("Error fetching content:", err);
      setError("Failed to load content. Please try again.");
      showToast.error("Failed to load content");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  const handleLoadMore = () => {
    if (pagination.nextCursor && !loadingMore) {
      fetchContent(pagination.nextCursor);
    }
  };

  const handleBack = () => {
    if (classroomId) {
      navigate(ROUTES.CLASSROOM_DETAIL(classroomId));
    } else {
      navigate(ROUTES.CLASSROOMS);
    }
  };

  const handleRowClick = (item, index) => {
    navigate(ROUTES.CONTENT_DETAILS(item._id), {
      state: {
        contentList: content,
        currentIndex: index,
      },
    });
  };

  const formatContentTitle = (item) => {
    if (item.title?.english && item.title?.local) {
      return `${item.title.english} (${item.title.local})`;
    }
    return item.title?.english || item.title?.local || item.title || "Untitled Content";
  };

  const formatTheme = (item) => {
    if (item.theme?.english && item.theme?.local) {
      return `${item.theme.english} (${item.theme.local})`;
    }
    return item.theme?.english || item.theme?.local || item.theme || "No theme";
  };

  // Handle resize start
  const handleResizeStart = (column, e) => {
    e.preventDefault();
    setResizing({
      isResizing: true,
      column,
      startX: e.clientX,
      startWidth: columnWidths[column],
    });
  };

  // Handle resize move
  useEffect(() => {
    const handleResizeMove = (e) => {
      if (!resizing.isResizing) return;

      const diff = e.clientX - resizing.startX;
      const newWidth = Math.max(50, resizing.startWidth + diff); // Minimum width of 50px

      setColumnWidths((prev) => ({
        ...prev,
        [resizing.column]: newWidth,
      }));
    };

    const handleResizeEnd = () => {
      setResizing({
        isResizing: false,
        column: null,
        startX: 0,
        startWidth: 0,
      });
    };

    if (resizing.isResizing) {
      document.addEventListener("mousemove", handleResizeMove);
      document.addEventListener("mouseup", handleResizeEnd);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    }

    return () => {
      document.removeEventListener("mousemove", handleResizeMove);
      document.removeEventListener("mouseup", handleResizeEnd);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [resizing]);

  if (loading) {
    return <LoadingSpinner />;
  }

  return (
    <PageContainer>
      <Box sx={{ mb: 3 }}>
        <Button startIcon={<ArrowBackIcon />} onClick={handleBack} sx={{ mb: 2 }}>
          Back to Classroom
        </Button>
        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 2,
          }}
        >
          <Typography variant="h4" component="h1" sx={{ fontWeight: 600 }}>
            Content Library
          </Typography>
        </Box>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {!loading && content.length === 0 && !error && (
        <Card sx={{ textAlign: "center", py: 6 }}>
          <CardContent>
            <LibraryMusicIcon sx={{ fontSize: 64, color: "text.secondary", mb: 2 }} />
            <Typography variant="h6" color="text.secondary" gutterBottom>
              No Content Available
            </Typography>
            <Typography variant="body2" color="text.secondary">
              There is no content available at the moment.
            </Typography>
          </CardContent>
        </Card>
      )}

      {content.length > 0 && (
        <>
          <TableContainer component={Paper} sx={{ mb: 3 }}>
            <Table sx={{ tableLayout: "fixed", width: "100%" }}>
              <TableHead>
                <TableRow>
                  <TableCell
                    sx={{
                      fontWeight: 600,
                      width: columnWidths.title,
                      position: "relative",
                      paddingRight: "8px",
                      borderRight: "2px solid",
                      borderColor: "divider",
                    }}
                  >
                    Title
                    <Box
                      onMouseDown={(e) => handleResizeStart("title", e)}
                      sx={{
                        position: "absolute",
                        right: "-3px",
                        top: 0,
                        bottom: 0,
                        width: "6px",
                        cursor: "col-resize",
                        backgroundColor: "transparent",
                        "&:hover": {
                          backgroundColor: "primary.main",
                          opacity: 0.3,
                        },
                        "&:active": {
                          backgroundColor: "primary.main",
                          opacity: 0.5,
                        },
                      }}
                    />
                  </TableCell>
                  <TableCell
                    sx={{
                      fontWeight: 600,
                      width: columnWidths.description,
                      position: "relative",
                      paddingRight: "8px",
                      borderRight: "2px solid",
                      borderColor: "divider",
                    }}
                  >
                    Description
                    <Box
                      onMouseDown={(e) => handleResizeStart("description", e)}
                      sx={{
                        position: "absolute",
                        right: "-3px",
                        top: 0,
                        bottom: 0,
                        width: "6px",
                        cursor: "col-resize",
                        backgroundColor: "transparent",
                        "&:hover": {
                          backgroundColor: "primary.main",
                          opacity: 0.3,
                        },
                        "&:active": {
                          backgroundColor: "primary.main",
                          opacity: 0.5,
                        },
                      }}
                    />
                  </TableCell>
                  <TableCell
                    sx={{
                      fontWeight: 600,
                      width: columnWidths.language,
                      position: "relative",
                      paddingRight: "8px",
                      borderRight: "2px solid",
                      borderColor: "divider",
                    }}
                  >
                    Language
                    <Box
                      onMouseDown={(e) => handleResizeStart("language", e)}
                      sx={{
                        position: "absolute",
                        right: "-3px",
                        top: 0,
                        bottom: 0,
                        width: "6px",
                        cursor: "col-resize",
                        backgroundColor: "transparent",
                        "&:hover": {
                          backgroundColor: "primary.main",
                          opacity: 0.3,
                        },
                        "&:active": {
                          backgroundColor: "primary.main",
                          opacity: 0.5,
                        },
                      }}
                    />
                  </TableCell>
                  <TableCell
                    sx={{
                      fontWeight: 600,
                      width: columnWidths.type,
                      position: "relative",
                      paddingRight: "8px",
                      borderRight: "2px solid",
                      borderColor: "divider",
                    }}
                  >
                    Type
                    <Box
                      onMouseDown={(e) => handleResizeStart("type", e)}
                      sx={{
                        position: "absolute",
                        right: "-3px",
                        top: 0,
                        bottom: 0,
                        width: "6px",
                        cursor: "col-resize",
                        backgroundColor: "transparent",
                        "&:hover": {
                          backgroundColor: "primary.main",
                          opacity: 0.3,
                        },
                        "&:active": {
                          backgroundColor: "primary.main",
                          opacity: 0.5,
                        },
                      }}
                    />
                  </TableCell>
                  <TableCell
                    sx={{
                      fontWeight: 600,
                      width: columnWidths.theme,
                      position: "relative",
                      paddingRight: "8px",
                      borderRight: "2px solid",
                      borderColor: "divider",
                    }}
                  >
                    Theme
                    <Box
                      onMouseDown={(e) => handleResizeStart("theme", e)}
                      sx={{
                        position: "absolute",
                        right: "-3px",
                        top: 0,
                        bottom: 0,
                        width: "6px",
                        cursor: "col-resize",
                        backgroundColor: "transparent",
                        "&:hover": {
                          backgroundColor: "primary.main",
                          opacity: 0.3,
                        },
                        "&:active": {
                          backgroundColor: "primary.main",
                          opacity: 0.5,
                        },
                      }}
                    />
                  </TableCell>
                  <TableCell
                    sx={{
                      fontWeight: 600,
                      width: columnWidths.audio,
                      position: "relative",
                    }}
                  >
                    Audio
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {content.map((item, index) => (
                  <TableRow
                    key={item._id || index}
                    onClick={() => handleRowClick(item, index)}
                    sx={{
                      cursor: "pointer",
                      "&:hover": {
                        backgroundColor: "action.hover",
                      },
                    }}
                  >
                    <TableCell
                      sx={{
                        width: columnWidths.title,
                        borderRight: "2px solid",
                        borderColor: "divider",
                      }}
                    >
                      <Typography variant="body2" sx={{ fontWeight: 500 }}>
                        {formatContentTitle(item)}
                      </Typography>
                    </TableCell>
                    <TableCell
                      sx={{
                        width: columnWidths.description,
                        borderRight: "2px solid",
                        borderColor: "divider",
                      }}
                    >
                      <Typography
                        variant="body2"
                        color="text.secondary"
                        sx={{
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          display: "-webkit-box",
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: "vertical",
                        }}
                      >
                        {item.description || "—"}
                      </Typography>
                    </TableCell>
                    <TableCell
                      sx={{
                        width: columnWidths.language,
                        borderRight: "2px solid",
                        borderColor: "divider",
                      }}
                    >
                      {item.language ? (
                        <Chip
                          icon={<LanguageIcon />}
                          label={item.language}
                          size="small"
                          color="primary"
                          variant="outlined"
                        />
                      ) : (
                        <Typography variant="body2" color="text.secondary">
                          —
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell
                      sx={{
                        width: columnWidths.type,
                        borderRight: "2px solid",
                        borderColor: "divider",
                      }}
                    >
                      {item.type ? (
                        <Chip
                          icon={<CategoryIcon />}
                          label={item.type}
                          size="small"
                          color="secondary"
                          variant="outlined"
                        />
                      ) : (
                        <Typography variant="body2" color="text.secondary">
                          —
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell
                      sx={{
                        width: columnWidths.theme,
                        borderRight: "2px solid",
                        borderColor: "divider",
                      }}
                    >
                      <Typography variant="body2">
                        {item.theme ? formatTheme(item) : "—"}
                      </Typography>
                    </TableCell>
                    <TableCell sx={{ width: columnWidths.audio }}>
                      {item.audioUrl ? (
                        <Chip
                          icon={<PlayArrowIcon />}
                          label="Available"
                          size="small"
                          color="success"
                          variant="outlined"
                        />
                      ) : item.audioContent && Array.isArray(item.audioContent) && item.audioContent.length > 0 ? (
                        <Typography variant="body2" color="text.secondary">
                          {item.audioContent.length} segment{item.audioContent.length !== 1 ? "s" : ""}
                        </Typography>
                      ) : (
                        <Typography variant="body2" color="text.secondary">
                          —
                        </Typography>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>

          {pagination.hasMore && (
            <Box sx={{ display: "flex", justifyContent: "center", mt: 4, mb: 4 }}>
              <Button
                variant="outlined"
                onClick={handleLoadMore}
                disabled={loadingMore}
                startIcon={loadingMore ? <CircularProgress size={16} /> : <PlayArrowIcon />}
              >
                {loadingMore ? "Loading..." : "Load More"}
              </Button>
            </Box>
          )}

          {!pagination.hasMore && content.length > 0 && (
            <Box sx={{ textAlign: "center", py: 2 }}>
              <Typography variant="body2" color="text.secondary">
                All content loaded ({content.length} item{content.length !== 1 ? "s" : ""})
              </Typography>
            </Box>
          )}
        </>
      )}
    </PageContainer>
  );
};

export default ContentPlayback;
