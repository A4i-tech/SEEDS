import React, { useState, useEffect } from "react";
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
import { SeekControls } from "./components/SeekControls";
import { students as allStudents } from "./state";
import App from "./App";

const getPhoneNumber = (user) => user?.phoneNumber ?? user?.phone_number ?? "";
const normalizeUser = (user) =>
  user ? { ...user, phoneNumber: getPhoneNumber(user) } : null;

export function DetailsPage() {
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
  const [seekDirection, setSeekDirection] = useState(null);

  useEffect(() => {
    setUsers(userList);
  }, [userList]);

  const teacher = normalizeUser(users.find((user) => user.role === "Teacher"));
  const students = conferenceStudents;

  const handleMuteToggle = async (userToUpdate) => {
    setLoadingIds((prev) => [...prev, userToUpdate.phoneNumber]);

    if (userToUpdate.is_muted) {
      await unmuteParticipant(confId, userToUpdate.phoneNumber);
    } else {
      await muteParticipant(confId, userToUpdate.phoneNumber);
    }

    setLoadingIds((prev) =>
      prev.filter((id) => id !== userToUpdate.phoneNumber)
    );
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
    setIsLoadingMusic(true);
    if (audioContentState.status === "Playing") {
      await pauseAudio(confId);
    } else if (audioContentState.status === "Paused") {
      await resumeAudio(confId);
    } else {
      await playAudio(confId);
    }
    setIsLoadingMusic(false);
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
    (student) =>
      !userList.some((user) => getPhoneNumber(user) === getPhoneNumber(student))
  );

  const isLoading = (phoneNumber) =>
    phoneNumber && loadingIds.includes(phoneNumber);
  const isPlayingAudio = audioContentState.status === "Playing";
  const isPausedAudio = audioContentState.status === "Paused";
  const isStartingAudio = audioContentState.status === "Starting";
  const canSeekAudio = isConfCallRunning && !isStartingAudio && Boolean(confId);

  const canReconnect = (user) =>
    user?.call_status === "disconnected" && isConfCallRunning;
  const isReconnecting = (phoneNumber) =>
    phoneNumber && reconnectingIds.includes(phoneNumber);

  if (hasSunkConf) {
    return <App />;
  }

  return (
    <div className="app-container">
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
                        {isReconnecting(teacher.phoneNumber)
                          ? "Loading..."
                          : "Reconnect"}
                      </button>
                    </span>
                  </div>
                )}
                <div className="list-item-content">
                  <span className="content">
                    <button
                      onClick={() => handleMuteToggle(teacher)}
                      disabled={
                        isLoading(teacher.phoneNumber) ||
                        teacher.call_status !== "connected"
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
                          {isReconnecting(student.phoneNumber)
                            ? "Loading..."
                            : "Reconnect"}
                        </button>
                      </span>
                    </div>
                  )}
                  <div className="list-item-content">
                    <span className="content">
                      <button
                        onClick={() => handleMuteToggle(student)}
                        disabled={
                          isLoading(student.phoneNumber) ||
                          student.call_status !== "connected"
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
                      <span
                        className="raised-hand-icon"
                        role="img"
                        aria-label="raised hand"
                      >
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
          {isLoadingCall
            ? "Loading..."
            : isConfCallRunning
            ? "End Call"
            : "Start Call"}
        </button>

        <button
          className="action-button"
          onClick={handleSinkConf}
          disabled={isConfCallRunning || isSinkingConf}
        >
          {isSinkingConf ? "Sinking..." : "Sink Conference"}
        </button>

        <button
          className="action-button"
          onClick={handleOpenModal}
          disabled={!isConfCallRunning}
        >
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
    </div>
  );
}
