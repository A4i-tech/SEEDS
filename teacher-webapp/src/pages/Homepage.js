import { useConference } from "../context/ConferenceContext";
import { DetailsPage } from "../callPage";
import { createConference } from "../services/apiService";
import React from "react";
import "../App.css";
import getCurrentTime from "../utils/CurrentTime";
import { SSE_ENDPOINTS } from "../constants/sseEndpoints";
import { API_ENDPOINTS } from "../constants/apiEndpoints";
import { useLocation } from "react-router-dom";
import { useNavigation } from "../hooks/useNavigation";
import { clearAuth } from "../utils/authHelpers";
import { StudentList } from "../components/StudentList";
import axios from "axios";
import { normalizePhoneNumber, formatStudentPhones } from "../utils/phoneUtils";

function Homepage() {
  // State for new student form
  const [newStudent, setNewStudent] = React.useState({
    name: "",
    phoneNumber: "",
  });
  // State for students to add
  const [addedStudents, setAddedStudents] = React.useState([]);
  // State for save status
  const [saveStatus, setSaveStatus] = React.useState("");
  const location = useLocation();
  const navigate = useNavigation();
  const recvdPhoneNumber = location.state;
  // derive a displayable phone number: support either an object {phoneNumber: '...'} or a raw string
  // fallback to localStorage if location.state is lost (e.g., after page refresh)
  const displayedPhone =
    recvdPhoneNumber && typeof recvdPhoneNumber === "object"
      ? recvdPhoneNumber.phoneNumber || ""
      : recvdPhoneNumber || localStorage.getItem("phoneNumber") || "";
  const {
    selectedStudents,
    setConfId,
    loading,
    setLoading,
    handleSSEEvent,
    handleStudentToggle,
    handleTeacherSelect,
    setConferenceStudents,
  } = useConference();
  // students fetched from server for the authenticated teacher
  const [studentsList, setStudentsList] = React.useState([]);

  // fetch students from backend endpoint using axios POST with phoneNumber in body
  React.useEffect(() => {
    if (!displayedPhone) return;
    let mounted = true;
    const token = localStorage.getItem("authToken");
    (async () => {
      try {
        const res = await axios.post(
          API_ENDPOINTS.GET_TEACHER_STUDENTS,
          { phoneNumber: displayedPhone },
          {
            headers: {
              "Content-Type": "application/json",
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
          }
        );
        if (!mounted) return;
        const data = res.data;
        console.log("Fetched students:", data);
        setStudentsList(Array.isArray(data) ? data : []);
      } catch (err) {
        if (mounted)
          console.error(
            "Error fetching students",
            err.response ? err.response.status : err.message
          );
      }
    })();
    return () => {
      mounted = false;
    };
  }, [displayedPhone]);

  // Handler for input changes
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    const digitsOnly = name === "phoneNumber" ? value.replace(/\D/g, "") : value;
    setNewStudent((prev) => ({ ...prev, [name]: digitsOnly }));
  };

  // Handler to add student to array
  const handleAddStudent = (e) => {
    e.preventDefault();
    if (
      !newStudent.name.trim() ||
      !newStudent.phoneNumber.trim() ||
      newStudent.phoneNumber.length !== 10
    )
      return;
    setAddedStudents((prev) => [...prev, newStudent]);
    setNewStudent({ name: "", phoneNumber: "" });
  };

  // Handler to send students to backend (fetch, append, then post)
  const handleSaveStudents = async () => {
    if (!displayedPhone || addedStudents.length === 0) return;
    setSaveStatus("saving");
    try {
      const token = localStorage.getItem("authToken");
      // 1. Fetch current students
      const fetchRes = await axios.post(
        API_ENDPOINTS.GET_TEACHER_STUDENTS,
        { phoneNumber: displayedPhone },
        {
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        }
      );
      const currentStudents = Array.isArray(fetchRes.data) ? fetchRes.data : [];
      // 2. Append new students (avoid duplicates by phoneNumber)
      const allStudents = [
        ...addedStudents.filter(
          (ns) =>
            !currentStudents.some((cs) => cs.phoneNumber === ns.phoneNumber)
        ),
      ];
      // 3. Post combined list
      console.log("Posting students:", allStudents);
      await axios.post(
        API_ENDPOINTS.ADD_TEACHER_STUDENTS,
        {
          phoneNumber: displayedPhone,
          students: allStudents,
        },
        {
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        }
      );
      setSaveStatus("success");
      setAddedStudents([]);
      setStudentsList(allStudents); // update UI
    } catch (err) {
      setSaveStatus("error");
    }
  };

  const [isSubmitted, setIsSubmitted] = React.useState(false);
  const handleFormSubmit = async () => {
    if (selectedStudents.length === 0) {
      alert("Please select at least one student");
      return;
    }

    // Get teacher phone number safely
    const teacherPhone =
      recvdPhoneNumber && typeof recvdPhoneNumber === "object"
        ? recvdPhoneNumber.phoneNumber || ""
        : recvdPhoneNumber || "";

    if (!teacherPhone) {
      alert("Teacher phone number is missing");
      return;
    }

    setLoading(true); // Start loading
    console.log("Starting conference for:", teacherPhone, selectedStudents);

    const teacherObject = {
      name: "Teacher",
      phoneNumber: teacherPhone,
      role: "Teacher",
    };
    handleTeacherSelect(teacherObject); // Select the teacher

    try {
      // Normalize phone numbers to ensure correct format (91XXXXXXXXXX)
      const teacherPhoneFormatted = normalizePhoneNumber(teacherPhone);
      const studentPhonesFormatted = formatStudentPhones(selectedStudents);

      if (!teacherPhoneFormatted) {
        alert("Invalid teacher phone number format");
        setLoading(false);
        return;
      }

      if (studentPhonesFormatted.length === 0) {
        alert("No valid student phone numbers found");
        setLoading(false);
        return;
      }

      if (studentPhonesFormatted.length !== selectedStudents.length) {
        console.warn(
          `Some student phone numbers were invalid. Expected ${selectedStudents.length}, got ${studentPhonesFormatted.length}`
        );
      }

      console.log("Creating conference with:", {
        teacher: teacherPhoneFormatted,
        students: studentPhonesFormatted,
        studentCount: studentPhonesFormatted.length,
      });

      const data = await createConference(teacherPhoneFormatted, studentPhonesFormatted);

      if (!data || !data.id) {
        throw new Error("Conference creation failed: No conference ID returned");
      }

      const conferenceId = data.id;
      setConfId(conferenceId);
      setConferenceStudents(selectedStudents);
      console.log("Conference created successfully. Conf ID:", conferenceId);
      console.log("Student phones sent:", studentPhonesFormatted);

      const sseEp = SSE_ENDPOINTS.CONFERENCE.TEACHER_CONNECT(conferenceId);
      const eventSource = new EventSource(sseEp);
      eventSource.onmessage = (event) => {
        console.log(`${getCurrentTime()} Message from SSE:`, event.data);
        const parsedData = JSON.parse(event.data);
        handleSSEEvent(parsedData);
      };
      eventSource.onerror = (err) => {
        console.error("SSE Error:", err);
        eventSource.close();
      };
      setIsSubmitted(true); // Navigate to DetailsPage
    } catch (error) {
      console.error("Error in API call:", error);
      alert(`Failed to create conference: ${error.message || "Unknown error"}`);
    } finally {
      setLoading(false); // Stop loading
    }
  };
  if (isSubmitted) {
    return <DetailsPage />;
  }

  const handleLogout = () => {
    clearAuth();
    navigate.goToLogin();
  };

  return (
    <div className="app-container">
      <button
        onClick={handleLogout}
        style={{
          position: "fixed",
          top: "16px",
          right: "16px",
          padding: "8px 16px",
          backgroundColor: "#dc3545",
          color: "white",
          border: "none",
          borderRadius: "4px",
          cursor: "pointer",
          fontSize: "14px",
          fontWeight: "500",
          zIndex: 1000,
        }}
        onMouseOver={(e) => (e.target.style.backgroundColor = "#c82333")}
        onMouseOut={(e) => (e.target.style.backgroundColor = "#dc3545")}
      >
        Logout
      </button>
      <h1 className="welcome-title">Welcome</h1>
      {/* show the received phone number when available */}
      {displayedPhone ? <p className="received-phone">Phone: {displayedPhone}</p> : null}

      {/* Add Student Form */}
      <form className="add-student-form" onSubmit={handleAddStudent} style={{ marginBottom: 16 }}>
        <input
          type="text"
          name="name"
          placeholder="Student Name"
          value={newStudent.name}
          onChange={handleInputChange}
          required
          style={{ marginRight: 8 }}
        />
        <input
          type="text"
          name="phoneNumber"
          placeholder="Phone Number"
          value={newStudent.phoneNumber}
          onChange={handleInputChange}
          minLength="10"
          maxLength="10"
          pattern="\d{10}"
          required
          style={{ marginRight: 8 }}
        />
        <button type="submit" style={{ marginRight: 8 }}>
          +
        </button>
      </form>
      {/* List of students to add */}
      {addedStudents.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          <strong>Students to Add:</strong>
          <ul>
            {addedStudents.map((s, idx) => (
              <li key={idx}>
                {s.name} - {s.phoneNumber}
              </li>
            ))}
          </ul>
        </div>
      )}
      {/* Save Students Button */}
      <button
        onClick={handleSaveStudents}
        disabled={!displayedPhone || addedStudents.length === 0 || saveStatus === "saving"}
        style={{ marginBottom: 16 }}
      >
        {saveStatus === "saving" ? "Saving..." : "Save Students"}
      </button>
      {saveStatus === "success" && <span style={{ color: "green", marginLeft: 8 }}>Saved!</span>}
      {saveStatus === "error" && (
        <span style={{ color: "red", marginLeft: 8 }}>Error saving students</span>
      )}
      <div className="list-container">
        <StudentList
          students={studentsList}
          selectedStudents={selectedStudents}
          onStudentToggle={handleStudentToggle}
        />
      </div>
      <button
        className="start-conference-button"
        onClick={handleFormSubmit}
        disabled={selectedStudents.length === 0 || loading}
      >
        {loading ? "Starting Conference..." : "Start Conference"}
      </button>
    </div>
  );
}

export default Homepage;
