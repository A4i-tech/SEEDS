import React from "react";
import { Box, Skeleton, Paper } from "@mui/material";

export const FormSkeleton = ({ fieldCount = 3 }) => {
  return (
    <Paper elevation={2} sx={{ p: 3 }}>
      <Skeleton variant="text" width={200} height={40} sx={{ mb: 3 }} />
      <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {Array.from({ length: fieldCount }).map((_, index) => (
          <Box key={index}>
            <Skeleton variant="text" width={120} height={20} sx={{ mb: 1 }} />
            <Skeleton variant="rectangular" width="100%" height={56} sx={{ borderRadius: 1 }} />
          </Box>
        ))}
        <Skeleton variant="rectangular" width="100%" height={42} sx={{ borderRadius: 1, mt: 2 }} />
      </Box>
    </Paper>
  );
};

