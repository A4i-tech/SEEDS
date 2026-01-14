import React, { createContext, useContext, useState, useEffect, useRef } from "react";
import { AudioContentState, Participant } from "../state"; // You can import from existing state file
import { normalizePhoneNumber } from "../utils/phoneUtils";

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
  const [allClassroomStudents, setAllClassroomStudents] = useState([]);
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
    // Normalize phone number to ensure consistent format
    const normalizedPhone = normalizePhoneNumber(student.phoneNumber);
    const normalizedStudent = {
      ...student,
      phoneNumber: normalizedPhone, // Always store normalized phone number
    };

    setSelectedStudents((prevStudents) => {
      // `normalizedStudent.phoneNumber` is already normalized; assume stored students are too.
      const exists = prevStudents.some((s) => s.phoneNumber === normalizedPhone);

      if (exists) {
        return prevStudents.filter((s) => s.phoneNumber !== normalizedPhone);
      } else {
        return [...prevStudents, normalizedStudent];
      }
    });
  };

  const clearSelectedStudents = () => {
    setSelectedStudents([]);
  };

  const handleSSEEvent = (event) => {
    console.log("[ConferenceContext] SSE Event received:", {
      is_running: event.is_running,
      participants_count: event.participants ? Object.keys(event.participants).length : 0,
      participants: event.participants,
    });

    setIsConfCallRunning(event.is_running);
    setAudioContentState(new AudioContentState(event.audio_content_state));

    // Check for students transitioning from connected to disconnected
    for (let phoneNumber in event.participants) {
      const participant = event.participants[phoneNumber];
      const previousStatus = previousParticipantStatusRef.current[phoneNumber];

      console.log(
        `[ConferenceContext] ${participant.name} (${phoneNumber}): ${previousStatus} -> ${participant.call_status}`
      );

      // Debug: Log raised hand status changes
      if (participant.is_raised !== undefined) {
        console.log(
          `[ConferenceContext] ${participant.name} (${phoneNumber}) raised hand status: is_raised=${participant.is_raised}, raised_at=${participant.raised_at}`
        );
      }

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
      const participantData = event.participants[phoneNumber];
      // Map phone_number (snake_case from backend) to phoneNumber (camelCase for frontend)
      // Use the loop key as the phoneNumber since it's the actual phone number
      // Ensure boolean values are properly handled (backend might send as string or number)
      const participant = new Participant({
        ...participantData,
        phoneNumber: phoneNumber, // Use the key from the loop as it's the actual phone number
        phone_number: participantData.phone_number || phoneNumber, // Also preserve snake_case for compatibility
        // Explicitly handle raised hand fields - ensure they're properly typed
        is_raised:
          participantData.is_raised === true ||
          participantData.is_raised === "true" ||
          participantData.is_raised === 1,
        raised_at: participantData.raised_at !== undefined ? Number(participantData.raised_at) : -1,
      });
      const normalizedEventPhone = normalizePhoneNumber(phoneNumber);

      if (
        selectedTeacher?.phoneNumber &&
        normalizePhoneNumber(selectedTeacher.phoneNumber) === normalizedEventPhone
      ) {
        const newTeacher = new Participant({
          ...selectedTeacher,
          raised_at: participant.raised_at ?? selectedTeacher.raised_at ?? -1,
          is_raised: participant.is_raised ?? selectedTeacher.is_raised ?? false,
          is_muted: participant.is_muted ?? selectedTeacher.is_muted ?? false,
          call_status: participant.call_status || selectedTeacher.call_status,
        });
        console.log(
          `[ConferenceContext] Updated teacher: is_raised=${newTeacher.is_raised}, raised_at=${newTeacher.raised_at}`
        );
        setSelectedTeacher(newTeacher);
      } else {
        setSelectedStudents((prevStudents) => {
          const studentExists = prevStudents.some(
            (student) => normalizePhoneNumber(student.phoneNumber) === normalizedEventPhone
          );

          if (studentExists) {
            // Update the existing student
            return prevStudents.map((student) => {
              if (normalizePhoneNumber(student.phoneNumber) === normalizedEventPhone) {
                const updatedStudent = new Participant({
                  ...student,
                  raised_at: participant.raised_at ?? student.raised_at ?? -1,
                  is_raised: participant.is_raised ?? student.is_raised ?? false,
                  is_muted: participant.is_muted ?? student.is_muted ?? false,
                  call_status: participant.call_status || student.call_status,
                });
                console.log(
                  `[ConferenceContext] Updated student ${student.name} (${student.phoneNumber}): is_raised=${updatedStudent.is_raised}, raised_at=${updatedStudent.raised_at}`
                );
                return updatedStudent;
              }
              return student;
            });
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
        clearSelectedStudents,
        setConferenceStudents,
        conferenceStudents,
        allClassroomStudents,
        setAllClassroomStudents,
      }}
    >
      {children}
    </ConferenceContext.Provider>
  );
};
