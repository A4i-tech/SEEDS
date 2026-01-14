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
  const [confId, setConfId] = useState("");
  const [loading, setLoading] = useState(false);
  const [conferenceStudents, setConferenceStudents] = useState([]);
  const [allClassroomStudents, setAllClassroomStudents] = useState([]);
  const previousParticipantStatusRef = useRef({});

  // Single source of truth: Map of all participants keyed by normalized phone number
  // This gets updated directly when SSE events arrive
  const [participantsMap, setParticipantsMap] = useState(new Map());

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

  // Initialize participantsMap when conference starts (teacher and students are selected)
  useEffect(() => {
    if (!selectedTeacher && selectedStudents.length === 0) {
      // Clear map when no participants are selected
      setParticipantsMap(new Map());
      return;
    }

    setParticipantsMap((prevMap) => {
      const newMap = new Map(prevMap);

      // Add/update teacher
      if (selectedTeacher) {
        const normalizedPhone = normalizePhoneNumber(selectedTeacher.phoneNumber);
        const existingParticipant = newMap.get(normalizedPhone);
        newMap.set(
          normalizedPhone,
          new Participant({
            ...existingParticipant,
            ...selectedTeacher,
            role: "Teacher",
            phoneNumber: selectedTeacher.phoneNumber,
          })
        );
      }

      // Add/update students
      selectedStudents.forEach((student) => {
        const normalizedPhone = normalizePhoneNumber(student.phoneNumber);
        const existingParticipant = newMap.get(normalizedPhone);
        newMap.set(
          normalizedPhone,
          new Participant({
            ...existingParticipant,
            ...student,
            role: "Student",
            phoneNumber: student.phoneNumber,
          })
        );
      });

      return newMap;
    });
  }, [selectedTeacher, selectedStudents]);

  // Helper functions to get teacher and students from the centralized participantsMap
  const getTeacher = () => {
    if (!selectedTeacher) return null;
    const normalizedPhone = normalizePhoneNumber(selectedTeacher.phoneNumber);
    return participantsMap.get(normalizedPhone) || selectedTeacher;
  };

  const getStudents = () => {
    return Array.from(participantsMap.values()).filter(
      (participant) => participant.role === "Student"
    );
  };

  // Get all participants as an array (for backward compatibility)
  const getAllParticipants = () => {
    return Array.from(participantsMap.values());
  };

  const handleSSEEvent = (event) => {
    setIsConfCallRunning(event.is_running);
    setAudioContentState(new AudioContentState(event.audio_content_state));

    // Update the single source of truth: participantsMap
    // This directly updates the Map with the latest data from SSE events
    setParticipantsMap((prevMap) => {
      const newMap = new Map(prevMap);

      // Check for students transitioning from connected to disconnected
      for (let phoneNumber in event.participants) {
        const participantData = event.participants[phoneNumber];
        const normalizedPhone = normalizePhoneNumber(phoneNumber);
        const previousStatus = previousParticipantStatusRef.current[normalizedPhone];

        // If it's a student transitioning from connected to disconnected, show notification
        if (
          participantData.role === "Student" &&
          previousStatus === "connected" &&
          participantData.call_status === "disconnected"
        ) {
          window.dispatchEvent(
            new CustomEvent("conferenceNotification", {
              detail: {
                type: "participant_dropped",
                participantName: participantData.name,
                participantPhone: participantData.phone_number || phoneNumber,
                timestamp: new Date().toISOString(),
              },
            })
          );
        }

        // Update participant with latest SSE data - only update dynamic state, ignore name from SSE
        const existingParticipant = newMap.get(normalizedPhone);

        // Resolve name: use existing name if available, otherwise lookup from allClassroomStudents for new participants
        let name = existingParticipant?.name;
        if (!existingParticipant) {
          if (participantData.role === "Student") {
            const student = allClassroomStudents.find(
              (s) => s && normalizePhoneNumber(s.phoneNumber || s.phone_number) === normalizedPhone
            );
            name = student?.name;
          } else if (participantData.role === "Teacher" && selectedTeacher) {
            if (normalizePhoneNumber(selectedTeacher.phoneNumber) === normalizedPhone) {
              name = selectedTeacher.name;
            }
          }
        }

        const participant = new Participant({
          ...(existingParticipant || {}),
          name: name,
          phoneNumber: phoneNumber,
          phone_number: participantData.phone_number || phoneNumber,
          role: existingParticipant?.role || participantData.role || "Student",
          // Only update dynamic state from SSE (ignore name)
          call_status:
            participantData.call_status || existingParticipant?.call_status || "disconnected",
          is_muted:
            participantData.is_muted !== undefined
              ? Boolean(participantData.is_muted)
              : (existingParticipant?.is_muted ?? false),
          is_raised:
            participantData.is_raised === true ||
            participantData.is_raised === "true" ||
            participantData.is_raised === 1,
          raised_at:
            participantData.raised_at !== undefined
              ? Number(participantData.raised_at)
              : (existingParticipant?.raised_at ?? -1),
        });

        newMap.set(normalizedPhone, participant);
      }

      // Update previous status tracking
      const newStatusMap = {};
      for (let phoneNumber in event.participants) {
        const normalizedPhone = normalizePhoneNumber(phoneNumber);
        newStatusMap[normalizedPhone] = event.participants[phoneNumber].call_status;
      }
      previousParticipantStatusRef.current = newStatusMap;

      return newMap;
    });
  };

  return (
    <ConferenceContext.Provider
      value={{
        selectedTeacher,
        selectedStudents,
        // Single source of truth for all participants
        participantsMap,
        getAllParticipants,
        getTeacher,
        getStudents,
        // Backward compatibility - derived from participantsMap
        userList: getAllParticipants(),
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
