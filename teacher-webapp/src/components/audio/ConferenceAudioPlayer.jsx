import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Box,
  IconButton,
  Slider,
  Typography,
  CircularProgress,
  Chip,
  Select,
  MenuItem,
} from "@mui/material";
import {
  PlayArrow as PlayArrowIcon,
  Pause as PauseIcon,
  SkipPrevious as SkipPreviousIcon,
  SkipNext as SkipNextIcon,
  MusicNote as MusicNoteIcon,
} from "@mui/icons-material";
import {
  pauseAudio,
  resumeAudio,
  seekAudio,
  seekAudioAbsolute,
  setPlaybackSpeed as setPlaybackSpeedApi,
} from "../../services/apiService";

const SPEED_OPTIONS = [0.75, 1.0, 1.25, 1.5, 2.0];

function parseDurationStr(str) {
  if (!str) return 0;
  const parts = str.split(":").map(Number);
  if (parts.length === 2) return (parts[0] || 0) * 60 + (parts[1] || 0);
  if (parts.length === 3)
    return (parts[0] || 0) * 3600 + (parts[1] || 0) * 60 + (parts[2] || 0);
  return 0;
}

function formatTime(seconds) {
  if (!isFinite(seconds) || isNaN(seconds) || seconds < 0) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

/**
 * ConferenceAudioPlayer — media player bar for controlling conference audio.
 *
 * Position and duration are sourced from the server via SSE (audioContentState).
 * A client-side timer provides smooth 1-second interpolation between updates.
 * The seek slider uses absolute-position seek for accuracy.
 */
const ConferenceAudioPlayer = ({
  trackTitle,
  trackLocal,
  trackType,
  durationStr,
  audioContentState,
  confId,
  isLoadingMusic,
}) => {
  const status = audioContentState?.status;
  const serverPosition = audioContentState?.position_seconds;
  const serverDuration = audioContentState?.duration_seconds;
  const currentSpeed = audioContentState?.speed || 1.0;

  const totalDuration =
    serverDuration != null && serverDuration > 0
      ? serverDuration
      : parseDurationStr(durationStr);

  const [estimatedPosition, setEstimatedPosition] = useState(0);
  const [isSeeking, setIsSeeking] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const timerRef = useRef(null);
  const prevStatusRef = useRef(status);
  const lastServerPosRef = useRef(null);

  // Sync position from server whenever it changes
  useEffect(() => {
    if (serverPosition != null && !isSeeking && serverPosition !== lastServerPosRef.current) {
      lastServerPosRef.current = serverPosition;
      setEstimatedPosition(serverPosition);
    }
  }, [serverPosition, isSeeking]);

  // Reset position when a new track starts
  useEffect(() => {
    if (status === "Starting" && prevStatusRef.current !== "Starting") {
      setEstimatedPosition(0);
      lastServerPosRef.current = null;
    }
    prevStatusRef.current = status;
  }, [status]);

  // Client-side interpolation: tick every second while "Playing", scaled by speed
  useEffect(() => {
    if (status === "Playing" && !isSeeking) {
      timerRef.current = setInterval(() => {
        setEstimatedPosition((prev) => {
          const next = prev + currentSpeed;
          return totalDuration > 0 ? Math.min(next, totalDuration) : next;
        });
      }, 1000);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [status, isSeeking, totalDuration, currentSpeed]);

  const handlePlayPause = useCallback(async () => {
    if (!confId || actionLoading) return;
    setActionLoading(true);
    try {
      if (status === "Playing") {
        await pauseAudio(confId);
      } else if (status === "Paused") {
        await resumeAudio(confId);
      }
    } catch (err) {
      console.error("Error toggling playback:", err);
    } finally {
      setActionLoading(false);
    }
  }, [confId, status, actionLoading]);

  const handleSkip = useCallback(
    async (deltaSeconds) => {
      if (!confId) return;
      try {
        await seekAudio(confId, deltaSeconds);
        setEstimatedPosition((prev) => {
          const next = prev + deltaSeconds;
          if (totalDuration > 0) return Math.max(0, Math.min(next, totalDuration));
          return Math.max(0, next);
        });
      } catch (err) {
        console.error("Error seeking audio:", err);
      }
    },
    [confId, totalDuration]
  );

  const handleSliderChange = (_event, newValue) => {
    setIsSeeking(true);
    setEstimatedPosition(newValue);
  };

  const handleSliderCommit = async (_event, newValue) => {
    setIsSeeking(false);
    try {
      await seekAudioAbsolute(confId, newValue);
      setEstimatedPosition(newValue);
    } catch (err) {
      console.error("Error seeking audio:", err);
    }
  };

  const isActive = status === "Playing" || status === "Paused" || status === "Starting";
  const isStarting = status === "Starting";
  const isPlaying = status === "Playing";
  const canControl = isActive && !isStarting && Boolean(confId);

  const handleSpeedChange = useCallback(async (event) => {
    if (!confId) return;
    const newSpeed = event.target.value;
    try {
      await setPlaybackSpeedApi(confId, newSpeed);
    } catch (err) {
      console.error("Error setting playback speed:", err);
    }
  }, [confId]);

  if (!isActive) return null;

  return (
    <Box
      sx={{
        width: "100%",
        bgcolor: "#fff",
        border: "1px solid",
        borderColor: "divider",
        borderRadius: 3,
        p: 2,
        mt: 2,
      }}
    >
      {/* Track info row */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 1.5 }}>
        <Box
          sx={{
            width: 44,
            height: 44,
            borderRadius: "10px",
            bgcolor: "#7E57C2",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <MusicNoteIcon sx={{ color: "#fff", fontSize: 22 }} />
        </Box>
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
            {trackTitle || "Unknown Track"}
          </Typography>
          {trackLocal && trackLocal !== trackTitle && (
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
            >
              {trackLocal}
            </Typography>
          )}
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, mt: 0.25 }}>
            {trackType && (
              <Chip
                label={trackType.toUpperCase()}
                size="small"
                sx={{
                  height: 18,
                  fontSize: "0.65rem",
                  fontWeight: 700,
                  borderRadius: 1,
                  bgcolor: "#7E57C2",
                  color: "#fff",
                }}
              />
            )}
          </Box>
        </Box>
      </Box>

      {/* Slider */}
      <Box sx={{ px: 0.5 }}>
        <Slider
          value={estimatedPosition}
          max={totalDuration || 1}
          onChange={handleSliderChange}
          onChangeCommitted={handleSliderCommit}
          disabled={!canControl || totalDuration === 0}
          sx={{
            color: "#2e7d32",
            height: 4,
            "& .MuiSlider-thumb": {
              width: 14,
              height: 14,
              bgcolor: "#2e7d32",
              "&:hover, &.Mui-focusVisible": { boxShadow: "0 0 0 6px rgba(46,125,50,0.16)" },
            },
            "& .MuiSlider-track": { bgcolor: "#2e7d32" },
            "& .MuiSlider-rail": { bgcolor: "grey.300" },
          }}
        />
        <Box sx={{ display: "flex", justifyContent: "space-between", mt: -0.5 }}>
          <Typography variant="caption" color="text.secondary" sx={{ fontSize: "0.75rem" }}>
            {formatTime(estimatedPosition)}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ fontSize: "0.75rem" }}>
            {totalDuration > 0 ? formatTime(totalDuration) : "--:--"}
          </Typography>
        </Box>
      </Box>

      {/* Controls row */}
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 1.5, mt: 0.5 }}>
        <IconButton
          onClick={() => handleSkip(-10)}
          disabled={!canControl}
          size="small"
          sx={{ color: "text.secondary" }}
          aria-label="Rewind 10 seconds"
        >
          <SkipPreviousIcon />
        </IconButton>

        <IconButton
          onClick={handlePlayPause}
          disabled={!canControl || actionLoading || isLoadingMusic}
          sx={{
            width: 48,
            height: 48,
            color: "#fff",
            bgcolor: "#2e7d32",
            "&:hover": { bgcolor: "#1b5e20" },
            "&:disabled": { bgcolor: "grey.300", color: "grey.500" },
          }}
          aria-label={isPlaying ? "Pause" : "Resume"}
        >
          {actionLoading || isLoadingMusic || isStarting ? (
            <CircularProgress size={24} sx={{ color: "#fff" }} />
          ) : isPlaying ? (
            <PauseIcon sx={{ fontSize: 28 }} />
          ) : (
            <PlayArrowIcon sx={{ fontSize: 28 }} />
          )}
        </IconButton>

        <IconButton
          onClick={() => handleSkip(10)}
          disabled={!canControl}
          size="small"
          sx={{ color: "text.secondary" }}
          aria-label="Forward 10 seconds"
        >
          <SkipNextIcon />
        </IconButton>

        <Select
          value={currentSpeed}
          onChange={handleSpeedChange}
          disabled={!canControl}
          size="small"
          variant="outlined"
          sx={{
            ml: 1,
            minWidth: 64,
            height: 32,
            fontWeight: 700,
            fontSize: "0.75rem",
            "& .MuiSelect-select": { py: 0.5, px: 1 },
            "& .MuiOutlinedInput-notchedOutline": {
              borderColor: currentSpeed !== 1.0 ? "#2e7d32" : "grey.400",
            },
            "&:hover .MuiOutlinedInput-notchedOutline": {
              borderColor: "#2e7d32",
            },
          }}
          aria-label="Playback speed"
        >
          {SPEED_OPTIONS.map((opt) => (
            <MenuItem key={opt} value={opt} sx={{ fontSize: "0.8rem" }}>
              {opt}x
            </MenuItem>
          ))}
        </Select>
      </Box>
    </Box>
  );
};

export default ConferenceAudioPlayer;
