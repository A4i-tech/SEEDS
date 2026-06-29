import React from "react";
import { Grid, Skeleton, Box, Paper } from "@mui/material";

export const StudentListSkeleton = ({ count = 6 }) => {
  return (
    <Paper elevation={2} sx={{ p: 3 }}>
      <Skeleton variant="text" width={200} height={40} sx={{ mb: 3 }} />
      <Grid container spacing={2}>
        {Array.from({ length: count }).map((_, index) => (
          <Grid item xs={12} sm={6} md={4} key={index}>
            <Box
              sx={{
                p: 2,
                border: 1,
                borderColor: "divider",
                borderRadius: 2,
              }}
            >
              <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <Box sx={{ flex: 1 }}>
                  <Skeleton variant="text" width="60%" height={28} sx={{ mb: 1 }} />
                  <Skeleton variant="text" width="40%" height={20} />
                </Box>
                <Skeleton variant="rectangular" width={24} height={24} sx={{ borderRadius: 1 }} />
              </Box>
            </Box>
          </Grid>
        ))}
      </Grid>
    </Paper>
  );
};
