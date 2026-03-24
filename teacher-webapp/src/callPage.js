import React, { useState, useEffect } from "react";
import {
  Box,
  Typography,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Button,
  Alert,
} from "@mui/material";
import { useNavigate } from "react-router-dom";
import { useConference } from "./context/ConferenceContext";
import {
  startConferenceCall,
  endConferenceCall,
  sinkConferenceCall,
  muteParticipant,
  unmuteParticipant,
  muteAll,
  unmuteAll,
  playAudio,
  addParticipant,
  removeParticipant,
} from "./services/apiService";
import { AddParticipantModal } from "./components/AddParticipantModal";
import ContentDrawer from "./components/ContentDrawer";
import ConferenceAudioPlayer from "./components/audio/ConferenceAudioPlayer";
import { ParticipantList } from "./components/participants/ParticipantList";
import { ControlButtonGroup } from "./components/controls/ControlButtonGroup";
import { PageContainer } from "./components/layout/PageContainer";
import { showToast } from "./utils/toast";
import { normalizePhoneNumber } from "./utils/phoneUtils";
import { addSessionToHistory } from "./services/sessionHistoryService";

export function DetailsPage({ classroomName = null, classroomId = null }) {
  const navigate = useNavigate();
  const {
    confId,
    isConfCallRunning,
    conferenceHoldDetected,
    audioContentState,
    getTeacher,
    getStudents,
    allClassroomStudents,
    getAllParticipants,
  } = useConference();

  const [loadingIds, setLoadingIds] = useState([]);
  const [reconnectingIds, setReconnectingIds] = useState([]);
  const [removingIds, setRemovingIds] = useState([]);
  const [isLoadingCall, setIsLoadingCall] = useState(false);
  const [isSinkingConf, setIsSinkingConf] = useState(false);
  const [hasSunkConf, setHasSunkConf] = useState(false);
  const [isLoadingMusic, setIsLoadingMusic] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isContentDrawerOpen, setIsContentDrawerOpen] = useState(false);
  const [currentTrack, setCurrentTrack] = useState(null);
  const [audioSelectionError, setAudioSelectionError] = useState(null);
  const [isMutingAll, setIsMutingAll] = useState(false);
  const [isUnmutingAll, setIsUnmutingAll] = useState(false);
  const [removeConfirmParticipant, setRemoveConfirmParticipant] = useState(null);

  // Listen for conference notifications
  useEffect(() => {
    const handleNotification = (event) => {
      const { detail } = event;
      if (detail.type === "participant_dropped") {
        showToast.info(`${detail.participantPhone} has left the call`);
      } else if (detail.type === "conference_hold_detected") {
        showToast.warning("Hold detected on conference audio");
      }
    };

    window.addEventListener("conferenceNotification", handleNotification);
    return () => {
      window.removeEventListener("conferenceNotification", handleNotification);
    };
  }, []);

  // Get teacher and students from centralized state
  const teacher = getTeacher();
  const activeStudents = getStudents();

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
      
      // Track conference session in history
      if (classroomId && classroomName) {
        const allParticipants = getAllParticipants();
        const studentCount = allParticipants.filter((p) => p?.role === "Student").length;
        
        addSessionToHistory({
          groupId: classroomId,
          groupName: classroomName,
          studentCount: studentCount > 0 ? studentCount : 0,
          wasConference: true,
        });
      }
      
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
      
      // Track conference session in history
      if (classroomId && classroomName) {
        const allParticipants = getAllParticipants();
        const studentCount = allParticipants.filter((p) => p?.role === "Student").length;
        
        addSessionToHistory({
          groupId: classroomId,
          groupName: classroomName,
          studentCount: studentCount > 0 ? studentCount : 0,
          wasConference: true,
        });
      }
      
      showToast.success("Conference sunk successfully");
      setHasSunkConf(true);
    } catch (error) {
      console.error("Error sinking conference:", error);
      showToast.error("Failed to sink conference");
    } finally {
      setIsSinkingConf(false);
    }
  };

  const handleMusicControl = () => {
    setAudioSelectionError(null);
    setIsContentDrawerOpen(true);
  };

  const handlePlaySelectedTrack = async (contentData) => {
    const trackUrl = typeof contentData === "string" ? contentData : contentData?.url;

    if (!confId) {
      setAudioSelectionError("Conference is not ready.");
      return;
    }

    if (!trackUrl) {
      setAudioSelectionError("Selected track does not have a valid URL.");
      return;
    }

    if (typeof contentData === "object") {
      setCurrentTrack(contentData);
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
      setIsContentDrawerOpen(false);
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

  const handleOpenModal = () => setIsModalOpen(true);
  const handleCloseModal = () => setIsModalOpen(false);

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

  const handleMuteAll = async () => {
    if (!confId) {
      showToast.error("Conference ID is missing");
      return;
    }

    setIsMutingAll(true);
    try {
      await muteAll(confId);
      showToast.success("Muting all students...");
      // SSE will automatically update the UI with new mute states
    } catch (error) {
      console.error("Error muting all:", error);
      showToast.error(`Failed to mute all: ${error.message || "Unknown error"}`);
    } finally {
      setIsMutingAll(false);
    }
  };

  const handleUnmuteAll = async () => {
    if (!confId) {
      showToast.error("Conference ID is missing");
      return;
    }

    setIsUnmutingAll(true);
    try {
      await unmuteAll(confId);
      showToast.success("Unmuting all students...");
      // SSE will automatically update the UI with new mute states
    } catch (error) {
      console.error("Error unmuting all:", error);
      showToast.error(`Failed to unmute all: ${error.message || "Unknown error"}`);
    } finally {
      setIsUnmutingAll(false);
    }
  };

  const handleRemoveParticipant = (participant) => {
    if (!confId) {
      showToast.error("Conference ID is missing");
      return;
    }
    if (!participant || !participant.phoneNumber) {
      showToast.error("Invalid participant");
      return;
    }
    setRemoveConfirmParticipant(participant);
  };

  const handleRemoveConfirmClose = () => setRemoveConfirmParticipant(null);

  const handleRemoveConfirm = async () => {
    const participant = removeConfirmParticipant;
    if (!participant || !confId) return;

    const participantName = participant.name || participant.phoneNumber;
    const phoneNumber = participant.phoneNumber;
    setRemovingIds((prev) => [...prev, phoneNumber]);
    setRemoveConfirmParticipant(null);

    try {
      const normalizedPhone = normalizePhoneNumber(phoneNumber);
      await removeParticipant(confId, normalizedPhone);
      showToast.success(`${participantName} removed successfully`);
    } catch (error) {
      console.error("Error removing participant:", error);
      showToast.error(`Failed to remove ${participantName}: ${error.message || "Unknown error"}`);
    } finally {
      setRemovingIds((prev) => prev.filter((id) => id !== phoneNumber));
    }
  };

  // Filter out students who are already in the call (using centralized participantsMap)
  const allParticipants = getAllParticipants();
  const availableStudents = (allClassroomStudents || []).filter((student) => {
    if (!student) return false;

    const studentPhone = normalizePhoneNumber(student.phoneNumber || student.phone_number);
    if (!studentPhone) return false;

    // Check if student is already in the call using centralized state
    const isAlreadyInCall = allParticipants.some((participant) => {
      if (!participant) return false;
      const participantPhone = normalizePhoneNumber(participant.phoneNumber);
      return participantPhone && participantPhone === studentPhone;
    });

    return !isAlreadyInCall;
  });

  const isLoading = (phoneNumber) => phoneNumber && loadingIds.includes(phoneNumber);

  const canReconnect = (user) => user?.call_status === "disconnected" && isConfCallRunning;
  const isReconnecting = (phoneNumber) => phoneNumber && reconnectingIds.includes(phoneNumber);
  const isRemoving = (phoneNumber) => phoneNumber && removingIds.includes(phoneNumber);

  useEffect(() => {
    if (hasSunkConf) {
      navigate("/classrooms");
    }
  }, [hasSunkConf, navigate]);

  useEffect(() => {
    if (audioContentState.status === "Stopped") {
      setCurrentTrack(null);
    }
  }, [audioContentState.status]);

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
        {conferenceHoldDetected && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            Hold detected on conference audio
          </Alert>
        )}
        <ParticipantList
          teacher={teacher}
          students={activeStudents}
          onMuteToggle={handleMuteToggle}
          onReconnect={handleReconnect}
          onRemove={handleRemoveParticipant}
          isLoading={isLoading}
          isReconnecting={isReconnecting}
          isRemoving={isRemoving}
          canReconnect={canReconnect}
        />

        {/* Control Buttons */}
        <ControlButtonGroup
          isConfCallRunning={isConfCallRunning}
          isLoadingCall={isLoadingCall}
          isSinkingConf={isSinkingConf}
          isMutingAll={isMutingAll}
          isUnmutingAll={isUnmutingAll}
          activeStudents={activeStudents}
          onStartCall={handleStartCall}
          onEndCall={handleEndCall}
          onSinkConf={handleSinkConf}
          onAddParticipant={handleOpenModal}
          onMusicControl={handleMusicControl}
          onMuteAll={handleMuteAll}
          onUnmuteAll={handleUnmuteAll}
        />

        {/* Conference Audio Player */}
        {(currentTrack || ["Playing", "Paused", "Starting"].includes(audioContentState.status)) && (
          <ConferenceAudioPlayer
            trackTitle={currentTrack?.title}
            trackLocal={currentTrack?.trackLocal}
            trackType={currentTrack?.type}
            durationStr={currentTrack?.durationStr}
            audioContentState={audioContentState}
            confId={confId}
            isLoadingMusic={isLoadingMusic}
          />
        )}

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
      <ContentDrawer
        open={isContentDrawerOpen}
        onClose={() => setIsContentDrawerOpen(false)}
        onPlay={handlePlaySelectedTrack}
        audioContentState={audioContentState}
        conferenceActive={isConfCallRunning}
      />

      <Dialog
        open={Boolean(removeConfirmParticipant)}
        onClose={handleRemoveConfirmClose}
        maxWidth="xs"
        fullWidth
        aria-labelledby="remove-participant-dialog-title"
        aria-describedby="remove-participant-dialog-description"
      >
        <DialogTitle id="remove-participant-dialog-title">Remove participant</DialogTitle>
        <DialogContent>
          <DialogContentText id="remove-participant-dialog-description">
            {removeConfirmParticipant
              ? `Are you sure you want to remove ${removeConfirmParticipant.name || removeConfirmParticipant.phoneNumber} from the conference?`
              : ""}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleRemoveConfirmClose}>Cancel</Button>
          <Button onClick={handleRemoveConfirm} color="error" variant="contained" autoFocus>
            Remove
          </Button>
        </DialogActions>
      </Dialog>
    </PageContainer>
  );
}
