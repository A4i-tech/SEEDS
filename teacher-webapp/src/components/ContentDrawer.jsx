import React, { useState, useEffect, useMemo } from "react";
import {
  Box,
  Drawer,
  Typography,
  IconButton,
  InputBase,
  Paper,
  Chip,
  Divider,
  Alert,
  CircularProgress,
  Button,
  LinearProgress,
} from "@mui/material";
import {
  Close as CloseIcon,
  Search as SearchIcon,
  MusicNote as MusicNoteIcon,
  MenuBook as MenuBookIcon,
  PlayArrow as PlayArrowIcon,
  Pause as PauseIcon,
  VolumeUp as VolumeUpIcon,
  GraphicEq as GraphicEqIcon,
} from "@mui/icons-material";
import { getContent, getContentById, getContentSasUrl } from "../services/contentService";
import AudioPlayer from "./audio/AudioPlayer";
import { showToast } from "../utils/toast";
import { saveContentToHistory } from "../services/contentHistoryService";

const DRAWER_WIDTH = 440;

const ITEM_COLORS = [
  "#7E57C2",
  "#26A69A",
  "#EF5350",
  "#42A5F5",
  "#FFA726",
  "#66BB6A",
  "#AB47BC",
  "#29B6F6",
  "#EC407A",
  "#26C6DA",
];

/**
 * ContentDrawer — dual-mode content browser.
 *
 * Outside conference (no onPlay): clicking an item loads its SAS URL and plays
 * it locally in a "Now Playing" footer via the AudioPlayer component.
 *
 * Inside conference (onPlay provided): clicking an item resolves its SAS URL
 * and passes a metadata object { url, title, durationStr, type } to onPlay
 * so the caller can stream it into the active conference and display a
 * conference media player.
 */
const ContentDrawer = ({
  open,
  onClose,
  onPlay,
  audioContentState,
  conferenceActive = false,
}) => {
  const [content, setContent] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [pagination, setPagination] = useState({ nextCursor: null, hasMore: false });
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("all");

  const [selectedItem, setSelectedItem] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);
  const [loadingAudio, setLoadingAudio] = useState(false);
  const [loadingItemId, setLoadingItemId] = useState(null);

  useEffect(() => {
    if (open) {
      setContent([]);
      setSearchQuery("");
      setActiveTab("all");
      setSelectedItem(null);
      setAudioUrl(null);
      setLoadingItemId(null);
      fetchContent();
    }
  }, [open]);

  const fetchContent = async (cursor = null) => {
    try {
      if (cursor) {
        setLoadingMore(true);
      } else {
        setLoading(true);
        setError(null);
      }
      const response = await getContent({ limit: 15, cursor });
      if (cursor) {
        setContent((prev) => [...prev, ...response.data]);
      } else {
        setContent(response.data);
      }
      setPagination({
        nextCursor: response.pagination?.nextCursor || null,
        hasMore: response.pagination?.hasMore || false,
      });
    } catch (err) {
      setError("Failed to load content. Please try again.");
      showToast.error("Failed to load content");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  const handleItemPlay = async (item) => {
    if (loadingItemId) return;
    if (!onPlay && selectedItem?._id === item._id) return;

    setLoadingItemId(item._id);
    setSelectedItem(item);
    setAudioUrl(null);
    setLoadingAudio(true);
    try {
      const fullItem = await getContentById(item._id);
      const audioSource =
        fullItem.audioContent?.[0]?.audioUrl ||
        fullItem.title?.audioUrl ||
        fullItem.theme?.audioUrl ||
        null;

      if (!audioSource) {
        showToast.error("No audio available for this content");
        return;
      }

      const sasUrl = await getContentSasUrl(audioSource);
      const title = item.title?.english || item.title?.local || "Untitled";

      // Track in content history
      try {
        saveContentToHistory({
          id: item._id,
          name: title,
          type: item.type,
          language: item.language,
          url: sasUrl,
        }, { wasConference: conferenceActive });
      } catch (_) {
        // Non-critical
      }

      if (onPlay) {
        onPlay({
          url: sasUrl,
          title,
          durationStr: item.duration || fullItem.duration || null,
          type: item.type,
        });
        onClose();
      } else {
        setAudioUrl(sasUrl);
      }
    } catch (err) {
      console.error("Error loading audio:", err);
      showToast.error("Failed to load audio for playback");
    } finally {
      setLoadingItemId(null);
      setLoadingAudio(false);
    }
  };

  // Derive filter tabs from fetched content types
  const availableTabs = useMemo(() => {
    const types = [
      ...new Set(content.map((item) => item.type?.toLowerCase()).filter(Boolean)),
    ];
    return ["all", ...types];
  }, [content]);

  useEffect(() => {
    if (activeTab !== "all" && !availableTabs.includes(activeTab)) {
      setActiveTab("all");
    }
  }, [availableTabs, activeTab]);

  // Client-side search + tab filter
  const filteredContent = content.filter((item) => {
    const matchesTab = activeTab === "all" || item.type?.toLowerCase() === activeTab;
    const query = searchQuery.toLowerCase();
    const matchesSearch =
      !query ||
      item.title?.english?.toLowerCase().includes(query) ||
      item.title?.local?.toLowerCase().includes(query);
    return matchesTab && matchesSearch;
  });

  const getItemColor = (index) => ITEM_COLORS[index % ITEM_COLORS.length];

  const isStory = (item) => item.type?.toLowerCase() === "story";

  // Determine playback status from conference state
  const isPlaying = audioContentState?.status === "Playing";
  const isPaused = audioContentState?.status === "Paused";
  const isStarting = audioContentState?.status === "Starting";
  const isStreaming = isPlaying || isPaused || isStarting;

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      PaperProps={{
        sx: {
          width: DRAWER_WIDTH,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        },
      }}
    >
      {/* Header */}
      <Box
        sx={{
          px: 2.5,
          pt: 2.5,
          pb: 1.5,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background: "linear-gradient(135deg, #1a237e 0%, #283593 100%)",
          color: "#fff",
        }}
      >
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
            Content Library
          </Typography>
          <Typography variant="caption" sx={{ opacity: 0.8 }}>
            {loading
              ? "Loading..."
              : `${content.length} item${content.length !== 1 ? "s" : ""} available`}
            {conferenceActive && " \u00B7 Conference mode"}
          </Typography>
        </Box>
        <IconButton onClick={onClose} size="small" sx={{ color: "#fff" }}>
          <CloseIcon />
        </IconButton>
      </Box>

      {/* Conference streaming banner */}
      {conferenceActive && isStreaming && (
        <Box
          sx={{
            px: 2,
            py: 1.25,
            display: "flex",
            alignItems: "center",
            gap: 1.5,
            bgcolor: isPlaying ? "#e8f5e9" : isPaused ? "#fff3e0" : "#e3f2fd",
            borderBottom: "1px solid",
            borderColor: "divider",
          }}
        >
          {isPlaying ? (
            <GraphicEqIcon sx={{ color: "#2e7d32", fontSize: 22 }} />
          ) : isPaused ? (
            <PauseIcon sx={{ color: "#e65100", fontSize: 22 }} />
          ) : (
            <CircularProgress size={18} />
          )}
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="body2" sx={{ fontWeight: 600, fontSize: "0.8rem" }}>
              {isPlaying
                ? "Streaming to participants"
                : isPaused
                  ? "Paused"
                  : "Starting playback..."}
            </Typography>
            {audioContentState?.position_seconds != null && (
              <Typography variant="caption" color="text.secondary">
                {formatSeconds(audioContentState.position_seconds)} elapsed
              </Typography>
            )}
          </Box>
          <VolumeUpIcon
            sx={{
              color: isPlaying ? "#2e7d32" : "text.disabled",
              fontSize: 20,
              animation: isPlaying ? "pulse 1.5s infinite" : "none",
              "@keyframes pulse": {
                "0%, 100%": { opacity: 1 },
                "50%": { opacity: 0.4 },
              },
            }}
          />
        </Box>
      )}

      {/* Search */}
      <Box sx={{ px: 2, py: 1.5 }}>
        <Paper
          variant="outlined"
          sx={{
            display: "flex",
            alignItems: "center",
            px: 1.5,
            py: 0.75,
            borderRadius: 3,
            backgroundColor: "grey.50",
          }}
        >
          <SearchIcon sx={{ color: "text.disabled", mr: 1, fontSize: 20 }} />
          <InputBase
            placeholder="Search songs, stories..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            sx={{ flex: 1, fontSize: "0.875rem" }}
          />
        </Paper>
      </Box>

      {/* Filter tabs */}
      <Box sx={{ px: 2, pb: 1.5, display: "flex", gap: 1, flexWrap: "wrap" }}>
        {availableTabs.map((tab) => (
          <Chip
            key={tab}
            label={tab.charAt(0).toUpperCase() + tab.slice(1)}
            onClick={() => setActiveTab(tab)}
            variant={activeTab === tab ? "filled" : "outlined"}
            color={activeTab === tab ? "primary" : "default"}
            icon={
              tab === "song" ? (
                <MusicNoteIcon style={{ fontSize: 14 }} />
              ) : tab === "story" ? (
                <MenuBookIcon style={{ fontSize: 14 }} />
              ) : undefined
            }
            sx={{ borderRadius: 3, fontWeight: activeTab === tab ? 600 : 400 }}
          />
        ))}
      </Box>

      <Divider />

      {/* Content list */}
      <Box sx={{ flex: 1, overflowY: "auto", px: 0 }}>
        {loading && (
          <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
            <CircularProgress />
          </Box>
        )}

        {error && (
          <Box sx={{ px: 2, pt: 2 }}>
            <Alert severity="error">{error}</Alert>
          </Box>
        )}

        {!loading && !error && filteredContent.length === 0 && (
          <Box sx={{ px: 2, pt: 4, textAlign: "center" }}>
            <Typography variant="body2" color="text.secondary">
              {searchQuery || activeTab !== "all"
                ? "No content matches your search."
                : "No content available."}
            </Typography>
          </Box>
        )}

        {filteredContent.map((item, index) => {
          const isItemLoading = loadingItemId === item._id;
          const color = getItemColor(index);

          return (
            <Box
              key={item._id || index}
              onClick={() => !isItemLoading && handleItemPlay(item)}
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1.5,
                px: 2,
                py: 1.5,
                cursor: isItemLoading ? "wait" : "pointer",
                borderBottom: "1px solid",
                borderColor: "divider",
                position: "relative",
                transition: "background-color 0.15s",
                "&:hover": {
                  backgroundColor: "action.hover",
                },
                opacity: isItemLoading ? 0.7 : 1,
              }}
            >
              {/* Color icon */}
              <Box
                sx={{
                  width: 48,
                  height: 48,
                  borderRadius: "12px",
                  bgcolor: color,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  position: "relative",
                }}
              >
                {isItemLoading ? (
                  <CircularProgress size={22} sx={{ color: "#fff" }} />
                ) : isStory(item) ? (
                  <MenuBookIcon sx={{ color: "#fff", fontSize: 22 }} />
                ) : (
                  <MusicNoteIcon sx={{ color: "#fff", fontSize: 22 }} />
                )}
              </Box>

              {/* Content info */}
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography
                  variant="body2"
                  sx={{
                    fontWeight: 600,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {item.title?.english || item.title?.local || "Untitled"}
                </Typography>
                {item.title?.local && item.title?.english !== item.title?.local && (
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{
                      display: "block",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {item.title.local}
                  </Typography>
                )}
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 0.5,
                    mt: 0.25,
                    flexWrap: "wrap",
                  }}
                >
                  {item.type && (
                    <Chip
                      label={item.type.toUpperCase()}
                      size="small"
                      sx={{
                        height: 18,
                        fontSize: "0.65rem",
                        fontWeight: 700,
                        borderRadius: 1,
                        bgcolor: color,
                        color: "#fff",
                      }}
                    />
                  )}
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ fontSize: "0.7rem" }}
                  >
                    {[item.language, typeof item.theme === "string" ? item.theme : item.theme?.english]
                      .filter(Boolean)
                      .join(" \u00B7 ")}
                  </Typography>
                </Box>
              </Box>

              {/* Duration + play indicator */}
              <Box
                sx={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "flex-end",
                  gap: 0.25,
                  flexShrink: 0,
                }}
              >
                {item.duration && (
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ fontSize: "0.8rem" }}
                  >
                    {item.duration}
                  </Typography>
                )}
                {conferenceActive && !isItemLoading && (
                  <PlayArrowIcon sx={{ color: "#2e7d32", fontSize: 20 }} />
                )}
              </Box>

              {/* Loading bar on the item */}
              {isItemLoading && (
                <LinearProgress
                  sx={{
                    position: "absolute",
                    bottom: 0,
                    left: 0,
                    right: 0,
                    height: 2,
                  }}
                />
              )}
            </Box>
          );
        })}

        {/* Load more */}
        {pagination.hasMore && (
          <Box sx={{ display: "flex", justifyContent: "center", py: 2 }}>
            <Button
              variant="outlined"
              size="small"
              onClick={() => fetchContent(pagination.nextCursor)}
              disabled={loadingMore}
              startIcon={loadingMore ? <CircularProgress size={14} /> : null}
            >
              {loadingMore ? "Loading..." : "Load more"}
            </Button>
          </Box>
        )}
      </Box>

      {/* Local preview: Now Playing footer */}
      {!onPlay && selectedItem && (
        <>
          <Divider />
          <Box sx={{ px: 2, pt: 1.5, pb: 2, backgroundColor: "grey.50" }}>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}
            >
              Now Playing
            </Typography>
            <Typography
              variant="body2"
              sx={{ fontWeight: 600, mt: 0.25, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
            >
              {selectedItem.title?.english || selectedItem.title?.local || "Untitled"}
            </Typography>

            {loadingAudio ? (
              <Box sx={{ display: "flex", justifyContent: "center", py: 1.5 }}>
                <CircularProgress size={24} />
              </Box>
            ) : audioUrl ? (
              <AudioPlayer audioUrl={audioUrl} autoPlay variant="light" />
            ) : (
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
                No audio available for this content.
              </Typography>
            )}
          </Box>
        </>
      )}

      {/* Conference mode footer */}
      {conferenceActive && (
        <>
          <Divider />
          <Box
            sx={{
              px: 2,
              py: 1.5,
              bgcolor: "grey.50",
              display: "flex",
              alignItems: "center",
              gap: 1,
            }}
          >
            <VolumeUpIcon sx={{ color: "text.secondary", fontSize: 18 }} />
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: "0.75rem" }}>
              Select content to stream to all conference participants
            </Typography>
          </Box>
        </>
      )}
    </Drawer>
  );
};

function formatSeconds(totalSeconds) {
  if (totalSeconds == null || !isFinite(totalSeconds)) return "0:00";
  const mins = Math.floor(totalSeconds / 60);
  const secs = Math.floor(totalSeconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export default ContentDrawer;
