import React, { useState, useEffect, useRef } from "react";
import { Box, Typography } from "@mui/material";
import { useNavigate } from "react-router-dom";
import { useConference } from "./context/ConferenceContext";
import {
  startConferenceCall,
  endConferenceCall,
  sinkConferenceCall,
  muteParticipant,
  unmuteParticipant,
  playAudio,
  pauseAudio,
  addParticipant,
  resumeAudio,
  seekAudio,
} from "./services/apiService";
import { AddParticipantModal } from "./components/AddParticipantModal";
import { AudioContentModal } from "./components/AudioContentModal";
import { SeekControls } from "./components/SeekControls";
import { ParticipantList } from "./components/participants/ParticipantList";
import { ControlButtonGroup } from "./components/controls/ControlButtonGroup";
import { PageContainer } from "./components/layout/PageContainer";
import { showToast } from "./utils/toast";
import { normalizePhoneNumber } from "./utils/phoneUtils";

const getPhoneNumber = (user) => user?.phoneNumber;

export function DetailsPage() {
  const navigate = useNavigate();
  const {
    userList,
    confId,
    isConfCallRunning,
    audioContentState,
    conferenceStudents,
    selectedTeacher,
    allClassroomStudents,
  } = useConference();

  const [users, setUsers] = useState(userList);
  const [loadingIds, setLoadingIds] = useState([]);
  const [reconnectingIds, setReconnectingIds] = useState([]);
  const [isLoadingCall, setIsLoadingCall] = useState(false);
  const [isSinkingConf, setIsSinkingConf] = useState(false);
  const [hasSunkConf, setHasSunkConf] = useState(false);
  const [isLoadingMusic, setIsLoadingMusic] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isAudioModalOpen, setIsAudioModalOpen] = useState(false);
  const [seekDirection, setSeekDirection] = useState(null);
  const [audioSelectionError, setAudioSelectionError] = useState(null);
  const mutedStudentsRef = useRef(new Set());

  useEffect(() => {
    setUsers(userList);
  }, [userList]);

  // Listen for conference notifications
  useEffect(() => {
    const handleNotification = (event) => {
      const { detail } = event;
      if (detail.type === "participant_dropped") {
        showToast.info(`${detail.participantPhone} has left the call`);
      }
    };

    window.addEventListener("conferenceNotification", handleNotification);
    return () => {
      window.removeEventListener("conferenceNotification", handleNotification);
    };
  }, []);

  // Get teacher from userList (which is updated by SSE events)
  // Prefer selectedTeacher from context as it's directly updated by SSE events
  // Fallback to users.find() if selectedTeacher is not available
  const teacher = selectedTeacher || users.find((user) => user.role === "Teacher") || null;
  const students = conferenceStudents || [];

  const handleMuteToggle = async (userToUpdate) => {
    const phoneNumber = userToUpdate.phoneNumber;
    const normalizedPhone = normalizePhoneNumber(phoneNumber);
    setLoadingIds((prev) => [...prev, phoneNumber]);

    try {
      userToUpdate.is_muted
        ? await unmuteParticipant(confId, normalizedPhone)
        : await muteParticipant(confId, normalizedPhone);

      // Success - SSE will update the state automatically
    } catch (error) {
      console.error("Error toggling mute:", error);
      showToast.error(
        `Failed to ${userToUpdate.is_muted ? "unmute" : "mute"} ${userToUpdate.name || "Participant"}. Please try again.`
      );
    } finally {
      setLoadingIds((prev) => prev.filter((id) => id !== phoneNumber));
    }
  };

  const handleStartCall = async () => {
    setIsLoadingCall(true);
    try {
      await startConferenceCall(confId);
      showToast.success("Call started successfully");
    } catch (error) {
      console.error("Error starting the call:", error);
      showToast.error("Failed to start call");
    } finally {
      setIsLoadingCall(false);
    }
  };

  const handleEndCall = async () => {
    setIsLoadingCall(true);
    try {
      await endConferenceCall(confId);
      showToast.success("Call ended");
    } catch (error) {
      console.error("Error ending the call:", error);
      showToast.error("Failed to end call");
    } finally {
      setIsLoadingCall(false);
    }
  };

  const handleSinkConf = async () => {
    setIsSinkingConf(true);
    try {
      await sinkConferenceCall(confId);
      showToast.success("Conference sunk successfully");
      setHasSunkConf(true);
    } catch (error) {
      console.error("Error sinking conference:", error);
      showToast.error("Failed to sink conference");
    } finally {
      setIsSinkingConf(false);
    }
  };

  const handleMusicControl = async () => {
    if (audioContentState.status === "Playing") {
      setIsLoadingMusic(true);
      try {
        await pauseAudio(confId);
      } finally {
        setIsLoadingMusic(false);
      }
      return;
    }

    if (audioContentState.status === "Paused") {
      setIsLoadingMusic(true);
      try {
        await resumeAudio(confId);
      } finally {
        setIsLoadingMusic(false);
      }
      return;
    }

    setAudioSelectionError(null);
    setIsAudioModalOpen(true);
  };

  const handlePlaySelectedTrack = async (trackUrl) => {
    if (!confId) {
      setAudioSelectionError("Conference is not ready.");
      return;
    }

    if (!trackUrl) {
      setAudioSelectionError("Selected track does not have a valid URL.");
      return;
    }

    setIsLoadingMusic(true);
    setAudioSelectionError(null);
    try {
      await playAudio(confId, trackUrl);
    } catch (error) {
      console.error("Error playing audio:", error);
      setAudioSelectionError("Unable to start the selected track.");
    } finally {
      setIsLoadingMusic(false);
      setIsAudioModalOpen(false);
    }
  };

  const handleReconnect = async (phoneNumber) => {
    if (!phoneNumber) {
      return;
    }
    setReconnectingIds((prev) => [...prev, phoneNumber]);

    // Normalize phone number before sending to API
    const normalizedPhone = normalizePhoneNumber(phoneNumber);
    await addParticipant(confId, normalizedPhone);

    setReconnectingIds((prev) => prev.filter((id) => id !== phoneNumber));
  };

  const handleSeek = async (deltaSeconds) => {
    if (!confId) return;
    const direction = deltaSeconds < 0 ? "backward" : "forward";
    setSeekDirection(direction);
    try {
      await seekAudio(confId, deltaSeconds);
    } catch (error) {
      console.error("Error seeking audio:", error);
    } finally {
      setSeekDirection(null);
    }
  };

  const handleOpenModal = () => setIsModalOpen(true);
  const handleCloseModal = () => setIsModalOpen(false);
  const handleCloseAudioModal = () => setIsAudioModalOpen(false);

  const handleAddParticipants = async (selectedPhoneNumbers) => {
    if (!confId) {
      showToast.error("Conference ID is missing");
      return;
    }

    if (!Array.isArray(selectedPhoneNumbers) || selectedPhoneNumbers.length === 0) {
      showToast.error("No participants selected");
      return;
    }

    try {
      const normalizedPhones = selectedPhoneNumbers
        .map((phoneNumber) => {
          if (!phoneNumber) return null;
          return normalizePhoneNumber(phoneNumber);
        })
        .filter(Boolean); // Remove null/empty values

      if (normalizedPhones.length === 0) {
        showToast.error("No valid phone numbers to add");
        return;
      }

      // Add participants in parallel for better performance
      const addPromises = normalizedPhones.map((normalizedPhone) =>
        addParticipant(confId, normalizedPhone).catch((error) => {
          console.error(`Failed to add participant ${normalizedPhone}:`, error);
          return { error: true, phone: normalizedPhone };
        })
      );

      const results = await Promise.all(addPromises);
      const failed = results.filter((r) => r?.error).length;
      const succeeded = results.length - failed;

      if (succeeded > 0) {
        showToast.success(`Added ${succeeded} participant(s) successfully`);
      }
      if (failed > 0) {
        showToast.error(`Failed to add ${failed} participant(s)`);
      }
    } catch (error) {
      console.error("Error adding participants:", error);
      showToast.error("Failed to add participants");
    }
  };

  // Filter out students who are already in the userList
  // Use normalized phone number comparison to ensure accurate matching
  const availableStudents = (allClassroomStudents || []).filter((student) => {
    if (!student) return false;

    const studentPhone = normalizePhoneNumber(student.phoneNumber || student.phone_number);
    if (!studentPhone) return false;

    // Check if student is already in userList (already in the call)
    const isAlreadyInCall = (userList || []).some((user) => {
      if (!user) return false;
      const userPhone = normalizePhoneNumber(getPhoneNumber(user));
      return userPhone && userPhone === studentPhone;
    });

    return !isAlreadyInCall;
  });

  const isLoading = (phoneNumber) => phoneNumber && loadingIds.includes(phoneNumber);
  const isPlayingAudio = audioContentState.status === "Playing";
  const isPausedAudio = audioContentState.status === "Paused";
  const isStartingAudio = audioContentState.status === "Starting";
  const canSeekAudio = isConfCallRunning && !isStartingAudio && Boolean(confId);

  const canReconnect = (user) => user?.call_status === "disconnected" && isConfCallRunning;
  const isReconnecting = (phoneNumber) => phoneNumber && reconnectingIds.includes(phoneNumber);

  // Merge conferenceStudents with userList data to get call status, mute status, etc.
  // This preserves the original functionality: show all conferenceStudents
  // but update them with real-time data from userList (SSE events)
  // Also include students from userList that were added during the call (not in conferenceStudents)
  // Use a Map with normalized phone numbers to avoid duplicates
  const studentMap = new Map();
  // Safely handle empty or undefined students array
  if (Array.isArray(students)) {
    students.forEach((student) => {
      if (student) {
        const phoneNumber = getPhoneNumber(student);
        if (phoneNumber) {
          const normalizedPhone = normalizePhoneNumber(phoneNumber);
          studentMap.set(normalizedPhone, student);
        }
      }
    });
  }

  // Add students from userList that aren't in conferenceStudents (newly added participants)
  // Safely handle empty or undefined userList
  if (Array.isArray(userList)) {
    userList.forEach((user) => {
      if (user && user.role === "Student") {
        const phoneNumber = getPhoneNumber(user);
        if (phoneNumber) {
          const normalizedPhone = normalizePhoneNumber(phoneNumber);
          if (!studentMap.has(normalizedPhone)) {
            // This is a newly added student, try to find the actual name from allClassroomStudents
            const studentFromClassroom = Array.isArray(allClassroomStudents)
              ? allClassroomStudents.find(
                  (student) =>
                    student && normalizePhoneNumber(getPhoneNumber(student)) === normalizedPhone
                )
              : null;
            // Use the name from allClassroomStudents if available, otherwise use the user's name
            const studentToAdd = studentFromClassroom
              ? {
                  ...user,
                  name: studentFromClassroom.name,
                  phoneNumber: phoneNumber, // Ensure phoneNumber is set correctly
                }
              : user;
            studentMap.set(normalizedPhone, studentToAdd);
          }
        }
      }
    });
  }

  // Update with real-time data from userList
  const activeStudents = Array.from(studentMap.entries())
    .map(([normalizedPhone, student]) => {
      if (!student) return null;

      const userInCall = Array.isArray(userList)
        ? userList.find(
            (user) => user && normalizePhoneNumber(getPhoneNumber(user)) === normalizedPhone
          )
        : null;

      // If student is in the call (userList), merge all real-time data including raised hand status
      // Otherwise, just use the student data as-is
      if (userInCall) {
        const mergedStudent = {
          ...student,
          ...userInCall, // Spread all userInCall properties first
          // Preserve original student data (name, phoneNumber) but override with real-time data
          name: student.name || userInCall.name,
          phoneNumber: student.phoneNumber || userInCall.phoneNumber,
          // Explicitly ensure raised hand fields are included (these come from SSE events)
          is_raised:
            userInCall.is_raised !== undefined
              ? userInCall.is_raised
              : (student.is_raised ?? false),
          raised_at:
            userInCall.raised_at !== undefined ? userInCall.raised_at : (student.raised_at ?? -1),
          // Ensure call status and mute status are included
          call_status: userInCall.call_status || student.call_status,
          is_muted:
            userInCall.is_muted !== undefined ? userInCall.is_muted : (student.is_muted ?? false),
        };

        // Debug: Log raised hand status for merged students
        if (mergedStudent.is_raised) {
          console.log(
            `[callPage] Student ${mergedStudent.name} (${mergedStudent.phoneNumber}) has raised hand: is_raised=${mergedStudent.is_raised}, raised_at=${mergedStudent.raised_at}`
          );
        }

        return mergedStudent;
      }

      return student;
    })
    .filter(Boolean); // Remove any null entries

  useEffect(() => {
    if (hasSunkConf) {
      // Navigate back to classrooms list after sinking conference
      navigate("/classrooms");
    }
  }, [hasSunkConf, navigate]);

  return (
    <PageContainer maxWidth="md">
      <Box
        sx={{
          bgcolor: "#f5f5f5",
          minHeight: "100vh",
          py: 4,
        }}
      >
        {/* Participant List */}
        <ParticipantList
          teacher={teacher}
          students={activeStudents}
          onMuteToggle={handleMuteToggle}
          onReconnect={handleReconnect}
          isLoading={isLoading}
          isReconnecting={isReconnecting}
          canReconnect={canReconnect}
        />

        {/* Control Buttons */}
        <ControlButtonGroup
          isConfCallRunning={isConfCallRunning}
          isLoadingCall={isLoadingCall}
          isSinkingConf={isSinkingConf}
          isLoadingMusic={isLoadingMusic}
          isPlayingAudio={isPlayingAudio}
          isPausedAudio={isPausedAudio}
          isStartingAudio={isStartingAudio}
          onStartCall={handleStartCall}
          onEndCall={handleEndCall}
          onSinkConf={handleSinkConf}
          onAddParticipant={handleOpenModal}
          onMusicControl={handleMusicControl}
        />

        {/* Seek Controls */}
        <Box
          sx={{
            display: "flex",
            gap: 2,
            justifyContent: "center",
            mt: 2,
          }}
        >
          <SeekControls
            disabled={!canSeekAudio}
            seekingDirection={seekDirection}
            onSeekBackward={() => handleSeek(-10)}
            onSeekForward={() => handleSeek(10)}
          />
        </Box>

        {/* Error Message */}
        {audioSelectionError && (
          <Box sx={{ mt: 2, textAlign: "center" }}>
            <Typography color="error" variant="body2">
              {audioSelectionError}
            </Typography>
          </Box>
        )}
      </Box>

      {/* Modals */}
      <AddParticipantModal
        open={isModalOpen}
        onClose={handleCloseModal}
        availableStudents={availableStudents}
        onSubmit={handleAddParticipants}
      />
      <AudioContentModal
        open={isAudioModalOpen}
        onClose={handleCloseAudioModal}
        onSubmit={handlePlaySelectedTrack}
      />
    </PageContainer>
  );
}
