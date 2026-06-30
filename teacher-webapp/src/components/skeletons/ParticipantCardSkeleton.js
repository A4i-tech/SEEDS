import React from "react";
import { Box, Skeleton } from "@mui/material";

export const ParticipantCardSkeleton = () => {
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
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 2, flex: 1 }}>
        <Skeleton variant="circular" width={40} height={40} />
        <Box sx={{ flex: 1 }}>
          <Skeleton variant="text" width="40%" height={24} sx={{ mb: 0.5 }} />
          <Skeleton variant="text" width="60%" height={20} />
          <Skeleton variant="circular" width={8} height={8} sx={{ mt: 0.5 }} />
        </Box>
      </Box>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <Skeleton variant="rectangular" width={24} height={24} sx={{ borderRadius: 1 }} />
        <Skeleton variant="rectangular" width={80} height={36} sx={{ borderRadius: 1 }} />
      </Box>
    </Box>
  );
};

