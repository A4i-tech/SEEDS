import React from "react";
import { Box, Card, CardContent, Typography, IconButton } from "@mui/material";
import { History as HistoryIcon, PlayArrow as PlayArrowIcon } from "@mui/icons-material";

const MAX_SESSIONS = 5;

const formatTimestamp = (timestamp) => {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? "s" : ""} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? "s" : ""} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? "s" : ""} ago`;

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
  });
};

const RecentConferences = ({ sessions, onSessionClick }) => {
  if (!sessions || sessions.length === 0) return null;

  const displayedSessions = sessions.slice(0, MAX_SESSIONS);

  return (
    <Card sx={{ mt: 3 }}>
      <CardContent>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
          <HistoryIcon color="primary" />
          <Typography variant="h6" fontWeight={600}>
            Recent Conferences
          </Typography>
        </Box>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
          {displayedSessions.map((sessionItem) => (
            <Box
              key={`${sessionItem.groupId}-${sessionItem.timestamp}`}
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                p: 1.5,
                border: "1px solid",
                borderColor: "divider",
                borderRadius: 1,
                "&:hover": {
                  bgcolor: "action.hover",
                  cursor: "pointer",
                },
              }}
              onClick={() => onSessionClick(sessionItem)}
            >
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="body1" fontWeight={500}>
                  {sessionItem.groupName}
                </Typography>
                <Box sx={{ display: "flex", gap: 1, mt: 0.5, flexWrap: "wrap" }}>
                  <Typography variant="caption" color="text.secondary">
                    {formatTimestamp(sessionItem.timestamp)}
                  </Typography>
                  {sessionItem.studentCount !== null && sessionItem.studentCount !== undefined && (
                    <>
                      <Typography variant="caption" color="text.secondary">
                        •
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {sessionItem.studentCount} student
                        {sessionItem.studentCount !== 1 ? "s" : ""}
                      </Typography>
                    </>
                  )}
                </Box>
              </Box>
              <IconButton
                size="small"
                color="primary"
                onClick={(e) => {
                  e.stopPropagation();
                  onSessionClick(sessionItem);
                }}
                sx={{ ml: 1 }}
              >
                <PlayArrowIcon />
              </IconButton>
            </Box>
          ))}
        </Box>
      </CardContent>
    </Card>
  );
};

export default RecentConferences;
