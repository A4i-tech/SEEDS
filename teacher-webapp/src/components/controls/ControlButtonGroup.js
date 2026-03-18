import React from "react";
import { Box, Button, CircularProgress } from "@mui/material";
import {
  Phone as PhoneIcon,
  PhoneDisabled as PhoneDisabledIcon,
  PersonAdd as PersonAddIcon,
  PlayArrow as PlayArrowIcon,
  MicOff as MicOffIcon,
  Mic as MicIcon,
} from "@mui/icons-material";

export const ControlButtonGroup = ({
  isConfCallRunning,
  isLoadingCall,
  isSinkingConf,
  isMutingAll,
  isUnmutingAll,
  activeStudents = [],
  onStartCall,
  onEndCall,
  onSinkConf,
  onAddParticipant,
  onMusicControl,
  onMuteAll,
  onUnmuteAll,
  disabled,
}) => {
  const connectedStudents = activeStudents.filter(
    (s) => s.call_status === "connected"
  );
  // Determine if all connected students are muted
  const allStudentsMuted =
    connectedStudents.length > 0 &&
    connectedStudents.every((student) => student.is_muted === true);

  // Show mute/unmute all buttons only when call is running and there are students
  const showBulkMuteControls = isConfCallRunning && activeStudents.length > 0;
  
  const hasConnectedStudents = connectedStudents.length > 0;
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
        startIcon={<PlayArrowIcon />}
        onClick={onMusicControl}
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
        aria-label="Play content"
      >
        Play
      </Button>

      {showBulkMuteControls && (
        <Button
          variant="outlined"
          startIcon={
            isMutingAll || isUnmutingAll ? (
              <CircularProgress size={20} />
            ) : allStudentsMuted ? (
              <MicIcon />
            ) : (
              <MicOffIcon />
            )
          }
          onClick={allStudentsMuted ? onUnmuteAll : onMuteAll}
          disabled={
            isMutingAll ||
            isUnmutingAll ||
            !isConfCallRunning ||
            !hasConnectedStudents
          }
          sx={{
            borderColor: allStudentsMuted ? "#2e7d32" : "#d32f2f",
            color: allStudentsMuted ? "#2e7d32" : "#d32f2f",
            bgcolor: "#ffffff",
            "&:hover": {
              borderColor: allStudentsMuted ? "#1b5e20" : "#c62828",
              bgcolor: allStudentsMuted ? "#e8f5e9" : "#ffebee",
            },
            "&:disabled": {
              borderColor: "#cccccc",
              color: "#cccccc",
            },
          }}
          aria-label={allStudentsMuted ? "Unmute all students" : "Mute all students"}
        >
          {allStudentsMuted ? "Unmute All" : "Mute All"}
        </Button>
      )}
    </Box>
  );
};
