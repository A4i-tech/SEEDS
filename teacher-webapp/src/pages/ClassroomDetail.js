import React, { useState, useEffect, useRef } from "react";
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  List,
  ListItem,
  ListItemText,
  Chip,
  Alert,
  Divider,
  Paper,
  Checkbox,
  CircularProgress,
} from "@mui/material";
import {
  ArrowBack as ArrowBackIcon,
  Edit as EditIcon,
  People as PeopleIcon,
  School as SchoolIcon,
  Call as CallIcon,
} from "@mui/icons-material";
import { useNavigate, useParams } from "react-router-dom";
import { getClassroomById } from "../services/classroomService";
import { getTeacherStudents } from "../services/teacherService";
import { useAuth } from "../hooks/useAuth";
import { showToast } from "../utils/toast";
import { LoadingSpinner } from "../components/common/LoadingSpinner";
import { PageContainer } from "../components/layout/PageContainer";
import { useConference } from "../context/ConferenceContext";
import { DetailsPage } from "../callPage";
import { createConference } from "../services/apiService";
import getCurrentTime from "../utils/CurrentTime";
import { SSE_ENDPOINTS } from "../constants/sseEndpoints";
import { normalizePhoneNumber, formatStudentPhones } from "../utils/phoneUtils";

const ClassroomDetail = () => {
  const navigate = useNavigate();
  const { classroomId } = useParams();
  const { getCurrentTeacher } = useAuth();
  const [classroom, setClassroom] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [teacherStudentsList, setTeacherStudentsList] = useState([]);
  const [conferenceStarted, setConferenceStarted] = useState(false);
  const [teacherPhone, setTeacherPhone] = useState(null);
  const [conferenceId, setConferenceId] = useState(null);
  const eventSourceRef = useRef(null);
  const isMountedRef = useRef(true);

  const {
    selectedStudents,
    setConfId,
    loading: conferenceLoading,
    setLoading: setConferenceLoading,
    handleSSEEvent,
    handleStudentToggle,
    handleTeacherSelect,
    setConferenceStudents,
    setAllClassroomStudents,
  } = useConference();

  // Main data loading effect - handles sequential and parallel fetching
  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        setErrorMsg("");

        // Step 1: Fetch teacher info first (required for students and validation)
        const teacher = await getCurrentTeacher();
        if (!teacher?.phoneNumber) {
          throw new Error("Teacher phone number not available");
        }
        setTeacherPhone(teacher.phoneNumber);

        // Step 2: Fetch classroom and students in parallel (both are independent)
        const [classroomData, studentData] = await Promise.all([
          getClassroomById(classroomId),
          getTeacherStudents(teacher.phoneNumber),
        ]);

        setClassroom(classroomData);
        setTeacherStudentsList(Array.isArray(studentData) ? studentData : []);
      } catch (err) {
        console.error("Error loading classroom data:", err);
        setErrorMsg("Failed to load classroom details. Please try again.");
        showToast.error("Failed to load classroom data");
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [classroomId, getCurrentTeacher]);

  // Handle SSE connection cleanup on mount/unmount
  useEffect(() => {
    // Track if component is mounted
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
      // Clean up SSE connection on unmount
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, []);

  // Handle SSE connection when conference starts
  useEffect(() => {
    if (!conferenceStarted || !conferenceId) {
      return;
    }

    try {
      const sseEp = SSE_ENDPOINTS.CONFERENCE.TEACHER_CONNECT(conferenceId);
      const eventSource = new EventSource(sseEp);
      eventSourceRef.current = eventSource;

      eventSource.onmessage = (event) => {
        // Only process if component is still mounted
        if (!isMountedRef.current) return;

        console.log(`${getCurrentTime()} Message from SSE:`, event.data);
        try {
          const parsedData = JSON.parse(event.data);
          if (isMountedRef.current && handleSSEEvent) {
            handleSSEEvent(parsedData);
          }
        } catch (parseError) {
          console.error("Error parsing SSE data:", parseError);
        }
      };

      eventSource.onerror = (err) => {
        console.error("SSE Error:", err);
        if (eventSourceRef.current) {
          eventSourceRef.current.close();
          eventSourceRef.current = null;
        }
      };
    } catch (error) {
      console.error("Error setting up SSE connection:", error);
    }

    // Cleanup on unmount or when conference ends
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, [conferenceStarted, conferenceId, handleSSEEvent]);

  const handleBack = () => {
    navigate("/classrooms");
  };

  const handleEdit = () => {
    navigate(`/classrooms/edit/${classroomId}`);
  };

  const handleStartConference = async () => {
    if (selectedStudents.length === 0) {
      showToast.error("Please select at least one student");
      return;
    }

    if (!teacherPhone) {
      showToast.error("Teacher phone number is missing");
      return;
    }

    setConferenceLoading(true);
    console.log("Starting conference for:", teacherPhone, selectedStudents);

    const teacherObject = {
      name: "Teacher",
      phoneNumber: teacherPhone,
      role: "Teacher",
    };
    handleTeacherSelect(teacherObject);

    try {
      const teacherPhoneFormatted = normalizePhoneNumber(teacherPhone);
      const studentPhonesFormatted = formatStudentPhones(selectedStudents);

      if (!teacherPhoneFormatted) {
        showToast.error("Invalid teacher phone number format");
        setConferenceLoading(false);
        return;
      }

      if (studentPhonesFormatted.length === 0) {
        showToast.error("No valid student phone numbers found");
        setConferenceLoading(false);
        return;
      }

      if (studentPhonesFormatted.length !== selectedStudents.length) {
        console.warn(
          `Some student phone numbers were invalid. Expected ${selectedStudents.length}, got ${studentPhonesFormatted.length}`
        );
      }

      const leaderPhone = classroom.leaders
        ?.map((phone) => normalizePhoneNumber(phone))
        .find((phone) => studentPhonesFormatted.includes(phone)) ?? null;

      console.log("Creating conference with:", {
        teacher: teacherPhoneFormatted,
        students: studentPhonesFormatted,
        studentCount: studentPhonesFormatted.length,
        leader: leaderPhone,
      });

      const data = await createConference(teacherPhoneFormatted, studentPhonesFormatted, leaderPhone);

      if (!data || !data.id) {
        throw new Error("Conference creation failed: No conference ID returned");
      }

      const conferenceId = data.id;
      setConfId(conferenceId);
      setConferenceId(conferenceId);

      setConferenceStudents(selectedStudents);

      // Normalize selected students' phone numbers before setting conference students
      const normalizedSelectedStudents = selectedStudents.map((student) => ({
        ...student,
        phoneNumber: normalizePhoneNumber(student.phoneNumber),
      }));

      setConferenceStudents(normalizedSelectedStudents);

      // Pass ALL students with both property name formats for "Add Participant" modal
      // This allows adding unselected students later
      // Normalize phone numbers to ensure consistent format (91XXXXXXXXXX)
      const allStudentsFormatted = teacherStudentsList.map((student) => {
        const normalizedPhone = normalizePhoneNumber(student.phoneNumber);
        return {
          name: student.name,
          phoneNumber: normalizedPhone,
          phone_number: normalizedPhone, // For AddParticipantModal compatibility
        };
      });
      setAllClassroomStudents(allStudentsFormatted);

      console.log("Conference created successfully. Conf ID:", conferenceId);
      console.log("Student phones sent:", studentPhonesFormatted);

      setConferenceStarted(true);
      showToast.success("Conference started successfully");
    } catch (error) {
      console.error("Error in API call:", error);
      showToast.error(`Failed to create conference: ${error.message || "Unknown error"}`);
    } finally {
      setConferenceLoading(false);
    }
  };

  // Get student object by phone number
  const getStudentByPhone = (phoneNumber) => {
    return teacherStudentsList.find((s) => s.phoneNumber === phoneNumber);
  };

  // Check if student phone is selected (using normalized comparison)
  const isStudentSelected = (phoneNumber) => {
    const normalizedPhone = normalizePhoneNumber(phoneNumber);
    return selectedStudents.some((s) => {
      const normalizedSelected = normalizePhoneNumber(s.phoneNumber);
      return normalizedSelected === normalizedPhone;
    });
  };

  // Toggle student selection
  const handleToggleStudent = (phoneNumber) => {
    if (!phoneNumber) return;

    // Normalize phone number first to ensure consistent format
    const normalizedPhone = normalizePhoneNumber(phoneNumber);

    // Try to get student from teacher's list first (using normalized comparison)
    let student = teacherStudentsList.find(
      (s) => normalizePhoneNumber(s.phoneNumber) === normalizedPhone
    );

    // If not found, create a student object with normalized phone number
    if (!student) {
      student = {
        name: phoneNumber, // Use original phone as name if no student data
        phoneNumber: normalizedPhone, // Always store normalized phone number
      };
    } else {
      // Ensure the student object has normalized phone number
      student = {
        ...student,
        phoneNumber: normalizedPhone,
      };
    }

    handleStudentToggle(student);
  };

  // Check if phone is a leader
  const isLeader = (phoneNumber) => classroom.leaders?.includes(phoneNumber);

  if (conferenceStarted) {
    return <DetailsPage classroomName={classroom?.name} classroomId={classroom?._id} />;
  }

  if (loading) {
    return <LoadingSpinner />;
  }

  if (!classroom) {
    return (
      <PageContainer>
        <Alert severity="error">Classroom not found</Alert>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <Box sx={{ mb: 3 }}>
        <Button startIcon={<ArrowBackIcon />} onClick={handleBack} sx={{ mb: 2 }}>
          Back to Classrooms
        </Button>
        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 2,
          }}
        >
          <Typography variant="h4" component="h1" sx={{ fontWeight: 600 }}>
            {classroom.name}
          </Typography>
          <Box sx={{ display: "flex", gap: 2 }}>
            <Button
              variant="outlined"
              color="primary"
              startIcon={<EditIcon />}
              onClick={handleEdit}
            >
              Edit Classroom
            </Button>
            <Button
              variant="contained"
              color="success"
              startIcon={
                conferenceLoading ? <CircularProgress size={16} color="inherit" /> : <CallIcon />
              }
              onClick={handleStartConference}
              disabled={selectedStudents.length === 0 || conferenceLoading}
            >
              {conferenceLoading ? "Starting..." : "Start Conference"}
            </Button>
          </Box>
        </Box>
      </Box>

      {errorMsg && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {errorMsg}
        </Alert>
      )}

      {(() => {
        // Count only students that are actually in the current classroom
        const selectedInClassroom =
          classroom?.students?.filter((phoneNumber) => isStudentSelected(phoneNumber)) || [];
        return selectedInClassroom.length > 0 ? (
          <Alert severity="info" sx={{ mb: 3 }}>
            {selectedInClassroom.length} student{selectedInClassroom.length !== 1 ? "s" : ""}{" "}
            selected for conference
          </Alert>
        ) : null;
      })()}

      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom sx={{ fontWeight: 600 }}>
            Overview
          </Typography>
          <Box sx={{ mt: 2, display: "flex", gap: 4 }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <PeopleIcon sx={{ color: "primary.main" }} />
              <Box>
                <Typography variant="h4" sx={{ fontWeight: 600 }}>
                  {classroom.students?.length || 0}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Students
                </Typography>
              </Box>
            </Box>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <SchoolIcon sx={{ color: "secondary.main" }} />
              <Box>
                <Typography variant="h4" sx={{ fontWeight: 600 }}>
                  {classroom.leaders?.length || 0}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Leaders
                </Typography>
              </Box>
            </Box>
          </Box>
        </CardContent>
      </Card>

      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom sx={{ fontWeight: 600 }}>
            Students - Select for Conference
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Click on students to select them for the conference call
          </Typography>
          {!classroom.students || classroom.students.length === 0 ? (
            <Paper
              variant="outlined"
              sx={{
                p: 3,
                textAlign: "center",
                bgcolor: "background.default",
                mt: 2,
              }}
            >
              <PeopleIcon sx={{ fontSize: 48, color: "text.secondary", mb: 1 }} />
              <Typography variant="body2" color="text.secondary">
                No students in this classroom
              </Typography>
            </Paper>
          ) : (
            <List sx={{ mt: 2 }}>
              {classroom.students.map((phoneNumber, index) => {
                const student = getStudentByPhone(phoneNumber);
                const selected = isStudentSelected(phoneNumber);
                const studentIsLeader = isLeader(phoneNumber);

                return (
                  <React.Fragment key={phoneNumber}>
                    {index > 0 && <Divider />}
                    <ListItem
                      sx={{
                        py: 2,
                        cursor: "pointer",
                        bgcolor: selected ? "action.selected" : "transparent",
                        "&:hover": {
                          bgcolor: selected ? "action.selected" : "action.hover",
                        },
                      }}
                      onClick={() => handleToggleStudent(phoneNumber)}
                    >
                      <Checkbox checked={selected} sx={{ mr: 1 }} />
                      <ListItemText
                        primary={student ? student.name : phoneNumber}
                        secondary={phoneNumber}
                        primaryTypographyProps={{
                          fontWeight: studentIsLeader ? 600 : 400,
                        }}
                      />
                      {studentIsLeader && (
                        <Chip label="Leader" color="secondary" size="small" icon={<SchoolIcon />} />
                      )}
                    </ListItem>
                  </React.Fragment>
                );
              })}
            </List>
          )}
        </CardContent>
      </Card>

      {classroom.leaders && classroom.leaders.length > 0 && (
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom sx={{ fontWeight: 600 }}>
              Classroom Leaders
            </Typography>
            <Box sx={{ mt: 2, display: "flex", flexWrap: "wrap", gap: 1 }}>
              {classroom.leaders.map((leaderPhone) => {
                const student = getStudentByPhone(leaderPhone);
                return (
                  <Chip
                    key={leaderPhone}
                    label={student ? student.name : leaderPhone}
                    color="secondary"
                    icon={<SchoolIcon />}
                  />
                );
              })}
            </Box>
          </CardContent>
        </Card>
      )}
    </PageContainer>
  );
};

export default ClassroomDetail;
