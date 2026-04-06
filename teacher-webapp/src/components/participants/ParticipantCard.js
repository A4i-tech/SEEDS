import React from "react";
import {
  Box,
  Typography,
  IconButton,
  Avatar,
  Button,
  CircularProgress,
  Tooltip,
} from "@mui/material";
import {
  Mic as MicIcon,
  MicOff as MicOffIcon,
  Phone as PhoneIcon,
  School as SchoolIcon,
  PhoneCallback as ReconnectIcon,
  WavingHand as RaisedHandIcon,
  PersonRemove as PersonRemoveIcon,
} from "@mui/icons-material";

export const ParticipantCard = ({
  participant,
  isTeacher = false,
  onMuteToggle,
  onReconnect,
  onRemove,
  isLoading,
  isReconnecting,
  isRemoving,
  canReconnect,
}) => {
  // Defensive check: return null if participant is not provided
  if (!participant) {
    return null;
  }

  const getStatusColor = (status) => {
    switch (status) {
      case "connected":
        return "#4caf50"; // Green
      case "disconnected":
        return "#f44336"; // Red
      case "on_hold":
        return "#ff9800"; // Orange
      default:
        return "#9e9e9e"; // Grey
    }
  };

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        p: 2,
        mb: 1.5,
        bgcolor: "#f5f5f5",
        borderRadius: 2,
        transition: "all 0.2s",
        "&:hover": {
          bgcolor: "#eeeeee",
        },
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 2, flex: 1 }}>
        <Avatar
          sx={{
            bgcolor: "#e8f5e9",
            color: "#2e7d32",
            width: 40,
            height: 40,
          }}
        >
          {isTeacher ? (
            <SchoolIcon sx={{ color: "#2e7d32" }} />
          ) : (
            <PhoneIcon sx={{ color: "#2e7d32" }} />
          )}
        </Avatar>
        <Box>
          <Typography variant="body1" fontWeight={600}>
            {participant.name || (isTeacher ? "Teacher" : "Student")}
          </Typography>
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, mt: 0.5 }}>
            <Typography variant="body2" color="text.secondary">
              {participant.phoneNumber}
            </Typography>
            {participant.call_status && (
              <Box
                sx={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  bgcolor: getStatusColor(participant.call_status),
                }}
              />
            )}
          </Box>
        </Box>
        {participant?.is_raised && (
          <Tooltip title="Raised hand">
            <RaisedHandIcon sx={{ color: "#ff9800", fontSize: 24 }} />
          </Tooltip>
        )}
      </Box>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        {/* Show phone icon with arrow when connected */}
        {participant.call_status === "connected" && (
          <PhoneIcon sx={{ color: "#2e7d32", fontSize: 24 }} />
        )}
        {canReconnect && (
          <Tooltip title="Reconnect">
            <IconButton
              onClick={() => onReconnect && onReconnect(participant.phoneNumber)}
              disabled={isReconnecting}
              sx={{ color: "#2e7d32" }}
              aria-label="Reconnect participant"
            >
              {isReconnecting ? <CircularProgress size={20} /> : <ReconnectIcon />}
            </IconButton>
          </Tooltip>
        )}
        {/* Remove button - only for students when connected */}
        {!isTeacher && participant.call_status === "connected" && onRemove && (
          <Tooltip title="Remove participant">
            <IconButton
              onClick={() => onRemove && onRemove(participant)}
              disabled={isRemoving}
              sx={{ color: "#f44336" }}
              aria-label="Remove participant"
            >
              {isRemoving ? (
                <CircularProgress size={20} />
              ) : (
                <PersonRemoveIcon />
              )}
            </IconButton>
          </Tooltip>
        )}
        <Button
          variant="outlined"
          startIcon={
            isLoading ? (
              <CircularProgress size={16} />
            ) : participant.is_muted ? (
              <MicOffIcon />
            ) : (
              <MicIcon />
            )
          }
          onClick={() => onMuteToggle && onMuteToggle(participant)}
          disabled={isLoading || participant.call_status !== "connected"}
          sx={{
            borderColor: "#e0e0e0",
            bgcolor: "#f5f5f5",
            color: "#424242",
            "&:hover": {
              borderColor: "#bdbdbd",
              bgcolor: "#eeeeee",
            },
            "&:disabled": {
              borderColor: "#e0e0e0",
              bgcolor: "#f5f5f5",
              color: "#9e9e9e",
            },
          }}
          aria-label={participant.is_muted ? "Unmute" : "Mute"}
        >
          {participant.is_muted ? "Unmute" : "Mute"}
        </Button>
      </Box>
    </Box>
  );
};
