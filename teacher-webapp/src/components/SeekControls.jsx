import React from "react";
import { Button, CircularProgress } from "@mui/material";
import { SkipPrevious, SkipNext } from "@mui/icons-material";
import PropTypes from "prop-types";

export const SeekControls = ({ disabled, seekingDirection, onSeekBackward, onSeekForward }) => {
  const isBusy = Boolean(seekingDirection);

  return (
    <>
      <Button
        variant="contained"
        startIcon={
          seekingDirection === "backward" ? (
            <CircularProgress size={16} color="inherit" />
          ) : (
            <SkipPrevious />
          )
        }
        disabled={disabled || isBusy}
        onClick={onSeekBackward}
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
        aria-label="Seek backward 10 seconds"
      >
        {seekingDirection === "backward" ? "Seeking..." : "- 10s"}
      </Button>
      <Button
        variant="contained"
        startIcon={
          seekingDirection === "forward" ? (
            <CircularProgress size={16} color="inherit" />
          ) : (
            <SkipNext />
          )
        }
        disabled={disabled || isBusy}
        onClick={onSeekForward}
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
        aria-label="Seek forward 10 seconds"
      >
        {seekingDirection === "forward" ? "Seeking..." : "+ 10s"}
      </Button>
    </>
  );
};

SeekControls.propTypes = {
  disabled: PropTypes.bool,
  seekingDirection: PropTypes.oneOf([null, "backward", "forward"]),
  onSeekBackward: PropTypes.func.isRequired,
  onSeekForward: PropTypes.func.isRequired,
};

SeekControls.defaultProps = {
  disabled: false,
  seekingDirection: null,
};
