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
  const { userList, confId, isConfCallRunning, audioContentState, conferenceStudents } =
    useConference();

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

  // Auto-mute all students when they join the call
  useEffect(() => {
    if (isConfCallRunning && userList && userList.length > 0) {
      userList.forEach((user) => {
        const normalizedPhone = normalizePhoneNumber(user.phoneNumber);
        if (
          user.role === "Student" &&
          user.call_status === "connected" &&
          !user.is_muted &&
          !mutedStudentsRef.current.has(normalizedPhone)
        ) {
          mutedStudentsRef.current.add(normalizedPhone);
          muteParticipant(confId, normalizedPhone).catch((error) => {
            console.error("Error auto-muting student:", error);
            mutedStudentsRef.current.delete(normalizedPhone);
          });
        }
      });
    }
  }, [isConfCallRunning, userList, confId]);

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
  const teacher = users.find((user) => user.role === "Teacher") || null;
  const students = conferenceStudents;

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

    await addParticipant(confId, phoneNumber);

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
    try {
      for (const phoneNumber of selectedPhoneNumbers) {
        if (!phoneNumber) {
          continue;
        }
        await addParticipant(confId, phoneNumber);
      }
      showToast.success(`Added ${selectedPhoneNumbers.length} participant(s)`);
    } catch (error) {
      console.error("Error adding participants:", error);
      showToast.error("Failed to add participants");
    }
  };

  // Filter out students who are already in the userList
  const availableStudents = conferenceStudents.filter(
    (student) =>
      !userList.some(
        (user) =>
          normalizePhoneNumber(getPhoneNumber(user)) ===
          normalizePhoneNumber(getPhoneNumber(student))
      )
  );

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
  // Use a Map with normalized phone numbers to avoid duplicates
  const studentMap = new Map();
  students.forEach((student) => {
    const phoneNumber = getPhoneNumber(student);
    if (phoneNumber) {
      const normalizedPhone = normalizePhoneNumber(phoneNumber);
      studentMap.set(normalizedPhone, student);
    }
  });

  // Update with real-time data from userList
  const activeStudents = Array.from(studentMap.entries()).map(([normalizedPhone, student]) => {
    const userInCall = userList.find(
      (user) => normalizePhoneNumber(getPhoneNumber(user)) === normalizedPhone
    );
    // If student is in the call (userList), merge the call status and mute status
    // Otherwise, just use the student data as-is
    return userInCall
      ? {
          ...student,
          call_status: userInCall.call_status,
          is_muted: userInCall.is_muted,
          is_raised: userInCall.is_raised,
        }
      : student;
  });

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
