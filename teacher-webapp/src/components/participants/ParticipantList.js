import React from "react";
import { Box, Typography, Paper } from "@mui/material";
import { School as SchoolIcon, People as PeopleIcon } from "@mui/icons-material";
import { ParticipantCard } from "./ParticipantCard";
import { ParticipantCardSkeleton } from "../skeletons/ParticipantCardSkeleton";
import { normalizePhoneNumber } from "../../utils/phoneUtils";

export const ParticipantList = ({
  teacher,
  students,
  onMuteToggle,
  onReconnect,
  onAssignLeader,
  onRevokeLeader,
  isLoading,
  isReconnecting,
  canReconnect,
  loading = false,
  isLoadingLeader = null,
}) => {
  return (
    <Paper
      elevation={2}
      sx={{
        p: 3,
        bgcolor: "#ffffff",
        borderRadius: 2,
      }}
    >
      <Typography
        variant="h5"
        component="h1"
        align="center"
        gutterBottom
        sx={{ mb: 3, fontWeight: 600 }}
      >
        Details
      </Typography>

      {loading ? (
        <>
          <Box sx={{ mb: 3 }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
              <SchoolIcon sx={{ color: "#2e7d32", fontSize: 24 }} />
              <Typography variant="h6" fontWeight={600}>
                Teacher
              </Typography>
            </Box>
            <ParticipantCardSkeleton />
          </Box>
          <Box>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
              <PeopleIcon sx={{ color: "#2e7d32", fontSize: 24 }} />
              <Typography variant="h6" fontWeight={600}>
                Students
              </Typography>
            </Box>
            {Array.from({ length: 3 }).map((_, index) => (
              <ParticipantCardSkeleton key={index} />
            ))}
          </Box>
        </>
      ) : (
        <>
          {teacher && (
            <Box sx={{ mb: 3 }}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
                <SchoolIcon sx={{ color: "#2e7d32", fontSize: 24 }} />
                <Typography variant="h6" fontWeight={600}>
                  Teacher
                </Typography>
              </Box>
              <ParticipantCard
                participant={teacher}
                isTeacher={true}
                onMuteToggle={onMuteToggle}
                onReconnect={onReconnect}
                isLoading={isLoading(teacher.phoneNumber)}
                isReconnecting={isReconnecting(teacher.phoneNumber)}
                canReconnect={canReconnect(teacher)}
              />
            </Box>
          )}

          {students.length > 0 && (
            <Box>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
                <PeopleIcon sx={{ color: "#2e7d32", fontSize: 24 }} />
                <Typography variant="h6" fontWeight={600}>
                  Students
                </Typography>
              </Box>
              {students.map((student) => (
                <ParticipantCard
                  key={student.phoneNumber}
                  participant={student}
                  isTeacher={false}
                  onMuteToggle={onMuteToggle}
                  onReconnect={onReconnect}
                  onAssignLeader={onAssignLeader}
                  onRevokeLeader={onRevokeLeader}
                  isLoading={isLoading(student.phoneNumber)}
                  isReconnecting={isReconnecting(student.phoneNumber)}
                  canReconnect={canReconnect(student)}
                  isLeaderLoading={
                    isLoadingLeader != null &&
                    normalizePhoneNumber(student.phoneNumber) === isLoadingLeader
                  }
                />
              ))}
            </Box>
          )}
        </>
      )}
    </Paper>
  );
};
