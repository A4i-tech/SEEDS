import React, { useState, useRef, useEffect } from "react";
import { Box, Slider, Typography } from "@mui/material";
import { formatTimeWithLeadingZero } from "../../utils/formatTime";
import SpeedSelector from "./SpeedSelector";
import TransportControls from "./TransportControls";

const AudioPlayer = ({ audioUrl, onTimeUpdate, onEnded, autoPlay = false, variant = "dark" }) => {
  const isLight = variant === "light";
  const audioRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState(null);
  const [playbackRate, setPlaybackRate] = useState(1.0);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const updateTime = () => {
      setCurrentTime(audio.currentTime);
      if (onTimeUpdate) {
        onTimeUpdate(audio.currentTime);
      }
    };

    const updateDuration = () => {
      setDuration(audio.duration);
    };

    const handleLoadedMetadata = () => {
      setDuration(audio.duration);
      setIsLoading(false);
      if (autoPlay && audioUrl) {
        audio.play().catch((err) => {
          console.error("Auto-play failed:", err);
          setError("Auto-play was blocked. Please click play to start.");
        });
      }
    };

    const handleCanPlay = () => {
      setIsLoading(false);
    };

    const handleLoadStart = () => {
      setIsLoading(true);
    };

    const handlePlay = () => {
      setIsPlaying(true);
    };

    const handlePause = () => {
      setIsPlaying(false);
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
      if (onEnded) {
        onEnded();
      }
    };

    const handleError = (e) => {
      console.error("Audio error:", e);
      setIsLoading(false);
      setIsPlaying(false);
      setError("Failed to load audio. Please check your connection.");
    };

    audio.addEventListener("timeupdate", updateTime);
    audio.addEventListener("loadedmetadata", updateDuration);
    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("canplay", handleCanPlay);
    audio.addEventListener("loadstart", handleLoadStart);
    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("error", handleError);

    return () => {
      audio.removeEventListener("timeupdate", updateTime);
      audio.removeEventListener("loadedmetadata", updateDuration);
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("canplay", handleCanPlay);
      audio.removeEventListener("loadstart", handleLoadStart);
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("error", handleError);
    };
  }, [audioUrl, autoPlay, onTimeUpdate, onEnded]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !audioUrl) return;

    setIsLoading(true);
    setError(null);
    setCurrentTime(0);
    audio.src = audioUrl;
    audio.load();
  }, [audioUrl]);

  const togglePlayPause = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
    } else {
      audio.play().catch((err) => {
        console.error("Play failed:", err);
        setError("Failed to play audio");
      });
    }
  };

  const handleSeek = (event, newValue) => {
    const audio = audioRef.current;
    if (!audio) return;

    audio.currentTime = newValue;
    setCurrentTime(newValue);
  };

  const handleRewind = () => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = Math.max(0, audio.currentTime - 10);
  };

  const handleFastForward = () => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = Math.min(duration, audio.currentTime + 10);
  };

  const handleSpeedChange = (event) => {
    const audio = audioRef.current;
    if (!audio) return;
    const newRate = event.target.value;
    audio.playbackRate = newRate;
    setPlaybackRate(newRate);
  };

  return (
    <Box
      sx={{
        width: "100%",
        bgcolor: isLight ? "transparent" : "grey.800",
        border: isLight ? "1px solid" : "none",
        borderColor: isLight ? "divider" : "transparent",
        p: isLight ? 1.5 : 2,
        borderRadius: 2,
        mt: isLight ? 1 : 0,
      }}
    >
      <audio ref={audioRef} preload="metadata" />

      {error && (
        <Typography variant="caption" color="error" sx={{ mb: 1, display: "block" }}>
          {error}
        </Typography>
      )}

      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <TransportControls
          isPlaying={isPlaying}
          isLoading={isLoading}
          disabled={!audioUrl || isLoading}
          onPlayPause={togglePlayPause}
          onSeekBackward={handleRewind}
          onSeekForward={handleFastForward}
          variant={variant}
          size="medium"
        />

        <Typography
          variant="body2"
          sx={{
            color: isLight ? "text.secondary" : "white",
            minWidth: "40px",
            ml: 0.5,
            fontSize: "0.75rem",
          }}
        >
          {formatTimeWithLeadingZero(currentTime)}
        </Typography>

        <Slider
          value={currentTime}
          max={duration || 0}
          onChange={handleSeek}
          disabled={!audioUrl || isLoading || duration === 0}
          sx={{
            flex: 1,
            color: "primary.main",
            "& .MuiSlider-thumb": { color: "primary.main" },
            "& .MuiSlider-track": { color: "primary.main" },
            "& .MuiSlider-rail": { color: isLight ? "grey.300" : "grey.600" },
          }}
        />

        <Typography
          variant="body2"
          sx={{
            color: isLight ? "text.secondary" : "white",
            minWidth: "40px",
            ml: 0.5,
            fontSize: "0.75rem",
          }}
        >
          {formatTimeWithLeadingZero(duration)}
        </Typography>

        <SpeedSelector
          value={playbackRate}
          onChange={handleSpeedChange}
          disabled={!audioUrl || isLoading}
          variant={variant}
        />
      </Box>
    </Box>
  );
};

export default AudioPlayer;
