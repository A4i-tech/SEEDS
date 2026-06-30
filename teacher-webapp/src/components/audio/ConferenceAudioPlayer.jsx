import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Box,
  Slider,
  Typography,
  Chip,
} from "@mui/material";
import {
  MusicNote as MusicNoteIcon,
} from "@mui/icons-material";
import {
  pauseAudio,
  resumeAudio,
  seekAudio,
  seekAudioAbsolute,
  setPlaybackSpeed as setPlaybackSpeedApi,
} from "../../services/apiService";
import { formatTime } from "../../utils/formatTime";
import SpeedSelector from "./SpeedSelector";
import TransportControls from "./TransportControls";

function parseDurationStr(str) {
  if (!str) return 0;
  // Handle numeric durations (already in seconds)
  if (typeof str === "number") return Number.isFinite(str) ? str : 0;
  // Handle string durations (M:SS or H:MM:SS format)
  const parts = String(str).split(":").map(Number);
  
  if (!parts.every(Number.isFinite)) return 0;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return 0;
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
  const serverSpeed = audioContentState?.speed || 1.0;

  const totalDuration =
    serverDuration != null && serverDuration > 0
      ? serverDuration
      : parseDurationStr(durationStr);

  const [estimatedPosition, setEstimatedPosition] = useState(0);
  const [isSeeking, setIsSeeking] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [pendingSpeed, setPendingSpeed] = useState(null);
  const timerRef = useRef(null);
  const prevStatusRef = useRef(status);
  const lastServerPosRef = useRef(null);

  // Clear optimistic speed once server confirms the new value via SSE
  useEffect(() => {
    if (pendingSpeed !== null && serverSpeed === pendingSpeed) {
      setPendingSpeed(null);
    }
  }, [serverSpeed, pendingSpeed]);

  const currentSpeed = pendingSpeed ?? serverSpeed;

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
    setPendingSpeed(newSpeed);
    try {
      await setPlaybackSpeedApi(confId, newSpeed);
    } catch (err) {
      console.error("Error setting playback speed:", err);
      setPendingSpeed(null);
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
        <TransportControls
          isPlaying={isPlaying}
          isLoading={actionLoading || isLoadingMusic || isStarting}
          disabled={!canControl || actionLoading || isLoadingMusic}
          onPlayPause={handlePlayPause}
          onSeekBackward={() => handleSkip(-10)}
          onSeekForward={() => handleSkip(10)}
          variant="light"
          size="large"
        />

        <SpeedSelector
          value={currentSpeed}
          onChange={handleSpeedChange}
          disabled={!canControl}
          variant="light"
          size="medium"
        />
      </Box>
    </Box>
  );
};

export default ConferenceAudioPlayer;
