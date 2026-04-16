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
import { USER_ROLES } from "../Constants";
import "./AllContent/AllContent.css";
import "./AllContent/shared/responsive.css";

const AllContent = () => {
  const [activeTab, setActiveTab] = useState("content");
  const [updateIVRStatus, setUpdateIVRStatus] = useState("");
  const [isUpdatingIVR, setIsUpdatingIVR] = useState(false);
  const [currentUser, setCurrentUser] = useState("User");
  const [currentUserRole, setCurrentUserRole] = useState(null);

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

  const {
    teachers,
    students,
    message,
    messageType,
    registerTeacher,
    addStudent,
    updateStudentById,
    deleteStudentById,
    updateTeacher,
    deleteTeacher,
    transferTeacher,
  } = useTeachers(activeTab);

  const {
    schools,
    message: schoolMessage,
    messageType: schoolMessageType,
    createSchool,
    updateSchool,
    deleteSchool,
  } = useSchools(activeTab);

  const ivrURL = process.env.REACT_APP_API_IVRV2_URL;
  const isContentCreator = currentUserRole === USER_ROLES.CONTENT_CREATOR;
  const canViewRegistration = !isContentCreator;
  const canViewAnalytics = !isContentCreator;

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const profile = await getCurrentUser();
        const userName = profile?.name || profile?.tenantName || "User";
        setCurrentUser(userName);
        setCurrentUserRole(profile?.role || null);
      } catch (error) {
        console.error("Error fetching user:", error);
        setCurrentUser("User");
        setCurrentUserRole(null);
      }
    };
    fetchUser();
  }, [getCurrentUser]);

  useEffect(() => {
    if ((!canViewRegistration && activeTab === "registration") || (!canViewAnalytics && activeTab === "analytics")) {
      setActiveTab("content");
    }
  }, [activeTab, canViewAnalytics, canViewRegistration]);

  const handleUpdateIVR = useCallback(async () => {
    setIsUpdatingIVR(true);
    setUpdateIVRStatus("");

    try {
      const { message: nextMessage } = await ivrService.updateIVR(ivrURL, getAuthHeaders());
      setUpdateIVRStatus(nextMessage);
    } catch (error) {
      console.error("Update IVR error:", error);
      setUpdateIVRStatus(error.message || "Unable to update IVR right now.");
    } finally {
      setIsUpdatingIVR(false);
      setTimeout(() => setUpdateIVRStatus(""), 4000);
    }
  }, [ivrURL, getAuthHeaders]);

  const handleEdit = useCallback(
    (type, id) => {
      navigate(`/content/edit/${type}/${id}`);
    },
    [navigate]
  );

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
          showRegistration={canViewRegistration}
          showAnalytics={canViewAnalytics}
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

        {canViewAnalytics && activeTab === "analytics" && <AnalyticsTab />}

        {canViewRegistration && activeTab === "registration" && (
          <RegistrationTab
            teachers={teachers}
            students={students}
            onRegisterTeacher={registerTeacher}
            onAddStudent={addStudent}
            onUpdateStudent={updateStudentById}
            onDeleteStudent={deleteStudentById}
            onUpdateTeacher={updateTeacher}
            onDeleteTeacher={deleteTeacher}
            onTransferTeacher={transferTeacher}
            message={message}
            messageType={messageType}
            schools={schools}
            onCreateSchool={createSchool}
            onUpdateSchool={updateSchool}
            onDeleteSchool={deleteSchool}
            schoolMessage={schoolMessage}
            schoolMessageType={schoolMessageType}
          />
        )}
      </div>
    </div>
  );
};

export default AllContent;
