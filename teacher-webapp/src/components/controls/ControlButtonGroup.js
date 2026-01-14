import React from "react";
import { Box, Button, CircularProgress } from "@mui/material";
import {
  Phone as PhoneIcon,
  PhoneDisabled as PhoneDisabledIcon,
  PersonAdd as PersonAddIcon,
  MusicNote as MusicNoteIcon,
  Pause as PauseIcon,
} from "@mui/icons-material";

export const ControlButtonGroup = ({
  isConfCallRunning,
  isLoadingCall,
  isSinkingConf,
  isLoadingMusic,
  isPlayingAudio,
  isPausedAudio,
  isStartingAudio,
  onStartCall,
  onEndCall,
  onSinkConf,
  onAddParticipant,
  onMusicControl,
  disabled,
}) => {
  return (
    <Box
      sx={{
        display: "flex",
        gap: 2,
        flexWrap: "wrap",
        justifyContent: "center",
        mt: 3,
      }}
    >
      <Button
        variant="contained"
        startIcon={
          isLoadingCall ? (
            <CircularProgress size={20} color="inherit" />
          ) : isConfCallRunning ? (
            <PhoneDisabledIcon />
          ) : (
            <PhoneIcon />
          )
        }
        onClick={isConfCallRunning ? onEndCall : onStartCall}
        disabled={isLoadingCall}
        sx={{
          bgcolor: "#2e7d32",
          color: "#ffffff",
          "&:hover": {
            bgcolor: "#1b5e20",
          },
          "&:disabled": {
            bgcolor: "#cccccc",
          },
        }}
        aria-label={isConfCallRunning ? "End call" : "Start call"}
      >
        {isConfCallRunning ? "End Call" : "Start Call"}
      </Button>

      <Button
        variant="contained"
        startIcon={isSinkingConf ? <CircularProgress size={20} color="inherit" /> : null}
        onClick={onSinkConf}
        disabled={isConfCallRunning || isSinkingConf}
        sx={{
          bgcolor: "#66bb6a",
          color: "#ffffff",
          "&:hover": {
            bgcolor: "#4caf50",
          },
          "&:disabled": {
            bgcolor: "#cccccc",
          },
        }}
        aria-label="End conference"
      >
        End Conference
      </Button>

      <Button
        variant="outlined"
        startIcon={<PersonAddIcon />}
        onClick={onAddParticipant}
        disabled={!isConfCallRunning}
        sx={{
          borderColor: "#2e7d32",
          color: "#2e7d32",
          bgcolor: "#ffffff",
          "&:hover": {
            borderColor: "#1b5e20",
            bgcolor: "#e8f5e9",
          },
          "&:disabled": {
            borderColor: "#cccccc",
            color: "#cccccc",
          },
        }}
        aria-label="Add participant"
      >
        Add Participant
      </Button>

      <Button
        variant="outlined"
        startIcon={
          isLoadingMusic ? (
            <CircularProgress size={20} />
          ) : isPlayingAudio ? (
            <PauseIcon />
          ) : (
            <MusicNoteIcon />
          )
        }
        onClick={onMusicControl}
        disabled={isLoadingMusic || !isConfCallRunning || isStartingAudio}
        sx={{
          borderColor: "#2e7d32",
          color: "#2e7d32",
          bgcolor: "#ffffff",
          "&:hover": {
            borderColor: "#1b5e20",
            bgcolor: "#e8f5e9",
          },
          "&:disabled": {
            borderColor: "#cccccc",
            color: "#cccccc",
          },
        }}
        aria-label={isPlayingAudio ? "Pause music" : isPausedAudio ? "Resume music" : "Play music"}
      >
        {isPlayingAudio ? "Pause Music" : isPausedAudio ? "Resume Music" : "Play Music"}
      </Button>
    </Box>
  );
};
