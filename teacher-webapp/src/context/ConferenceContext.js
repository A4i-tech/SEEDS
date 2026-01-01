import React, { createContext, useContext, useState, useEffect, useRef } from "react";
import { AudioContentState, Participant } from "../state"; // You can import from existing state file

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

    // Check for students transitioning from connected to disconnected
    for (let phoneNumber in event.participants) {
      const participant = event.participants[phoneNumber];
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
    for (let phoneNumber in event.participants) {
      newStatusMap[phoneNumber] = event.participants[phoneNumber].call_status;
    }
    previousParticipantStatusRef.current = newStatusMap;

    for (let phoneNumber in event.participants) {
      const participant = new Participant({
        ...event.participants[phoneNumber],
      });

      if (selectedTeacher?.phoneNumber === phoneNumber) {
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
          const studentExists = prevStudents.some((student) => student.phoneNumber === phoneNumber);

          if (studentExists) {
            // Update the existing student
            return prevStudents.map((student) =>
              student.phoneNumber === phoneNumber
                ? new Participant({
                    ...student,
                    raised_at: participant.raised_at,
                    is_raised: participant.is_raised,
                    is_muted: participant.is_muted,
                    call_status: participant.call_status,
                  })
                : student
            );
          } else {
            // Add the new student
            return [...prevStudents, participant];
          }
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
