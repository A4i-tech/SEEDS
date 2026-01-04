import React, { createContext, useContext, useState, useEffect, useRef } from "react";
import { AudioContentState, Participant } from "../state"; // You can import from existing state file

// Utility to normalize phone numbers to '91' format
function normalizePhone(value) {
  if (!value) return "";
  const digitsOnly = String(value).replace(/\D/g, "");
  if (digitsOnly.length === 12 && digitsOnly.startsWith("91"))
    return digitsOnly;
  if (digitsOnly.length === 10) return "91" + digitsOnly;
  if (digitsOnly.length > 12) return "91" + digitsOnly.slice(-10);
  return digitsOnly;
}

const ConferenceContext = createContext();

export const useConference = () => useContext(ConferenceContext);

export const ConferenceProvider = ({ children }) => {
  const [isConfCallRunning, setIsConfCallRunning] = useState(false);
  const [audioContentState, setAudioContentState] = useState(new AudioContentState());
  const [selectedTeacher, setSelectedTeacher] = useState(null);
  const [selectedStudents, setSelectedStudents] = useState([]);
  const [userList, setUserList] = useState([]);
  const [confId, setConfId] = useState("");
  const [loading, setLoading] = useState(false);
  const [conferenceStudents, setConferenceStudents] = useState([]);
  const previousParticipantStatusRef = useRef({});

  // Updates the `userList` whenever teacher or students are selected
  useEffect(() => {
    const allUsers = [selectedTeacher, ...selectedStudents].filter(Boolean); // Filter out null values
    setUserList(allUsers);
  }, [selectedTeacher, selectedStudents]);

  const handleTeacherSelect = (teacher) => {
    setSelectedTeacher((prev) => (prev?.phoneNumber === teacher.phoneNumber ? null : teacher));
  };

  const handleStudentToggle = (student) => {
    setSelectedStudents((prevStudents) =>
      prevStudents.some((s) => s.phoneNumber === student.phoneNumber)
        ? prevStudents.filter((s) => s.phoneNumber !== student.phoneNumber)
        : [...prevStudents, student]
    );
  };

  const handleSSEEvent = (event) => {
    setIsConfCallRunning(event.is_running);
    setAudioContentState(new AudioContentState(event.audio_content_state));

    // Normalize all participant phone numbers to '91' format
    const normalizedParticipants = {};
    for (let phoneNumber in event.participants) {
      const normPhone = normalizePhone(phoneNumber);
      normalizedParticipants[normPhone] = event.participants[phoneNumber];
    }

    // Check for students transitioning from connected to disconnected
    for (let phoneNumber in normalizedParticipants) {
      const participant = normalizedParticipants[phoneNumber];
      const previousStatus = previousParticipantStatusRef.current[phoneNumber];

      console.log(
        `[ConferenceContext] ${participant.name} (${phoneNumber}): ${previousStatus} -> ${participant.call_status}`
      );

      // If it's a student transitioning from connected to disconnected, show notification
      if (
        participant.role === "Student" &&
        previousStatus === "connected" &&
        participant.call_status === "disconnected"
      ) {
        console.log(
          `[ConferenceContext] Dispatching notification for ${participant.name} (${participant.phone_number})`
        );
        window.dispatchEvent(
          new CustomEvent("conferenceNotification", {
            detail: {
              type: "participant_dropped",
              participantName: participant.name,
              participantPhone: participant.phone_number,
              timestamp: new Date().toISOString(),
            },
          })
        );
      }
    }

    // Update previous status tracking
    const newStatusMap = {};
    for (let phoneNumber in normalizedParticipants) {
      newStatusMap[phoneNumber] =
        normalizedParticipants[phoneNumber].call_status;
    }
    previousParticipantStatusRef.current = newStatusMap;

    for (let phoneNumber in normalizedParticipants) {
      const participant = new Participant({
        ...normalizedParticipants[phoneNumber],
      });

      if (
        selectedTeacher?.phoneNumber &&
        normalizePhone(selectedTeacher.phoneNumber) === phoneNumber
      ) {
        const newTeacher = new Participant({
          ...selectedTeacher,
          raised_at: participant.raised_at,
          is_raised: participant.is_raised,
          is_muted: participant.is_muted,
          call_status: participant.call_status,
        });
        setSelectedTeacher(newTeacher);
      } else {
        setSelectedStudents((prevStudents) => {
          const studentExists = prevStudents.some(
            (student) => normalizePhone(student.phoneNumber) === phoneNumber
          );

          if (studentExists) {
            // Update the existing student
            return prevStudents.map((student) =>
              normalizePhone(student.phoneNumber) === phoneNumber
                ? new Participant({
                    ...student,
                    raised_at: participant.raised_at,
                    is_raised: participant.is_raised,
                    is_muted: participant.is_muted,
                    call_status: participant.call_status,
                  })
                : student
            );
          }
          return prevStudents;
        });
      }
    }
  };

  return (
    <ConferenceContext.Provider
      value={{
        selectedTeacher,
        selectedStudents,
        userList,
        confId,
        isConfCallRunning,
        audioContentState,
        setConfId,
        loading,
        setLoading,
        handleSSEEvent,
        handleTeacherSelect,
        handleStudentToggle,
        setConferenceStudents,
        conferenceStudents,
      }}
    >
      {children}
    </ConferenceContext.Provider>
  );
};
