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
} from "@mui/material";
import {
  Close as CloseIcon,
  Search as SearchIcon,
  MusicNote as MusicNoteIcon,
  MenuBook as MenuBookIcon,
} from "@mui/icons-material";
import { getContent, getContentById, getContentSasUrl } from "../services/contentService";
import AudioPlayer from "./audio/AudioPlayer";
import { showToast } from "../utils/toast";

const ICON_COLORS = [
  { bg: "linear-gradient(135deg, #667eea, #764ba2)" },
  { bg: "linear-gradient(135deg, #11998e, #38ef7d)" },
  { bg: "linear-gradient(135deg, #f7971e, #ffd200)" },
  { bg: "linear-gradient(135deg, #2193b0, #6dd5ed)" },
  { bg: "linear-gradient(135deg, #ee0979, #ff6a00)" },
  { bg: "linear-gradient(135deg, #56ab2f, #a8e063)" },
];

const DRAWER_WIDTH = 440;

const ContentLibraryDrawer = ({ open, onClose, onPlay }) => {
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

  useEffect(() => {
    if (open) {
      setContent([]);
      setSelectedItem(null);
      setAudioUrl(null);
      setSearchQuery("");
      setActiveTab("all");
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

  const handleItemClick = async (item) => {
    if (selectedItem?._id === item._id) return;
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
      if (audioSource) {
        const sasResult = await getContentSasUrl(audioSource);
        if (onPlay) {
          onPlay(sasResult);
          onClose();
          return;
        }
        setAudioUrl(sasResult);
      }
    } catch (err) {
      showToast.error("Failed to load audio");
    } finally {
      setLoadingAudio(false);
    }
  };

  const availableTabs = useMemo(() => {
    const types = [...new Set(content.map((item) => item.type?.toLowerCase()).filter(Boolean))];
    return ["all", ...types];
  }, [content]);

  // Reset active tab if it no longer exists in the fetched data
  useEffect(() => {
    if (activeTab !== "all" && !availableTabs.includes(activeTab)) {
      setActiveTab("all");
    }
  }, [availableTabs, activeTab]);

  const filteredContent = content.filter((item) => {
    const matchesTab =
      activeTab === "all" || item.type?.toLowerCase() === activeTab;
    const query = searchQuery.toLowerCase();
    const matchesSearch =
      !query ||
      item.title?.english?.toLowerCase().includes(query) ||
      item.title?.local?.toLowerCase().includes(query);
    return matchesTab && matchesSearch;
  });

  const getItemIcon = (item, index) => {
    const isStory = item.type?.toLowerCase() === "story";
    const color = ICON_COLORS[index % ICON_COLORS.length];
    return (
      <Box
        sx={{
          width: 48,
          height: 48,
          borderRadius: "12px",
          background: color.bg,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        {isStory ? (
          <MenuBookIcon sx={{ color: "#fff", fontSize: 22 }} />
        ) : (
          <MusicNoteIcon sx={{ color: "#fff", fontSize: 22 }} />
        )}
      </Box>
    );
  };

  const getTypeChipColor = (type) => {
    if (type?.toLowerCase() === "story") return "success";
    return "secondary";
  };

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
        }}
      >
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
            Content Library
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {loading ? "Loading…" : `${content.length} item${content.length !== 1 ? "s" : ""}`}
          </Typography>
        </Box>
        <IconButton onClick={onClose} size="small">
          <CloseIcon />
        </IconButton>
      </Box>

      {/* Search */}
      <Box sx={{ px: 2, pb: 1.5 }}>
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
          const isSelected = selectedItem?._id === item._id;
          return (
            <Box
              key={item._id || index}
              onClick={() => handleItemClick(item)}
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1.5,
                px: 2,
                py: 1.5,
                cursor: "pointer",
                borderBottom: "1px solid",
                borderColor: "divider",
                backgroundColor: isSelected ? "action.selected" : "transparent",
                "&:hover": { backgroundColor: isSelected ? "action.selected" : "action.hover" },
              }}
            >
              {getItemIcon(item, index)}

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
                    sx={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                  >
                    {item.title.local}
                  </Typography>
                )}
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, mt: 0.25, flexWrap: "wrap" }}>
                  {item.type && (
                    <Chip
                      label={item.type.toUpperCase()}
                      size="small"
                      color={getTypeChipColor(item.type)}
                      sx={{ height: 18, fontSize: "0.65rem", fontWeight: 700, borderRadius: 1 }}
                    />
                  )}
                  <Typography variant="caption" color="text.secondary" sx={{ fontSize: "0.7rem" }}>
                    {[item.language, item.theme?.english || item.theme]
                      .filter(Boolean)
                      .join(" · ")}
                  </Typography>
                </Box>
              </Box>

              {item.duration && (
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ flexShrink: 0, fontSize: "0.8rem" }}
                >
                  {item.duration}
                </Typography>
              )}
            </Box>
          );
        })}

        {pagination.hasMore && (
          <Box sx={{ display: "flex", justifyContent: "center", py: 2 }}>
            <Button
              variant="outlined"
              size="small"
              onClick={() => fetchContent(pagination.nextCursor)}
              disabled={loadingMore}
              startIcon={loadingMore ? <CircularProgress size={14} /> : null}
            >
              {loadingMore ? "Loading…" : "Load more"}
            </Button>
          </Box>
        )}
      </Box>

      {/* Now Playing */}
      {selectedItem && (
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
    </Drawer>
  );
};

export default ContentLibraryDrawer;
