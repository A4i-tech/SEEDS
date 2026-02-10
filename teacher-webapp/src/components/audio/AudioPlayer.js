import React, { useState, useRef, useEffect } from "react";
import {
  Box,
  IconButton,
  Slider,
  Typography,
  CircularProgress,
} from "@mui/material";
import {
  PlayArrow as PlayArrowIcon,
  Pause as PauseIcon,
  SkipPrevious as SkipPreviousIcon,
  SkipNext as SkipNextIcon,
} from "@mui/icons-material";

const AudioPlayer = ({ audioUrl, onTimeUpdate, onEnded, autoPlay = false }) => {
  const audioRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState(null);

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

  const formatTime = (seconds) => {
    if (!isFinite(seconds) || isNaN(seconds)) return "00:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
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

  return (
    <Box
      sx={{
        width: "100%",
        bgcolor: "grey.800",
        p: 2,
        borderRadius: 1,
      }}
    >
      <audio ref={audioRef} preload="metadata" />
      
      {error && (
        <Typography variant="caption" color="error" sx={{ mb: 1, display: "block" }}>
          {error}
        </Typography>
      )}

      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
        <IconButton
          onClick={handleRewind}
          disabled={!audioUrl || isLoading}
          sx={{ color: "white" }}
          size="small"
        >
          <SkipPreviousIcon />
        </IconButton>

        <IconButton
          onClick={togglePlayPause}
          disabled={!audioUrl || isLoading}
          sx={{
            color: "white",
            bgcolor: "primary.main",
            "&:hover": {
              bgcolor: "primary.dark",
            },
            "&:disabled": {
              bgcolor: "grey.600",
            },
          }}
          size="large"
        >
          {isLoading ? (
            <CircularProgress size={24} sx={{ color: "white" }} />
          ) : isPlaying ? (
            <PauseIcon />
          ) : (
            <PlayArrowIcon />
          )}
        </IconButton>

        <IconButton
          onClick={handleFastForward}
          disabled={!audioUrl || isLoading}
          sx={{ color: "white" }}
          size="small"
        >
          <SkipNextIcon />
        </IconButton>

        <Typography variant="body2" sx={{ color: "white", minWidth: "45px", ml: 1 }}>
          {formatTime(currentTime)}
        </Typography>

        <Slider
          value={currentTime}
          max={duration || 0}
          onChange={handleSeek}
          disabled={!audioUrl || isLoading || duration === 0}
          sx={{
            flex: 1,
            color: "primary.main",
            "& .MuiSlider-thumb": {
              color: "primary.main",
            },
            "& .MuiSlider-track": {
              color: "primary.main",
            },
            "& .MuiSlider-rail": {
              color: "grey.600",
            },
          }}
        />

        <Typography variant="body2" sx={{ color: "white", minWidth: "45px", mr: 1 }}>
          {formatTime(duration)}
        </Typography>
      </Box>
    </Box>
  );
};

export default AudioPlayer;
