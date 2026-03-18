import React from "react";
import { Box, Typography, CircularProgress } from "@mui/material";
import {
  Pause as PauseIcon,
  VolumeUp as VolumeUpIcon,
  GraphicEq as GraphicEqIcon,
} from "@mui/icons-material";

/**
 * Formats seconds as M:SS
 */
function formatSeconds(totalSeconds) {
  if (totalSeconds == null || !isFinite(totalSeconds)) return "0:00";
  const mins = Math.floor(totalSeconds / 60);
  const secs = Math.floor(totalSeconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

/**
 * NowPlayingBanner - displays current streaming status in conference mode
 */
const NowPlayingBanner = ({ audioContentState }) => {
  const isPlaying = audioContentState?.status === "Playing";
  const isPaused = audioContentState?.status === "Paused";
  const isStarting = audioContentState?.status === "Starting";

  if (!isPlaying && !isPaused && !isStarting) {
    return null;
  }

  return (
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
  );
};

export default NowPlayingBanner;
