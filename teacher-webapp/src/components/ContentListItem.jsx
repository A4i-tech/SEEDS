import React from "react";
import {
  Box,
  Typography,
  Chip,
  CircularProgress,
  LinearProgress,
} from "@mui/material";
import {
  MusicNote as MusicNoteIcon,
  MenuBook as MenuBookIcon,
  PlayArrow as PlayArrowIcon,
} from "@mui/icons-material";

/**
 * ContentListItem - renders individual content card in the library
 */
const ContentListItem = ({
  item,
  index,
  isLoading,
  conferenceActive,
  onPlay,
  color,
}) => {
  const isStory = item.type?.toLowerCase() === "story";

  return (
    <Box
      onClick={() => !isLoading && onPlay(item)}
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1.5,
        px: 2,
        py: 1.5,
        cursor: isLoading ? "wait" : "pointer",
        borderBottom: "1px solid",
        borderColor: "divider",
        position: "relative",
        transition: "background-color 0.15s",
        "&:hover": {
          backgroundColor: "action.hover",
        },
        opacity: isLoading ? 0.7 : 1,
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
        {isLoading ? (
          <CircularProgress size={22} sx={{ color: "#fff" }} />
        ) : isStory ? (
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
        {conferenceActive && !isLoading && (
          <PlayArrowIcon sx={{ color: "#2e7d32", fontSize: 20 }} />
        )}
      </Box>

      {/* Loading bar on the item */}
      {isLoading && (
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
};

export default ContentListItem;
