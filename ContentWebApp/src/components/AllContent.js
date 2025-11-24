import React, { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import Multiselect from "multiselect-react-dropdown";
import { SEEDS_URL } from "../Constants";
import "./allContent.css";

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

  // pagination and loading state for content listing
  const [paginationInfo, setPaginationInfo] = useState({
    nextCursor: null,
    hasMore: false,
    limit: 0,
  });
  const [isLoadingContent, setIsLoadingContent] = useState(false);
  const [isFiltered, setIsFiltered] = useState(false);

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
    setIsFiltered(true);
    setContent(filteredList);
  };

  useEffect(() => {
    const getContent = async () => {
      setIsLoadingContent(true);
      try {
        const { data, pagination } = await getAllContent();
        const initialItems = data || [];
        setAllContent(initialItems);
        setContent(initialItems);
        setOptions(generateOptions(initialItems));
        setPaginationInfo({
          nextCursor: pagination?.nextCursor || null,
          hasMore: !!pagination?.hasMore,
          limit: pagination?.limit || 0,
        });
        setIsFiltered(false);
      } catch (e) {
        console.error("Error fetching content:", e);
      } finally {
        setIsLoadingContent(false);
      }
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

  const PAGE_SIZE = 50;

  const getAllContent = async (cursor) => {
    const params = new URLSearchParams();
    params.append("limit", String(PAGE_SIZE));
    if (cursor) {
      params.append("cursor", cursor);
    }

    const seedsRes = await fetch(`${SEEDS_URL}/content?${params.toString()}`, {
      method: "GET",
      headers: getAuthHeaders(),
    });

    if (!seedsRes.ok) {
      const text = await seedsRes.text();
      throw new Error(text || `Failed to fetch content (${seedsRes.status})`);
    }

    const seedsData = await seedsRes.json();
    const data = seedsData.data || [];
    const pagination = seedsData.pagination || {};
    return { data, pagination };
  };

  const loadMoreContent = async () => {
    if (!paginationInfo.hasMore || !paginationInfo.nextCursor) return;

    setIsLoadingContent(true);
    try {
      const { data, pagination } = await getAllContent(paginationInfo.nextCursor);
      const newItems = data || [];
      if (!newItems.length) {
        setPaginationInfo({ nextCursor: null, hasMore: false, limit: paginationInfo.limit });
        return;
      }

      const existingIds = new Set(allContent.map((c) => c.id));
      const merged = [...allContent];
      newItems.forEach((item) => {
        if (!existingIds.has(item.id)) {
          merged.push(item);
        }
      });

      setAllContent(merged);
      if (!isFiltered) {
        setContent(merged);
      }
      setOptions(generateOptions(merged));
      setPaginationInfo({
        nextCursor: pagination?.nextCursor || null,
        hasMore: !!pagination?.hasMore,
        limit: pagination?.limit || paginationInfo.limit,
      });
    } catch (e) {
      console.error("Error loading more content:", e);
    } finally {
      setIsLoadingContent(false);
    }
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
      setContent(content.filter((item) => item.id !== id));
    }
  };

  const onView = (type, id) => {
    navigate(`/content/detail/${type}/${id}`);
  };
  const onEdit = (type, id) => {
    navigate(`/content/edit/${type}/${id}`);
  };

  return (
    <div className="page">
      <div className="container">
        <div className="header-card">
          <div className="header-top">
            <div className="header-text">
              <div className="seed-icon">🌱</div>
              <span>SEEDS</span>
            </div>
            <div className="action-group">
              <button
                className={`nav-link ${activeTab === "content" ? "active" : ""}`}
                onClick={() => setActiveTab("content")}
              >
                Content
              </button>
              <button
                className={`nav-link ${
                  activeTab === "registration" ? "active" : ""
                }`}
                onClick={() => setActiveTab("registration")}
              >
                Registration
              </button>
              <button
                className={`nav-link ${
                  activeTab === "analytics" ? "active" : ""
                }`}
                onClick={() => setActiveTab("analytics")}
              >
                Analytics
              </button>
            </div>
          </div>
          <div className="user-dropdown-container">
            <div
              className="user-info-wrapper"
              onClick={() => setShowUserDropdown(!showUserDropdown)}
            >
              <span className="welcome-text">Welcome, {currentUser}</span>
              <div className="user-avatar">
                {currentUser.substring(0, 2).toUpperCase()}
              </div>
            </div>
            {showUserDropdown && (
              <div className="user-dropdown">
                <button
                  className="dropdown-item"
                  onClick={() => {
                    setShowUserDropdown(false);
                    navigate("/profile");
                  }}
                >
                  Profile
                </button>
                <button
                  className="dropdown-item with-border"
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
          <div className="status-message">{updateIVRStatus}</div>
        )}

        {activeTab !== "registration" && (
          <div className="tabs-container">
            <button
              type="button"
              className={`tab-button ${
                activeTab === "content" ? "active" : ""
              }`}
              onClick={() => setActiveTab("content")}
            >
              Audio Content
            </button>
            <button
              type="button"
              className={`tab-button ${activeTab === "ivr" ? "active" : ""}`}
              onClick={() => setActiveTab("ivr")}
            >
              IVR Setup
            </button>
          </div>
        )}

        {activeTab === "content" && (
          <div className="card">
            <div className="card-header">
              <div>
                <div className="card-title">Audio Content Library</div>
                <div className="card-description">
                  Add and manage educational audio files
                </div>
              </div>
              <div className="button-group">
                <button
                  className="primary-button"
                  onClick={() => {
                    setIsFiltered(false);
                    setContent(allContent);
                  }}
                >
                  Reset Filters
                </button>
                <button
                  className="primary-button button-add-content"
                  onClick={() => navigate("/content/create")}
                >
                  + Add Content
                </button>
              </div>
            </div>

            <div className="filter-wrapper">
              <p className="filter-label">Filter content</p>
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

            <div className="table-wrapper">
              {isLoadingContent && content.length === 0 && (
                <div className="no-content">Loading content...</div>
              )}
              {!isLoadingContent && content.length === 0 ? (
                <div className="no-content">No content found.</div>
              ) : (
                <table className="content-table">
                  <thead>
                    <tr>
                      <th className="table-header">Title</th>
                      <th className="table-header">Theme</th>
                      <th className="table-header">Uploaded</th>
                      <th className="table-header">Language</th>
                      <th className="table-header">Type</th>
                      <th className="table-header">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {content.map((item) => (
                      <tr key={item.id} className="table-row-white">
                        <td className="table-cell">
                          {item.title && typeof item.title === "object"
                            ? item.title.english
                            : item.title}
                          <br />
                          <span className="table-cell-secondary">
                            {item.title && typeof item.title === "object"
                              ? item.title.local
                              : item.localTitle}
                          </span>
                        </td>
                        <td className="table-cell">
                          {item.theme && typeof item.theme === "object"
                            ? item.theme.english
                            : item.theme}
                          <br />
                          <span className="table-cell-secondary">
                            {item.theme && typeof item.theme === "object"
                              ? item.theme.local
                              : item.localTheme}
                          </span>
                        </td>
                        <td className="table-cell">
                          {item.isTeacherApp && "TA"}
                          {item.isPullModel && ", IVR"}
                          {item.type === "quiz" && " IVR"}
                        </td>
                        <td className="table-cell">{item.language}</td>
                        <td className="table-cell">{item.type}</td>
                        <td className="table-cell">
                          <div className="action-buttons-wrapper">
                            <button
                              onClick={() => onEdit(item.type, item.id)}
                              className="action-button-base action-button-edit"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => onView(item.type, item.id)}
                              className="action-button-base action-button-view"
                            >
                              View
                            </button>
                            <button
                              onClick={() => onDelete(item.type, item.id)}
                              className="action-button-base action-button-delete"
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

            {!isFiltered && paginationInfo.hasMore && (
              <div className="load-more-wrapper">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={loadMoreContent}
                  disabled={isLoadingContent}
                >
                  {isLoadingContent ? "Loading more..." : "Load more"}
                </button>
              </div>
            )}
          </div>
        )}

        {activeTab === "ivr" && (
          <div className="card">
            <div className="card-header">
              <div>
                <div className="card-title">IVR System Configuration</div>
                <div className="card-description">
                  Configure Interactive Voice Response settings
                </div>
              </div>
            </div>

            <div className="ivr-grid">
              <div
                className="ivr-card"
                onClick={() => navigate("/ivr")}
              >
                <h3 className="registration-title">IVR Usage</h3>
                <p className="placeholder-text">
                  Monitor how your IVR tree performs.
                </p>
              </div>
              <div
                className="ivr-card blue"
                onClick={() => navigate("/viewivr")}
              >
                <h3 className="registration-title">Visualise IVR</h3>
                <p className="placeholder-text">
                  View the full IVR flow in one place.
                </p>
              </div>
              <div
                className="ivr-card green"
                onClick={() => navigate("/bulkcall")}
              >
                <h3 className="registration-title">Mass Call</h3>
                <p className="placeholder-text">
                  Initiate bulk outreach campaigns instantly.
                </p>
              </div>
            </div>
          </div>
        )}

        {activeTab === "registration" && (
          <div className="card registration-flex-card">
            <div>
              <div className="card-title">Registration Management</div>
              <div className="card-description">
                Register teachers for your organization.
              </div>
            </div>
            <div className="registration-card">
              <h3 className="registration-title">Register Teacher</h3>
              <label className="label" htmlFor="teacher-phone">
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
                className="input-field"
              />
              <label className="label" htmlFor="teacher-password">
                Password
              </label>
              <input
                id="teacher-password"
                type="password"
                placeholder="Set a password"
                value={teacherPassword}
                onChange={(e) => setTeacherPassword(e.target.value)}
                className="input-field"
              />
              <button
                type="button"
                className="primary-button full-width-button"
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
                <p className="success-message">{teacherMessage}</p>
              )}
            </div>

            <div className="teachers-section">
              <h3 className="teachers-section-title">Teachers & Students</h3>
              {teachers.length === 0 ? (
                <div className="no-teachers">No teachers available.</div>
              ) : (
                <div className="teachers-layout">
                  {/* Left pane: teacher list */}
                  <div className="teachers-list-pane">
                    <div className="teachers-list-title">Teachers</div>
                    <ul className="teachers-list">
                      {teachers.map((tt) => (
                        <li key={tt._id} className="teacher-list-item">
                          <button
                            type="button"
                            onClick={() => setSelectedTeacherId(tt._id)}
                            className={`teacher-button ${
                              String(tt._id) === String(selectedTeacherId)
                                ? "selected"
                                : ""
                            }`}
                          >
                            {tt.phoneNumber}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Right pane: selected teacher details */}
                  <div className="teacher-details-pane">
                    {selectedTeacherId ? (
                      (() => {
                        const teacher = teachers.find(
                          (x) => String(x._id) === String(selectedTeacherId)
                        );
                        if (!teacher)
                          return (
                            <div className="placeholder-text">
                              Teacher not found.
                            </div>
                          );
                        return (
                          <div>
                            <div className="teacher-details-header">
                              <div className="students-title">Students</div>
                              <div className="teacher-info-text">
                                Teacher: {teacher.phoneNumber}
                              </div>
                            </div>

                            <div className="students-section">
                              <div className="table-scroll">
                                <table className="students-table">
                                  <thead>
                                    <tr>
                                      <th>Name</th>
                                      <th>Phone</th>
                                      <th>Actions</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {(teacher.students || []).length === 0 ? (
                                      <tr>
                                        <td
                                          colSpan={3}
                                          className="no-students-cell"
                                        >
                                          No students
                                        </td>
                                      </tr>
                                    ) : (
                                      (teacher.students || []).map((s, i) => (
                                        <tr key={i}>
                                          <td>{s.name}</td>
                                          <td>{s.phoneNumber}</td>
                                          <td>
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
                                              className="action-ghost-button"
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

                            <div className="add-students-section">
                              <strong>Add students (multiple):</strong>
                              {(teacher.newStudents || []).map((s, i) => (
                                <div
                                  key={i}
                                  className="add-students-row"
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
                                    className="add-students-input"
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
                                    className="add-students-input"
                                  />
                                  <button
                                    type="button"
                                    onClick={() =>
                                      removeStudentRow(teacher._id, i)
                                    }
                                    className="action-ghost-button"
                                  >
                                    Remove
                                  </button>
                                </div>
                              ))}

                              <div className="add-students-buttons">
                                <button
                                  type="button"
                                  onClick={() => addStudentRow(teacher._id)}
                                  className="secondary-button"
                                >
                                  + Add another student
                                </button>
                                <button
                                  type="button"
                                  onClick={() => submitNewStudents(teacher)}
                                  className="primary-button button-ml-8"
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
                      <div className="placeholder-text">
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
