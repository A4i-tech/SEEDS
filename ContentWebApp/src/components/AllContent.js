import React, { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import Multiselect from "multiselect-react-dropdown";
import { SEEDS_URL } from "../Constants";
import LogoutButton from "./LogoutButton";

const pageStyle = {
  minHeight: "100vh",
  backgroundColor: "#f4f6f8",
  padding: "32px 24px 48px",
};

const containerStyle = {
  maxWidth: "1200px",
  margin: "0 auto",
  display: "flex",
  flexDirection: "column",
  gap: "24px",
};

const headerCardStyle = {
  backgroundColor: "#ffffff",
  borderRadius: "0",
  padding: "16px 32px",
  boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)",
  display: "flex",
  flexDirection: "row",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "24px",
};

const headerTopStyle = {
  display: "flex",
  flexDirection: "row",
  alignItems: "center",
  gap: "32px",
  flex: 1,
};

const headerTextStyle = {
  display: "flex",
  flexDirection: "row",
  alignItems: "center",
  gap: "8px",
  fontSize: "20px",
  fontWeight: 700,
  color: "#0f172a",
};

const greetingStyle = {
  fontSize: "14px",
  color: "#8f9bb3",
  fontWeight: 600,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
};

const titleStyle = {
  fontSize: "32px",
  color: "#0f172a",
  fontWeight: 700,
  margin: 0,
};

const subtitleStyle = {
  fontSize: "15px",
  color: "#64748b",
  margin: 0,
};

const actionGroupStyle = {
  display: "flex",
  gap: "24px",
  alignItems: "center",
};

const navLinkStyle = (isActive) => ({
  background: "none",
  border: "none",
  padding: "8px 4px",
  fontSize: "15px",
  fontWeight: isActive ? 600 : 500,
  color: isActive ? "#0f172a" : "#64748b",
  cursor: "pointer",
  borderBottom: isActive ? "2px solid #0f172a" : "2px solid transparent",
  transition: "all 0.2s",
});

const userAvatarStyle = {
  width: "36px",
  height: "36px",
  borderRadius: "50%",
  backgroundColor: "#1d4ed8",
  color: "#ffffff",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: "14px",
  fontWeight: 600,
};

const userDropdownContainerStyle = {
  position: "relative",
};

const userDropdownStyle = {
  position: "absolute",
  top: "calc(100% + 8px)",
  right: 0,
  backgroundColor: "#ffffff",
  border: "1px solid #e2e8f0",
  borderRadius: "12px",
  boxShadow: "0 10px 25px rgba(0, 0, 0, 0.1)",
  minWidth: "180px",
  zIndex: 1000,
  overflow: "hidden",
};

const dropdownItemStyle = {
  padding: "12px 16px",
  fontSize: "14px",
  color: "#0f172a",
  cursor: "pointer",
  border: "none",
  background: "none",
  width: "100%",
  textAlign: "left",
  display: "flex",
  alignItems: "center",
  gap: "8px",
  transition: "background-color 0.2s",
};

const primaryButtonStyle = {
  border: "none",
  borderRadius: "12px",
  padding: "12px 20px",
  backgroundColor: "#0f172a",
  color: "#ffffff",
  fontWeight: 600,
  cursor: "pointer",
};

const secondaryButtonStyle = {
  ...primaryButtonStyle,
  backgroundColor: "#1d4ed8",
};

const actionGhostButtonStyle = {
  ...primaryButtonStyle,
  backgroundColor: "#ffffff",
  color: "#0f172a",
  border: "1px solid #e2e8f0",
};

const tabsContainerStyle = {
  display: "flex",
  gap: "8px",
  backgroundColor: "#e2e8f0",
  borderRadius: "999px",
  padding: "6px",
  alignSelf: "flex-start",
  flexWrap: "wrap",
};

const tabButtonStyle = (isActive) => ({
  border: "none",
  borderRadius: "999px",
  padding: "10px 24px",
  fontSize: "14px",
  fontWeight: 600,
  backgroundColor: isActive ? "#ffffff" : "transparent",
  color: isActive ? "#0f172a" : "#475569",
  boxShadow: isActive ? "0 10px 20px rgba(15,23,42,0.08)" : "none",
  cursor: isActive ? "default" : "pointer",
});

const cardStyle = {
  backgroundColor: "#ffffff",
  borderRadius: "20px",
  padding: "28px",
  boxShadow: "0 20px 45px rgba(15, 23, 42, 0.08)",
};

const cardHeaderStyle = {
  display: "flex",
  flexWrap: "wrap",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: "16px",
};

const cardTitleStyle = {
  fontSize: "22px",
  color: "#0f172a",
  fontWeight: 700,
};

const cardDescriptionStyle = {
  fontSize: "15px",
  color: "#64748b",
};

const filterWrapperStyle = {
  marginTop: "18px",
  border: "1px solid #e2e8f0",
  borderRadius: "14px",
  padding: "16px",
  backgroundColor: "#f8fafc",
};

const tableWrapperStyle = {
  marginTop: "24px",
  border: "1px solid #e2e8f0",
  borderRadius: "16px",
  overflow: "hidden",
};

const tableStyle = {
  width: "100%",
  borderCollapse: "collapse",
};

const tableHeaderStyle = {
  backgroundColor: "#0f172a",
  color: "#ffffff",
  textAlign: "left",
  padding: "14px 16px",
  fontSize: "13px",
  letterSpacing: "0.04em",
};

const tableCellStyle = {
  padding: "16px",
  borderBottom: "1px solid #e2e8f0",
  fontSize: "14px",
  color: "#0f172a",
};

const actionButtonBase = {
  border: "none",
  borderRadius: "10px",
  padding: "10px 16px",
  fontSize: "13px",
  fontWeight: 600,
  color: "#ffffff",
  cursor: "pointer",
};

const ivrGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: "16px",
  marginTop: "24px",
};

const ivrCardStyle = {
  backgroundColor: "#0f172a",
  color: "#ffffff",
  borderRadius: "18px",
  padding: "20px",
  display: "flex",
  flexDirection: "column",
  gap: "12px",
  cursor: "pointer",
};

const labelStyle = {
  fontSize: "14px",
  color: "#0f172a",
  fontWeight: 600,
};

const AllContent = () => {
  const [content, setContent] = useState([]);
  const [allContent, setAllContent] = useState([]);
  const [options, setOptions] = useState([]);
  const [updateIVRStatus, setUpdateIVRStatus] = useState("");
  const [activeTab, setActiveTab] = useState("content");
  const [currentUser, setCurrentUser] = useState("");
  const [teachers, setTeachers] = useState([]);
  const [selectedTeacherId, setSelectedTeacherId] = useState(null);
  const [teacherPhone, setTeacherPhone] = useState("");
  const [teacherPassword, setTeacherPassword] = useState("");
  const [teacherMessage, setTeacherMessage] = useState("");
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const ivrURL = process.env.REACT_APP_API_IVRV2_URL;

  const getAuthHeaders = () => {
    const token = localStorage.getItem("authToken");
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    };
  };

  useEffect(() => {
    const token = localStorage.getItem("authToken");
    if (!token) {
      navigate("/");
      return;
    }

    if (location.state?.name) {
      setCurrentUser(location.state.name);
    } else {
      setCurrentUser("User");
    }
  }, [location.state, navigate]);

  const onUpdateIVR = async () => {
    try {
      const response = await fetch(`${ivrURL}/updateivr`, {
        method: "POST",
        headers: getAuthHeaders(),
      });
      const data = await response.json();
      setUpdateIVRStatus(data.message);
    } catch (error) {
      setUpdateIVRStatus("Unable to update IVR right now.");
    }
  };

  const sortContentByCreationTime = (contentArray) =>
    contentArray.sort((a, b) => b.creation_time - a.creation_time);

  const generateOptions = (contentList) => {
    const languageSet = new Set();
    const experienceSet = new Set();

    contentList.forEach((contentItem) => {
      if (contentItem.language) {
        languageSet.add(
          contentItem.language.charAt(0).toUpperCase() +
            contentItem.language.slice(1)
        );
      }
      if (contentItem.type) {
        experienceSet.add(
          contentItem.type.charAt(0).toUpperCase() + contentItem.type.slice(1)
        );
      }
    });

    const languageOptions = Array.from(languageSet).map((language, index) => ({
      category: "Language",
      name: language,
      id: index + 1,
    }));

    const experienceOptions = Array.from(experienceSet).map(
      (experience, index) => ({
        category: "Experience",
        name: experience,
        id: index + 1 + languageSet.size,
      })
    );

    return [...languageOptions, ...experienceOptions];
  };

  const setFilteredList = (selectedList) => {
    let langs = selectedList
      .filter((option) => option.category === "Language")
      .map((option) => option.name.toLowerCase());

    let exps = selectedList
      .filter((option) => option.category === "Experience")
      .map((option) => option.name.toLowerCase());

    if (exps.length === 0) {
      exps = options
        .filter((value) => value.category === "Experience")
        .map((value) => value.name.toLowerCase());
    }

    if (langs.length === 0) {
      langs = options
        .filter((value) => value.category === "Language")
        .map((value) => value.name.toLowerCase());
    }

    const filteredList = allContent.filter(
      (contentItem) =>
        langs.includes(contentItem.language.toLowerCase()) &&
        exps.includes(contentItem.type.toLowerCase())
    );
    setContent(sortContentByCreationTime(filteredList));
  };

  useEffect(() => {
    const getContent = async () => {
      const contentFromServer = await getAllContent();
      const contentFromServerNotDeleted = contentFromServer.data.filter(
        (item) => !item.isDeleted
      );
      const sorted = sortContentByCreationTime(
        contentFromServerNotDeleted.slice()
      );
      setAllContent(sorted);
      setContent(sorted);
      setOptions(generateOptions(sorted));
    };
    getContent();
  }, []);

  useEffect(() => {
    if (activeTab === "registration") {
      fetchTeachers();
    }
  }, [activeTab]);

  const fetchTeachers = async () => {
    try {
      const tenantId = localStorage.getItem("tenantId");
      if (!tenantId) {
        return;
      }

      const response = await fetch(
        `${SEEDS_URL}/teacher/get-teachers?tenantId=${tenantId}`,
        {
          method: "GET",
          headers: getAuthHeaders(),
        }
      );

      if (response.ok) {
        const data = await response.json();
        const list = data.data || data || [];
        // augment teachers with local UI state for adding students
        const withState = list.map((t) => ({
          ...t,
          newStudents: [{ name: "", phoneNumber: "" }],
          submitting: false,
        }));
        setTeachers(withState);
        // set default selection to first teacher if none selected
        setSelectedTeacherId(
          (prev) => prev || withState[0]?._id || withState[0]?.id || null
        );
      }
    } catch (error) {
      console.error("Error fetching teachers:", error);
    }
  };

  // Helpers for add-students UI
  const updateTeacherState = (id, patch) => {
    setTeachers((prev) =>
      prev.map((t) => (String(t._id) === String(id) ? { ...t, ...patch } : t))
    );
  };

  const addStudentRow = (teacherId) => {
    setTeachers((prev) =>
      prev.map((t) =>
        String(t._id) !== String(teacherId)
          ? t
          : {
              ...t,
              newStudents: [
                ...(t.newStudents || []),
                { name: "", phoneNumber: "" },
              ],
            }
      )
    );
  };

  const removeStudentRow = (teacherId, index) => {
    setTeachers((prev) =>
      prev.map((t) => {
        if (String(t._id) !== String(teacherId)) return t;
        const arr = [...(t.newStudents || [])];
        arr.splice(index, 1);
        return {
          ...t,
          newStudents: arr.length ? arr : [{ name: "", phoneNumber: "" }],
        };
      })
    );
  };

  const setNewStudentValue = (teacherId, index, field, value) => {
    setTeachers((prev) =>
      prev.map((t) => {
        if (String(t._id) !== String(teacherId)) return t;
        const arr = (t.newStudents || []).map((s, i) =>
          i === index ? { ...s, [field]: value } : s
        );
        return { ...t, newStudents: arr };
      })
    );
  };

  const submitNewStudents = async (teacher) => {
    const payloadStudents = (teacher.newStudents || [])
      .map((s) => ({
        name: (s.name || "").trim(),
        phoneNumber: (s.phoneNumber || "").trim(),
      }))
      .filter((s) => s.name && s.phoneNumber);

    if (payloadStudents.length === 0) {
      setTeacherMessage(
        "Please enter at least one student with name and phone number."
      );
      return;
    }

    updateTeacherState(teacher._id, { submitting: true });
    try {
      const res = await fetch(`${SEEDS_URL}/teacher/add-students`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          phoneNumber: teacher.phoneNumber,
          students: payloadStudents,
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText || `Failed to add students (${res.status})`);
      }

      const added = await res.json();
      // Append returned students to local list and reset form
      updateTeacherState(teacher._id, {
        students: [...(teacher.students || []), ...added],
        newStudents: [{ name: "", phoneNumber: "" }],
      });
      setTeacherMessage("Students added successfully.");
    } catch (err) {
      console.error("Add students error:", err);
      setTeacherMessage(err.message || "Failed to add students.");
    } finally {
      updateTeacherState(teacher._id, { submitting: false });
      // Clear message after a short delay
      setTimeout(() => setTeacherMessage(""), 3000);
    }
  };

  const getAllContent = async () => {
    const seedsRes = await fetch(`${SEEDS_URL}/content`, {
      method: "GET",
      headers: getAuthHeaders(),
    });
    const seedsData = await seedsRes.json();
    return seedsData;
  };

  const onDelete = async (type, id) => {
    if (window.confirm("Are you sure?")) {
      if (type === "quiz") {
        await fetch(
          "https://place-seeds.azurewebsites.net/byId?" +
            new URLSearchParams({
              id: id,
              type: "quiz",
            }),
          {
            method: "DELETE",
          }
        );
      } else {
        await fetch(`${SEEDS_URL}/content/${id}`, {
          method: "DELETE",
          headers: getAuthHeaders(),
        });
      }
      setContent(
        sortContentByCreationTime(content.filter((item) => item.id !== id))
      );
    }
  };

  const onView = (type, id) => {
    navigate(`/content/detail/${type}/${id}`);
  };
  const onEdit = (type, id) => {
    navigate(`/content/edit/${type}/${id}`);
  };

  return (
    <div style={pageStyle}>
      <div style={containerStyle}>
        <div style={headerCardStyle}>
          <div style={headerTopStyle}>
            <div style={headerTextStyle}>
              <div style={{ fontSize: "24px", color: "#f97316" }}>🌱</div>
              <span>SEEDS</span>
            </div>
            <div style={actionGroupStyle}>
              <button
                style={navLinkStyle(activeTab === "content")}
                onClick={() => setActiveTab("content")}
              >
                Content
              </button>
              <button
                style={navLinkStyle(activeTab === "registration")}
                onClick={() => setActiveTab("registration")}
              >
                Registration
              </button>
              <button
                style={navLinkStyle(activeTab === "analytics")}
                onClick={() => setActiveTab("analytics")}
              >
                Analytics
              </button>
            </div>
          </div>
          <div style={userDropdownContainerStyle}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                cursor: "pointer",
              }}
              onClick={() => setShowUserDropdown(!showUserDropdown)}
            >
              <span style={{ fontSize: "14px", color: "#64748b" }}>
                Welcome, {currentUser}
              </span>
              <div style={userAvatarStyle}>
                {currentUser.substring(0, 2).toUpperCase()}
              </div>
            </div>
            {showUserDropdown && (
              <div style={userDropdownStyle}>
                <button
                  style={dropdownItemStyle}
                  onMouseEnter={(e) =>
                    (e.target.style.backgroundColor = "#f8fafc")
                  }
                  onMouseLeave={(e) =>
                    (e.target.style.backgroundColor = "transparent")
                  }
                  onClick={() => {
                    setShowUserDropdown(false);
                    navigate("/profile");
                  }}
                >
                  Profile
                </button>
                <button
                  style={{
                    ...dropdownItemStyle,
                    borderTop: "1px solid #e2e8f0",
                  }}
                  onMouseEnter={(e) =>
                    (e.target.style.backgroundColor = "#f8fafc")
                  }
                  onMouseLeave={(e) =>
                    (e.target.style.backgroundColor = "transparent")
                  }
                  onClick={() => {
                    setShowUserDropdown(false);
                    localStorage.removeItem("authToken");
                    localStorage.removeItem("tenantId");
                    navigate("/");
                  }}
                >
                  Logout
                </button>
              </div>
            )}
          </div>
        </div>
        {updateIVRStatus && (
          <div
            style={{ fontSize: "14px", color: "#16a34a", padding: "12px 32px" }}
          >
            {updateIVRStatus}
          </div>
        )}

        {activeTab !== "registration" && (
          <div style={tabsContainerStyle}>
            <button
              type="button"
              style={tabButtonStyle(activeTab === "content")}
              onClick={() => setActiveTab("content")}
            >
              Audio Content
            </button>
            <button
              type="button"
              style={tabButtonStyle(activeTab === "ivr")}
              onClick={() => setActiveTab("ivr")}
            >
              IVR Setup
            </button>
          </div>
        )}

        {activeTab === "content" && (
          <div style={cardStyle}>
            <div style={cardHeaderStyle}>
              <div>
                <div style={cardTitleStyle}>Audio Content Library</div>
                <div style={cardDescriptionStyle}>
                  Add and manage educational audio files
                </div>
              </div>
              <div style={{ display: "flex", gap: "12px" }}>
                <button
                  style={primaryButtonStyle}
                  onClick={() => setContent(allContent)}
                >
                  Reset Filters
                </button>
                <button
                  style={{ ...primaryButtonStyle, backgroundColor: "#059669" }}
                  onClick={() => navigate("/content/create")}
                >
                  + Add Content
                </button>
              </div>
            </div>

            <div style={filterWrapperStyle}>
              <p
                style={{
                  marginBottom: "8px",
                  color: "#0f172a",
                  fontWeight: 600,
                }}
              >
                Filter content
              </p>
              <Multiselect
                options={options}
                onSelect={(selectedList) => setFilteredList(selectedList)}
                onRemove={(selectedList) => setFilteredList(selectedList)}
                displayValue="name"
                groupBy="category"
                style={{
                  chips: {
                    background: "#0f172a",
                  },
                  multiselectContainer: {
                    color: "#0f172a",
                  },
                  option: {
                    color: "#0f172a",
                  },
                }}
              />
            </div>

            <div style={tableWrapperStyle}>
              {content.length === 0 ? (
                <div
                  style={{
                    padding: "32px",
                    textAlign: "center",
                    color: "#64748b",
                    fontWeight: 600,
                  }}
                >
                  No content found.
                </div>
              ) : (
                <table style={tableStyle}>
                  <thead>
                    <tr>
                      <th style={tableHeaderStyle}>Title</th>
                      <th style={tableHeaderStyle}>Theme</th>
                      <th style={tableHeaderStyle}>Uploaded</th>
                      <th style={tableHeaderStyle}>Language</th>
                      <th style={tableHeaderStyle}>Type</th>
                      <th style={tableHeaderStyle}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {content.map((item) => (
                      <tr key={item.id} style={{ backgroundColor: "#ffffff" }}>
                        <td style={tableCellStyle}>
                          {item.title && typeof item.title === "object"
                            ? item.title.english
                            : item.title}
                          <br />
                          <span style={{ color: "#94a3b8" }}>
                            {item.title && typeof item.title === "object"
                              ? item.title.local
                              : item.localTitle}
                          </span>
                        </td>
                        <td style={tableCellStyle}>
                          {item.theme && typeof item.theme === "object"
                            ? item.theme.english
                            : item.theme}
                          <br />
                          <span style={{ color: "#94a3b8" }}>
                            {item.theme && typeof item.theme === "object"
                              ? item.theme.local
                              : item.localTheme}
                          </span>
                        </td>
                        <td style={tableCellStyle}>
                          {item.isTeacherApp && "TA"}
                          {item.isPullModel && ", IVR"}
                          {item.type === "quiz" && " IVR"}
                        </td>
                        <td style={tableCellStyle}>{item.language}</td>
                        <td style={tableCellStyle}>{item.type}</td>
                        <td style={{ ...tableCellStyle }}>
                          <div
                            style={{
                              display: "flex",
                              gap: "8px",
                              flexWrap: "wrap",
                            }}
                          >
                            <button
                              onClick={() => onEdit(item.type, item.id)}
                              style={{
                                ...actionButtonBase,
                                backgroundColor: "#eab308",
                                color: "#1f2937",
                              }}
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => onView(item.type, item.id)}
                              style={{
                                ...actionButtonBase,
                                backgroundColor: "#0ea5e9",
                              }}
                            >
                              View
                            </button>
                            <button
                              onClick={() => onDelete(item.type, item.id)}
                              style={{
                                ...actionButtonBase,
                                backgroundColor: "#ef4444",
                              }}
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {activeTab === "ivr" && (
          <div style={cardStyle}>
            <div style={cardHeaderStyle}>
              <div>
                <div style={cardTitleStyle}>IVR System Configuration</div>
                <div style={cardDescriptionStyle}>
                  Configure Interactive Voice Response settings
                </div>
              </div>
            </div>

            <div style={ivrGridStyle}>
              <div
                style={{ ...ivrCardStyle, backgroundColor: "#0f172a" }}
                onClick={() => navigate("/ivr")}
              >
                <h3 style={{ margin: 0, fontSize: "18px" }}>IVR Usage</h3>
                <p style={{ margin: 0, color: "rgba(255,255,255,0.8)" }}>
                  Monitor how your IVR tree performs.
                </p>
              </div>
              <div
                style={{ ...ivrCardStyle, backgroundColor: "#1d4ed8" }}
                onClick={() => navigate("/viewivr")}
              >
                <h3 style={{ margin: 0, fontSize: "18px" }}>Visualise IVR</h3>
                <p style={{ margin: 0, color: "rgba(255,255,255,0.8)" }}>
                  View the full IVR flow in one place.
                </p>
              </div>
              <div
                style={{ ...ivrCardStyle, backgroundColor: "#047857" }}
                onClick={() => navigate("/bulkcall")}
              >
                <h3 style={{ margin: 0, fontSize: "18px" }}>Mass Call</h3>
                <p style={{ margin: 0, color: "rgba(255,255,255,0.8)" }}>
                  Initiate bulk outreach campaigns instantly.
                </p>
              </div>
            </div>
          </div>
        )}

        {activeTab === "registration" && (
          <div
            style={{
              ...cardStyle,
              display: "flex",
              flexDirection: "column",
              gap: "24px",
            }}
          >
            <div>
              <div style={cardTitleStyle}>Registration Management</div>
              <div style={cardDescriptionStyle}>
                Register teachers for your organization.
              </div>
            </div>
            <div
              style={{
                border: "1px solid #e2e8f0",
                borderRadius: "18px",
                padding: "20px",
                backgroundColor: "#f8fafc",
                display: "flex",
                flexDirection: "column",
                gap: "14px",
              }}
            >
              <h3 style={{ margin: 0, color: "#0f172a" }}>Register Teacher</h3>
              <label
                style={{ ...labelStyle, marginBottom: "0" }}
                htmlFor="teacher-phone"
              >
                Phone Number
              </label>
              <input
                id="teacher-phone"
                type="tel"
                placeholder="Enter phone number"
                value={teacherPhone}
                onChange={(e) => {
                  const value = e.target.value.replace(/\D/g, "");
                  if (value.length <= 10) {
                    setTeacherPhone(value);
                  }
                }}
                maxLength={10}
                style={{
                  width: "100%",
                  borderRadius: "10px",
                  border: "1px solid #cbd5f5",
                  padding: "12px",
                  fontSize: "15px",
                }}
              />
              <label
                style={{ ...labelStyle, marginBottom: "0" }}
                htmlFor="teacher-password"
              >
                Password
              </label>
              <input
                id="teacher-password"
                type="password"
                placeholder="Set a password"
                value={teacherPassword}
                onChange={(e) => setTeacherPassword(e.target.value)}
                style={{
                  width: "100%",
                  borderRadius: "10px",
                  border: "1px solid #cbd5f5",
                  padding: "12px",
                  fontSize: "15px",
                }}
              />
              <button
                type="button"
                style={{
                  ...primaryButtonStyle,
                  width: "100%",
                  marginTop: "8px",
                }}
                onClick={async () => {
                  if (!teacherPhone || !teacherPassword) {
                    setTeacherMessage("Phone and password are required.");
                    return;
                  }

                  if (teacherPhone.length !== 10) {
                    setTeacherMessage(
                      "Phone number must be exactly 10 digits."
                    );
                    return;
                  }

                  try {
                    const tenantId = localStorage.getItem("tenantId");
                    if (!tenantId) {
                      setTeacherMessage(
                        "Tenant ID not found. Please log in again."
                      );
                      return;
                    }

                    const response = await fetch(
                      `${SEEDS_URL}/teacher/register`,
                      {
                        method: "POST",
                        headers: getAuthHeaders(),
                        body: JSON.stringify({
                          tenantId: tenantId,
                          phoneNumber: teacherPhone,
                          password: teacherPassword,
                        }),
                      }
                    );

                    if (response.ok) {
                      const data = await response.json();
                      setTeacherPhone("");
                      setTeacherPassword("");
                      setTeacherMessage("Teacher registered successfully!");
                      // Refresh the teachers list
                      await fetchTeachers();
                    } else {
                      const errorData = await response.json();
                      setTeacherMessage(
                        errorData.message || "Failed to register teacher."
                      );
                    }
                  } catch (error) {
                    console.error("Teacher registration error:", error);
                    setTeacherMessage(
                      "Error registering teacher. Please try again."
                    );
                  }
                }}
              >
                Save Teacher
              </button>
              {teacherMessage && (
                <p style={{ color: "#16a34a", fontSize: "13px", margin: 0 }}>
                  {teacherMessage}
                </p>
              )}
            </div>

            <div style={{ marginTop: 24 }}>
              <h3 style={{ marginBottom: "12px", color: "#0f172a" }}>
                Teachers & Students
              </h3>
              {teachers.length === 0 ? (
                <div
                  style={{
                    border: "1px solid #e2e8f0",
                    borderRadius: "16px",
                    padding: "24px",
                    textAlign: "center",
                    color: "#94a3b8",
                  }}
                >
                  No teachers available.
                </div>
              ) : (
                <div style={{ display: "flex", gap: 16 }}>
                  {/* Left pane: teacher list */}
                  <div
                    style={{
                      width: 320,
                      border: "1px solid #e2e8f0",
                      borderRadius: 12,
                      padding: 12,
                      background: "#fff",
                      maxHeight: 560,
                      overflowY: "auto",
                    }}
                  >
                    <div style={{ fontWeight: 700, marginBottom: 8 }}>
                      Teachers
                    </div>
                    <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                      {teachers.map((tt) => (
                        <li key={tt._id} style={{ marginBottom: 8 }}>
                          <button
                            type="button"
                            onClick={() => setSelectedTeacherId(tt._id)}
                            style={{
                              width: "100%",
                              textAlign: "left",
                              padding: "8px 10px",
                              borderRadius: 8,
                              border: "1px solid transparent",
                              background:
                                String(tt._id) === String(selectedTeacherId)
                                  ? "#e6eefc"
                                  : "transparent",
                              cursor: "pointer",
                            }}
                          >
                            {tt.phoneNumber}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Right pane: selected teacher details */}
                  <div
                    style={{
                      flex: 1,
                      border: "1px solid #e2e8f0",
                      borderRadius: 12,
                      padding: 12,
                      background: "#fff",
                      maxHeight: 560,
                      overflowY: "auto",
                    }}
                  >
                    {selectedTeacherId ? (
                      (() => {
                        const teacher = teachers.find(
                          (x) => String(x._id) === String(selectedTeacherId)
                        );
                        if (!teacher)
                          return (
                            <div style={{ color: "#94a3b8" }}>
                              Teacher not found.
                            </div>
                          );
                        return (
                          <div>
                            <div
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                              }}
                            >
                              <div style={{ fontWeight: 700 }}>Students</div>
                              <div style={{ color: "#64748b", fontSize: 13 }}>
                                Teacher: {teacher.phoneNumber}
                              </div>
                            </div>

                            <div style={{ marginTop: 12 }}>
                              <div style={{ overflowX: "auto" }}>
                                <table
                                  style={{
                                    width: "100%",
                                    borderCollapse: "collapse",
                                  }}
                                >
                                  <thead>
                                    <tr>
                                      <th
                                        style={{
                                          textAlign: "left",
                                          padding: 8,
                                          borderBottom: "1px solid #e2e8f0",
                                        }}
                                      >
                                        Name
                                      </th>
                                      <th
                                        style={{
                                          textAlign: "left",
                                          padding: 8,
                                          borderBottom: "1px solid #e2e8f0",
                                        }}
                                      >
                                        Phone
                                      </th>
                                      <th
                                        style={{
                                          textAlign: "left",
                                          padding: 8,
                                          borderBottom: "1px solid #e2e8f0",
                                        }}
                                      >
                                        Actions
                                      </th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {(teacher.students || []).length === 0 ? (
                                      <tr>
                                        <td
                                          colSpan={3}
                                          style={{
                                            padding: 12,
                                            color: "#94a3b8",
                                          }}
                                        >
                                          No students
                                        </td>
                                      </tr>
                                    ) : (
                                      (teacher.students || []).map((s, i) => (
                                        <tr key={i}>
                                          <td
                                            style={{
                                              padding: 8,
                                              borderBottom: "1px solid #f1f5f9",
                                            }}
                                          >
                                            {s.name}
                                          </td>
                                          <td
                                            style={{
                                              padding: 8,
                                              borderBottom: "1px solid #f1f5f9",
                                            }}
                                          >
                                            {s.phoneNumber}
                                          </td>
                                          <td
                                            style={{
                                              padding: 8,
                                              borderBottom: "1px solid #f1f5f9",
                                            }}
                                          >
                                            <button
                                              type="button"
                                              onClick={async () => {
                                                try {
                                                  const payload = {
                                                    phoneNumber:
                                                      teacher.phoneNumber,
                                                    students: [
                                                      {
                                                        phoneNumber:
                                                          s.phoneNumber,
                                                      },
                                                    ],
                                                    remove: true,
                                                  };
                                                  const res = await fetch(
                                                    `${SEEDS_URL}/teacher/remove-students`,
                                                    {
                                                      method: "POST",
                                                      headers: getAuthHeaders(),
                                                      body: JSON.stringify(
                                                        payload
                                                      ),
                                                    }
                                                  );
                                                  if (res.ok) {
                                                    updateTeacherState(
                                                      teacher._id,
                                                      {
                                                        students: (
                                                          teacher.students || []
                                                        ).filter(
                                                          (st) =>
                                                            st.phoneNumber !==
                                                            s.phoneNumber
                                                        ),
                                                      }
                                                    );
                                                  } else {
                                                    console.error(
                                                      "Failed to remove student"
                                                    );
                                                  }
                                                } catch (err) {
                                                  console.error(err);
                                                }
                                              }}
                                              style={{
                                                ...actionGhostButtonStyle,
                                              }}
                                            >
                                              Remove
                                            </button>
                                          </td>
                                        </tr>
                                      ))
                                    )}
                                  </tbody>
                                </table>
                              </div>
                            </div>

                            <div style={{ marginTop: 12 }}>
                              <strong>Add students (multiple):</strong>
                              {(teacher.newStudents || []).map((s, i) => (
                                <div
                                  key={i}
                                  style={{
                                    display: "flex",
                                    gap: 8,
                                    marginTop: 8,
                                    alignItems: "center",
                                  }}
                                >
                                  <input
                                    placeholder="Name"
                                    value={s.name}
                                    onChange={(e) =>
                                      setNewStudentValue(
                                        teacher._id,
                                        i,
                                        "name",
                                        e.target.value
                                      )
                                    }
                                    style={{
                                      padding: 8,
                                      borderRadius: 8,
                                      border: "1px solid #e2e8f0",
                                    }}
                                  />
                                  <input
                                    placeholder="Phone number"
                                    value={s.phoneNumber}
                                    onChange={(e) =>
                                      setNewStudentValue(
                                        teacher._id,
                                        i,
                                        "phoneNumber",
                                        e.target.value
                                      )
                                    }
                                    style={{
                                      padding: 8,
                                      borderRadius: 8,
                                      border: "1px solid #e2e8f0",
                                    }}
                                  />
                                  <button
                                    type="button"
                                    onClick={() =>
                                      removeStudentRow(teacher._id, i)
                                    }
                                    style={{ ...actionGhostButtonStyle }}
                                  >
                                    Remove
                                  </button>
                                </div>
                              ))}

                              <div style={{ marginTop: 12 }}>
                                <button
                                  type="button"
                                  onClick={() => addStudentRow(teacher._id)}
                                  style={{ ...secondaryButtonStyle }}
                                >
                                  + Add another student
                                </button>
                                <button
                                  type="button"
                                  onClick={() => submitNewStudents(teacher)}
                                  style={{
                                    ...primaryButtonStyle,
                                    marginLeft: 8,
                                  }}
                                  disabled={teacher.submitting}
                                >
                                  {teacher.submitting
                                    ? "Adding…"
                                    : "Submit students"}
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })()
                    ) : (
                      <div style={{ color: "#94a3b8" }}>
                        Select a teacher to view details.
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AllContent;
