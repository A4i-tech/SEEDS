import React, { useState, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useContent } from "../hooks/useContent";
import { useContentFilters } from "../hooks/useContentFilters";
import { useTeachers } from "../hooks/useTeachers";
import { useSchools } from "../hooks/useSchools";
import { ivrService } from "../services/ivrService";
import { getRole } from "../utils/authHelpers";
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
  const [currentUserRole, setCurrentUserRole] = useState(() => getRole() || null);

  const navigate = useNavigate();
  const { getAuthHeaders, logout, getCurrentUser } = useAuth();
  const canViewContent = currentUserRole !== null;
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
  const canViewRegistration =
    currentUserRole === USER_ROLES.TENANT || currentUserRole === USER_ROLES.SCHOOL_ADMIN;
  const canViewAnalytics = canViewRegistration;
  const canDeleteContent = currentUserRole !== USER_ROLES.TEACHER;

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const profile = await getCurrentUser();
        if (profile.name) {
          setCurrentUser(profile.name);
        }
        if (profile.role) {
          setCurrentUserRole(profile.role);
        }
      } catch (error) {
        console.error("Error fetching user:", error);
      }
    };
    fetchUser();
  }, [getCurrentUser]);

  useEffect(() => {
    if (!canViewContent && activeTab === "content") {
      setActiveTab(canViewRegistration ? "registration" : canViewAnalytics ? "analytics" : "content");
      return;
    }
    if ((!canViewRegistration && activeTab === "registration") || (!canViewAnalytics && activeTab === "analytics")) {
      setActiveTab("content");
    }
  }, [activeTab, canViewAnalytics, canViewContent, canViewRegistration]);

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

  const handleEdit = useCallback(
    (type, id) => {
      if (type === "subodha_course") {
        navigate(`/subodha/${id}`);
        return;
      }
      navigate(`/content/edit/${type}/${id}`);
    },
    [navigate]
  );

  const handleView = useCallback(
    (type, id) => {
      if (type === "subodha_course") {
        navigate(`/subodha/${id}`);
        return;
      }
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
          showContent={canViewContent}
          showRegistration={canViewRegistration}
          showAnalytics={canViewAnalytics}
        />

        {updateIVRStatus && <div className="status-message">{updateIVRStatus}</div>}

        {canViewContent && activeTab !== "registration" && activeTab !== "analytics" && (
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

        {canViewContent && activeTab === "content" && (
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
            onDelete={canDeleteContent ? deleteContent : null}
            onLoadMore={loadMore}
            isUpdatingIVR={isUpdatingIVR}
            multiselectRef={multiselectRef}
          />
        )}

        {canViewContent && activeTab === "ivr" && <IVRTab />}

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
