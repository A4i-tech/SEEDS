import React, { useState, useEffect, useMemo } from "react";
import {
  Box,
  Drawer,
  Typography,
  IconButton,
  Divider,
  Alert,
  CircularProgress,
  Button,
} from "@mui/material";
import {
  Close as CloseIcon,
  VolumeUp as VolumeUpIcon,
} from "@mui/icons-material";
import { getContent, getContentById, getContentSasUrl } from "../services/contentService";
import { showToast } from "../utils/toast";
import { saveContentToHistory } from "../services/contentHistoryService";
import ContentSearchBar from "./ContentSearchBar";
import ContentListItem from "./ContentListItem";
import NowPlayingBanner from "./NowPlayingBanner";
import NowPlayingFooter from "./NowPlayingFooter";

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
      {conferenceActive && (
        <NowPlayingBanner audioContentState={audioContentState} />
      )}

      {/* Search and filters */}
      <ContentSearchBar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        availableTabs={availableTabs}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />

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

        {filteredContent.map((item, index) => (
          <ContentListItem
            key={item._id || index}
            item={item}
            index={index}
            isLoading={loadingItemId === item._id}
            conferenceActive={conferenceActive}
            onPlay={handleItemPlay}
            color={getItemColor(index)}
          />
        ))}

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
      {!onPlay && (
        <NowPlayingFooter
          selectedItem={selectedItem}
          audioUrl={audioUrl}
          loadingAudio={loadingAudio}
        />
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

export default ContentDrawer;
