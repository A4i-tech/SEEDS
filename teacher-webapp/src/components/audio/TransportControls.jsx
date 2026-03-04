import React from "react";
import { IconButton, CircularProgress } from "@mui/material";
import {
  PlayArrow as PlayArrowIcon,
  Pause as PauseIcon,
  SkipPrevious as SkipPreviousIcon,
  SkipNext as SkipNextIcon,
} from "@mui/icons-material";

/**
 * TransportControls - reusable play/pause/seek buttons
 */
const TransportControls = ({
  isPlaying,
  isLoading,
  disabled = false,
  onPlayPause,
  onSeekBackward,
  onSeekForward,
  variant = "dark",
  size = "medium",
}) => {
  const isLight = variant === "light";

  return (
    <>
      <IconButton
        onClick={onSeekBackward}
        disabled={disabled}
        size={size === "large" ? "small" : "small"}
        sx={{ color: isLight ? "text.secondary" : "white" }}
        aria-label="Rewind 10 seconds"
      >
        <SkipPreviousIcon />
      </IconButton>

      <IconButton
        onClick={onPlayPause}
        disabled={disabled || isLoading}
        sx={{
          width: size === "large" ? 48 : 40,
          height: size === "large" ? 48 : 40,
          color: "white",
          bgcolor: size === "large" ? "#2e7d32" : "primary.main",
          "&:hover": { bgcolor: size === "large" ? "#1b5e20" : "primary.dark" },
          "&:disabled": { bgcolor: isLight ? "grey.300" : "grey.600", color: "grey.500" },
        }}
        aria-label={isPlaying ? "Pause" : "Play"}
      >
        {isLoading ? (
          <CircularProgress size={24} sx={{ color: "#fff" }} />
        ) : isPlaying ? (
          <PauseIcon sx={{ fontSize: size === "large" ? 28 : 24 }} />
        ) : (
          <PlayArrowIcon sx={{ fontSize: size === "large" ? 28 : 24 }} />
        )}
      </IconButton>

      <IconButton
        onClick={onSeekForward}
        disabled={disabled}
        size={size === "large" ? "small" : "small"}
        sx={{ color: isLight ? "text.secondary" : "white" }}
        aria-label="Forward 10 seconds"
      >
        <SkipNextIcon />
      </IconButton>
    </>
  );
};

export default TransportControls;
