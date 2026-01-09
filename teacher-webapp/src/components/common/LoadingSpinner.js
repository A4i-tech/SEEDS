import React from "react";
import { CircularProgress, Box } from "@mui/material";

export const LoadingSpinner = ({ size = 40, ...props }) => (
  <Box display="flex" justifyContent="center" alignItems="center" p={2}>
    <CircularProgress size={size} {...props} />
  </Box>
);
