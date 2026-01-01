import React, { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useContent } from "../hooks/useContent";
import { useContentFilters } from "../hooks/useContentFilters";
import { useTeachers } from "../hooks/useTeachers";
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
    resetFilters,
    setContent,
    setIsFiltered,
  } = useContent();

  const { options, handleFilterChange } = useContentFilters(allContent, setContent, setIsFiltered);

  const {
    teachers,
    selectedTeacher,
    selectedTeacherId,
    setSelectedTeacherId,
    message,
    registerTeacher,
    addStudentRow,
    removeStudentRow,
    setNewStudentValue,
    submitNewStudents,
    removeStudent,
  } = useTeachers(activeTab);

  const ivrURL = process.env.REACT_APP_API_IVRV2_URL;

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
          currentUser={getCurrentUser()}
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
            onFilterChange={handleFilterChange}
            onResetFilters={resetFilters}
            onUpdateIVR={handleUpdateIVR}
            onEdit={handleEdit}
            onView={handleView}
            onDelete={deleteContent}
            onLoadMore={loadMore}
            isUpdatingIVR={isUpdatingIVR}
          />
        )}

        {activeTab === "ivr" && <IVRTab />}

        {activeTab === "analytics" && <AnalyticsTab />}

        {activeTab === "registration" && (
          <RegistrationTab
            teachers={teachers}
            selectedTeacher={selectedTeacher}
            selectedTeacherId={selectedTeacherId}
            onSelectTeacher={setSelectedTeacherId}
            onRegisterTeacher={registerTeacher}
            message={message}
            onAddStudentRow={addStudentRow}
            onRemoveStudentRow={removeStudentRow}
            onSetNewStudentValue={setNewStudentValue}
            onSubmitNewStudents={submitNewStudents}
            onRemoveStudent={removeStudent}
          />
        )}
      </div>
    </div>
  );
};

export default AllContent;
