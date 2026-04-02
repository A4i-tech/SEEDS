import React, { useState, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useContent } from "../hooks/useContent";
import { useContentFilters } from "../hooks/useContentFilters";
import { useTeachers } from "../hooks/useTeachers";
import { useSchools } from "../hooks/useSchools";
import { ivrService } from "../services/ivrService";
import AppHeader from "./AllContent/Header/AppHeader";
import ContentTab from "./AllContent/ContentTab/ContentTab";
import IVRTab from "./AllContent/IVRTab/IVRTab";
import RegistrationTab from "./AllContent/RegistrationTab/RegistrationTab";
import AnalyticsTab from "./AllContent/AnalyticsTab/AnalyticsTab";
import "./AllContent/AllContent.css";
import "./AllContent/shared/responsive.css";

const AllContent = () => {
  const [activeTab, setActiveTab] = useState("content");
  const [updateIVRStatus, setUpdateIVRStatus] = useState("");
  const [isUpdatingIVR, setIsUpdatingIVR] = useState(false);
  const [currentUser, setCurrentUser] = useState("User");

  const navigate = useNavigate();
  const { getAuthHeaders, logout, getCurrentUser } = useAuth();
  const {
    content,
    allContent,
    isLoading,
    paginationInfo,
    isFiltered,
    loadMore,
    deleteContent,
    setContent,
    setIsFiltered,
  } = useContent();

  const {
    options,
    selectedValues,
    handleFilterChange,
    resetFilters: resetContentFilters,
    multiselectRef,
  } = useContentFilters(allContent, setContent, setIsFiltered);

  const { teachers, students, message, registerTeacher, addStudent, updateStudent, deleteStudent, updateTeacher, deleteTeacher, transferTeacher } =
    useTeachers(activeTab);

  const { schools, message: schoolMessage, createSchool, updateSchool, deleteSchool } = useSchools(activeTab);

  const ivrURL = process.env.REACT_APP_API_IVRV2_URL;

  /**
   * Fetch current user on mount
   */
  useEffect(() => {
    const fetchUser = async () => {
      try {
        const userName = await getCurrentUser();
        setCurrentUser(userName);
      } catch (error) {
        console.error("Error fetching user:", error);
        setCurrentUser("User");
      }
    };
    fetchUser();
  }, [getCurrentUser]);

  /**
   * Handle IVR update
   */
  const handleUpdateIVR = useCallback(async () => {
    setIsUpdatingIVR(true);
    setUpdateIVRStatus("");

    try {
      const { message } = await ivrService.updateIVR(ivrURL, getAuthHeaders());
      setUpdateIVRStatus(message);
    } catch (error) {
      console.error("Update IVR error:", error);
      setUpdateIVRStatus(error.message || "Unable to update IVR right now.");
    } finally {
      setIsUpdatingIVR(false);
      setTimeout(() => setUpdateIVRStatus(""), 4000);
    }
  }, [ivrURL, getAuthHeaders]);

  /**
   * Handle content edit
   */
  const handleEdit = useCallback(
    (type, id) => {
      navigate(`/content/edit/${type}/${id}`);
    },
    [navigate]
  );

  /**
   * Handle content view
   */
  const handleView = useCallback(
    (type, id) => {
      navigate(`/content/detail/${type}/${id}`);
    },
    [navigate]
  );

  return (
    <div className="page">
      <div className="container">
        <AppHeader
          activeTab={activeTab}
          onTabChange={setActiveTab}
          currentUser={currentUser}
          onLogout={logout}
        />

        {updateIVRStatus && <div className="status-message">{updateIVRStatus}</div>}

        {activeTab !== "registration" && activeTab !== "analytics" && (
          <div className="tabs-container">
            <button
              type="button"
              className={`tab-button ${activeTab === "content" ? "active" : ""}`}
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
          <ContentTab
            content={content}
            allContent={allContent}
            isLoading={isLoading}
            paginationInfo={paginationInfo}
            isFiltered={isFiltered}
            options={options}
            selectedValues={selectedValues}
            onFilterChange={handleFilterChange}
            onResetFilters={resetContentFilters}
            onUpdateIVR={handleUpdateIVR}
            onEdit={handleEdit}
            onView={handleView}
            onDelete={deleteContent}
            onLoadMore={loadMore}
            isUpdatingIVR={isUpdatingIVR}
            multiselectRef={multiselectRef}
          />
        )}

        {activeTab === "ivr" && <IVRTab />}

        {activeTab === "analytics" && <AnalyticsTab />}

        {activeTab === "registration" && (
          <RegistrationTab
            teachers={teachers}
            students={students}
            onRegisterTeacher={registerTeacher}
            onAddStudent={addStudent}
            onUpdateStudent={updateStudent}
            onDeleteStudent={deleteStudent}
            onUpdateTeacher={updateTeacher}
            onDeleteTeacher={deleteTeacher}
            onTransferTeacher={transferTeacher}
            message={message}
            schools={schools}
            onCreateSchool={createSchool}
            onUpdateSchool={updateSchool}
            onDeleteSchool={deleteSchool}
            schoolMessage={schoolMessage}
          />
        )}
      </div>
    </div>
  );
};

export default AllContent;
