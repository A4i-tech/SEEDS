import React, { useState, useEffect } from "react";
import { useConference, normalizePhone } from "./context/ConferenceContext";
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

const getPhoneNumber = (user) => user?.phoneNumber;
if (!getPhoneNumber) {
  throw new Error("getPhoneNumber function is not defined properly");
}

export function DetailsPage({ onConferenceEnded }) {
  const {
    userList,
    confId,
    isConfCallRunning,
    audioContentState,
    conferenceStudents,
    selectedTeacher,
    selectedStudents,
  } = useConference();

  const [, setUsers] = useState(userList);
  const [notification, setNotification] = useState(null);
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
  useEffect(() => {
    setUsers(userList);
  }, [userList]);

  // Listen for conference notifications
  useEffect(() => {
    const handleNotification = (event) => {
      const { detail } = event;
      if (detail.type === "participant_dropped") {
        // Show notification
        setNotification({
          message: `${detail.participantPhone} has left the call`,
          timestamp: detail.timestamp,
        });
        // Auto-hide after 5 seconds
        setTimeout(() => setNotification(null), 5000);
      }
    };

    window.addEventListener("conferenceNotification", handleNotification);
    return () => {
      window.removeEventListener("conferenceNotification", handleNotification);
    };
  }, []);

  // Use live-updated teacher from context for accurate status
  const teacher = selectedTeacher
    ? {
        ...selectedTeacher,
        phoneNumber: normalizePhone(selectedTeacher.phoneNumber),
      }
    : null;
  // Prefer live-updated selectedStudents (kept in sync via SSE); fall back to initial conferenceStudents
  const students = (
    selectedStudents && selectedStudents.length > 0 ? selectedStudents : conferenceStudents
  ).map((s) => (s ? { ...s, phoneNumber: normalizePhone(s.phoneNumber) } : s));

  const handleMuteToggle = async (userToUpdate) => {
    const phoneNumber = userToUpdate.phoneNumber;
    setLoadingIds((prev) => [...prev, phoneNumber]);

    try {
      const response = userToUpdate.is_muted
        ? await unmuteParticipant(confId, phoneNumber)
        : await muteParticipant(confId, phoneNumber);

      if (!response.ok) {
        throw new Error(`Failed to ${userToUpdate.is_muted ? "unmute" : "mute"} participant`);
      }

      // Success - SSE will update the state automatically
    } catch (error) {
      console.error("Error toggling mute:", error);
      setNotification({
        message: `Failed to ${userToUpdate.is_muted ? "unmute" : "mute"} ${userToUpdate.name}. Please try again.`,
        timestamp: Date.now(),
      });
      // Auto-hide notification after 5 seconds
      setTimeout(() => setNotification(null), 5000);
    } finally {
      setLoadingIds((prev) => prev.filter((id) => id !== phoneNumber));
    }
  };

  const handleStartCall = async () => {
    setIsLoadingCall(true);
    try {
      await startConferenceCall(confId);
    } catch (error) {
      console.error("Error starting the call:", error);
    } finally {
      setIsLoadingCall(false);
    }
  };

  const handleEndCall = async () => {
    setIsLoadingCall(true);
    try {
      await endConferenceCall(confId);
    } catch (error) {
      console.error("Error starting the call:", error);
    } finally {
      setIsLoadingCall(false);
    }
  };

  const handleSinkConf = async () => {
    setIsSinkingConf(true);
    try {
      await sinkConferenceCall(confId);
    } catch (error) {
      console.error("Error starting the call:", error);
    } finally {
      setIsSinkingConf(false);
      setHasSunkConf(true);
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
    for (const phoneNumber of selectedPhoneNumbers) {
      if (!phoneNumber) {
        continue;
      }
      await addParticipant(confId, phoneNumber);
    }
  };

  // Filter out students who are already in the userList
  const availableStudents = conferenceStudents.filter(
    (student) => !userList.some((user) => getPhoneNumber(user) === getPhoneNumber(student))
  );

  const isLoading = (phoneNumber) => phoneNumber && loadingIds.includes(phoneNumber);
  const isPlayingAudio = audioContentState.status === "Playing";
  const isPausedAudio = audioContentState.status === "Paused";
  const isStartingAudio = audioContentState.status === "Starting";
  const canSeekAudio = isConfCallRunning && !isStartingAudio && Boolean(confId);

  const canReconnect = (user) => user?.call_status === "disconnected" && isConfCallRunning;
  const isReconnecting = (phoneNumber) => phoneNumber && reconnectingIds.includes(phoneNumber);

  // Notify parent (Homepage) when conference has sunk so it can switch back to the form
  useEffect(() => {
    if (hasSunkConf) {
      onConferenceEnded?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasSunkConf]);
  if (hasSunkConf) {
    return null;
  }

  return (
    <div className="app-container">
      {/* Notification Toast */}
      {notification && (
        <div className="notification-toast">
          <div className="notification-content">
            <span className="notification-icon">🔔</span>
            <span>{notification.message}</span>
          </div>
        </div>
      )}
      <h1 className="welcome-title">Details</h1>
      <div className="list-container">
        {teacher && (
          <div className="list-box">
            <h2 className="list-title">Teacher</h2>
            <ul className="list">
              <li key={teacher.phoneNumber} className="list-item">
                <div className="list-item-content">
                  <span className="content">
                    <strong>{teacher.name}</strong>
                  </span>
                </div>
                <div className="list-item-content">
                  <span className="content">
                    <strong>{teacher.phoneNumber}</strong>
                  </span>
                </div>
                <div className="list-item-content">
                  <span className="content">
                    <strong>{teacher.call_status}</strong>
                  </span>
                </div>
                {canReconnect(teacher) && (
                  <div className="list-item-content">
                    <span className="content">
                      <button
                        onClick={() => handleReconnect(teacher.phoneNumber)}
                        className="mute-button"
                      >
                        {isReconnecting(teacher.phoneNumber) ? "Loading..." : "Reconnect"}
                      </button>
                    </span>
                  </div>
                )}
                <div className="list-item-content">
                  <span className="content">
                    <button
                      onClick={() => handleMuteToggle(teacher)}
                      disabled={
                        isLoading(teacher.phoneNumber) || teacher.call_status !== "connected"
                      }
                      className="mute-button"
                    >
                      {isLoading(teacher.phoneNumber)
                        ? "Loading..."
                        : teacher.is_muted
                          ? "Unmute"
                          : "Mute"}
                    </button>
                  </span>
                </div>
              </li>
            </ul>
          </div>
        )}

        {students.length > 0 && (
          <div className="list-box">
            <h2 className="list-title">Students</h2>
            <ul className="list">
              {students.map((student) => (
                <li key={student.phoneNumber} className="list-item">
                  <div className="list-item-content">
                    <span className="content">
                      <strong>{student.name}</strong>
                    </span>
                  </div>
                  <div className="list-item-content">
                    <span className="content">
                      <strong>{student.phoneNumber}</strong>
                    </span>
                  </div>
                  <div className="list-item-content">
                    <span className="content">
                      <strong>{student.call_status}</strong>
                    </span>
                  </div>
                  {canReconnect(student) && (
                    <div className="list-item-content">
                      <span className="content">
                        <button
                          onClick={() => handleReconnect(student.phoneNumber)}
                          className="mute-button"
                        >
                          {isReconnecting(student.phoneNumber) ? "Loading..." : "Reconnect"}
                        </button>
                      </span>
                    </div>
                  )}
                  <div className="list-item-content">
                    <span className="content">
                      <button
                        onClick={() => handleMuteToggle(student)}
                        disabled={
                          isLoading(student.phoneNumber) || student.call_status !== "connected"
                        }
                        className="mute-button"
                      >
                        {isLoading(student.phoneNumber)
                          ? "Loading..."
                          : student.is_muted
                            ? "Unmute"
                            : "Mute"}
                      </button>
                    </span>
                  </div>
                  {student.is_raised && (
                    <div className="list-item-content">
                      <span className="raised-hand-icon" role="img" aria-label="raised hand">
                        ✋
                      </span>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="button-container">
        <button
          className="action-button"
          onClick={isConfCallRunning ? handleEndCall : handleStartCall}
          disabled={isLoadingCall}
        >
          {isLoadingCall ? "Loading..." : isConfCallRunning ? "End Call" : "Start Call"}
        </button>

        <button
          className="action-button"
          onClick={handleSinkConf}
          disabled={isConfCallRunning || isSinkingConf}
        >
          {isSinkingConf ? "Sinking..." : "Sink Conference"}
        </button>

        <button className="action-button" onClick={handleOpenModal} disabled={!isConfCallRunning}>
          Add Participant
        </button>
        <button
          className="action-button"
          onClick={handleMusicControl}
          disabled={isLoadingMusic || !isConfCallRunning || isStartingAudio}
        >
          {isLoadingMusic
            ? "Loading..."
            : isStartingAudio
              ? "Starting..."
              : isPlayingAudio
                ? "Pause Music"
                : isPausedAudio
                  ? "Resume Music"
                  : "Play Music"}
        </button>
        {audioSelectionError && <span className="error-text">{audioSelectionError}</span>}
        <SeekControls
          disabled={!canSeekAudio}
          seekingDirection={seekDirection}
          onSeekBackward={() => handleSeek(-10)}
          onSeekForward={() => handleSeek(10)}
        />
      </div>
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
    </div>
  );
}
