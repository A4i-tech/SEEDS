import React from "react";
import { Box, Typography, Divider, CircularProgress } from "@mui/material";
import AudioPlayer from "./audio/AudioPlayer";

/**
 * NowPlayingFooter - displays local audio preview player (non-conference mode)
 */
const NowPlayingFooter = ({ selectedItem, audioUrl, loadingAudio }) => {
  if (!selectedItem) {
    return null;
  }

  return (
    <>
      <Divider />
      <Box sx={{ px: 2, pt: 1.5, pb: 2, backgroundColor: "grey.50" }}>
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}
        >
          Now Playing
        </Typography>
        <Typography
          variant="body2"
          sx={{ fontWeight: 600, mt: 0.25, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
        >
          {selectedItem.title?.english || selectedItem.title?.local || "Untitled"}
        </Typography>

        {loadingAudio ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 1.5 }}>
            <CircularProgress size={24} />
          </Box>
        ) : audioUrl ? (
          <AudioPlayer audioUrl={audioUrl} autoPlay variant="light" />
        ) : (
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
            No audio available for this content.
          </Typography>
        )}
      </Box>
    </>
  );
};

export default NowPlayingFooter;
