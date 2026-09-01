import React, { useState } from "react";
import { useLocalization } from "../../../hooks/useLocalization";
import Dashboard from "./Dashboard";
import ProjectTable from "./ProjectTable";
import SiteTable from "./SiteTable";
import LanguageTable from "./LanguageTable";
import CreateProjectModal from "./CreateProjectModal";
import CreateSiteModal from "./CreateSiteModal";
import CreateLanguageModal from "./CreateLanguageModal";
import TranslationTab from "./TranslationTab";

import "./Localization.css";

const LocalizationTab = () => {
  // ==========================================
  // Navigation State
  // ==========================================

  const [activeTab, setActiveTab] = useState("dashboard");

  // ==========================================
  // Edit Project State
  // ==========================================

  const [editingProject, setEditingProject] = useState(null);

  const [editingSite, setEditingSite] = useState(null);

  const [editingLanguage, setEditingLanguage] = useState(null);

  // ==========================================
  // Localization Hook
  // ==========================================

  const {
    projects,

    sites,

    languages,

    handleCreateLanguage: createLanguage,
    handleUpdateLanguage: updateLanguage,
    handleDeleteLanguage: deleteLanguage,

    showProjectModal,
    setShowProjectModal,

    showSiteModal,
    setShowSiteModal,

    showLanguageModal,
    setShowLanguageModal,

    handleCreateProject,
    handleUpdateProject: updateProject,
    handleDeleteProject: deleteProject,

    handleCreateSite: createSite,
    handleUpdateSite: updateSite,
    handleDeleteSite: deleteSite,

    isLoadingWorkspace,
    workspaceLoadError,
  } = useLocalization();
  // ==========================================
// Persistent Localization Workspace
// ==========================================



  // ==========================================
  // Create Project
  // ==========================================

  const openCreateProject = () => {
    setEditingProject(null);
    setShowProjectModal(true);
  };

  // ==========================================
  // Edit Project
  // ==========================================

  const handleEditProject = (project) => {
    setEditingProject(project);
    setShowProjectModal(true);
  };

  // ==========================================
  // Update Project
  // ==========================================

  const handleUpdateProject = async (updatedProject) => {
    try {
      await updateProject(updatedProject.id, {
        name: updatedProject.name,
        description: updatedProject.description,
        sourceLanguage: updatedProject.sourceLanguage,
        status: updatedProject.status,
      });
    } catch (error) {
      alert(error.message || "Failed to update project.");
      return;
    }

    setEditingProject(null);
    setShowProjectModal(false);
  };
  // ==========================================
  // Delete Project
  // ==========================================

  const handleDeleteProject = async (id) => {
    const confirmDelete = window.confirm(
      "Are you sure you want to delete this project?"
    );

    if (!confirmDelete) return;

    try {
      await deleteProject(id);
    } catch (error) {
      alert(error.message || "Failed to delete project.");
    }
  };


  // ==========================================
// Site Actions
// ==========================================

const openCreateSite = () => {
  setEditingSite(null);

  setShowSiteModal(true);
};

const handleEditSite = (site) => {
  setEditingSite(site);
  setShowSiteModal(true);
};

const extractDomain = (url) => {
  const withProtocol = /^https?:\/\//i.test(url) ? url : `https://${url}`;

  try {
    return new URL(withProtocol).hostname;
  } catch (error) {
    return url;
  }
};

const handleCreateSite = async (site) => {
  try {
    await createSite({
      projectId: site.projectId,
      domain: extractDomain(site.url),
      name: site.name,
      status: site.status,
    });
  } catch (error) {
    alert(error.message || "Failed to register site.");
    return;
  }

  setEditingSite(null);

  setShowSiteModal(false);
};

const handleUpdateSite = async (updatedSite) => {
  try {
    await updateSite(updatedSite.id, {
      name: updatedSite.name,
      domain: extractDomain(updatedSite.url),
      status: updatedSite.status,
    });
  } catch (error) {
    alert(error.message || "Failed to update site.");
    return;
  }

  setEditingSite(null);
  setShowSiteModal(false);
};

const handleDeleteSite = async (id) => {
  const confirmDelete = window.confirm(
    "Are you sure you want to delete this site?"
  );

  if (!confirmDelete) return;

  try {
    await deleteSite(id);
  } catch (error) {
    alert(error.message || "Failed to delete site.");
  }
};


// ==========================================
// Language Actions
// ==========================================

const openCreateLanguage = () => {
  setEditingLanguage(null);
  setShowLanguageModal(true);
};

const handleEditLanguage = (language) => {
  setEditingLanguage(language);
  setShowLanguageModal(true);
};

const handleCreateLanguage = async (language) => {
  try {
    await createLanguage({
      name: language.name,
      code: language.code,
      direction: language.direction,
      enabled: language.enabled,
    });
  } catch (error) {
    alert(error.message || "Failed to create language.");
    return;
  }

  setEditingLanguage(null);
  setShowLanguageModal(false);
};

const handleUpdateLanguage = async (updatedLanguage) => {
  try {
    await updateLanguage(updatedLanguage.id, {
      name: updatedLanguage.name,
      code: updatedLanguage.code,
      direction: updatedLanguage.direction,
      enabled: updatedLanguage.enabled,
    });
  } catch (error) {
    alert(error.message || "Failed to update language.");
    return;
  }

  setEditingLanguage(null);
  setShowLanguageModal(false);
};

const handleDeleteLanguage = async (id) => {
  const confirmDelete = window.confirm(
    "Delete this language?"
  );

  if (!confirmDelete) return;

  try {
    await deleteLanguage(id);
  } catch (error) {
    alert(error.message || "Failed to delete language.");
  }
};

const handleToggleLanguage = async (id) => {
  const language = languages.find((item) => item.id === id);
  if (!language) return;

  try {
    await updateLanguage(id, { enabled: !language.enabled });
  } catch (error) {
    alert(error.message || "Failed to update language.");
  }
};

  // ==========================================
  // Modal Save
  // ==========================================

  const handleSaveProject = async (project) => {
    if (editingProject) {
      await handleUpdateProject(project);
    } else {
      try {
        await handleCreateProject(project);
      } catch (error) {
        alert(error.message || "Failed to create project.");
        return;
      }
      setShowProjectModal(false);
    }
  };

  // ==========================================
  // Modal Close
  // ==========================================

  const handleCloseModal = () => {
    setEditingProject(null);
    setShowProjectModal(false);
  };

  // ==========================================
  // Render Active Module
  // ==========================================

  const renderContent = () => {
    switch (activeTab) {
      case "projects":
        return (
          <ProjectTable
            projects={projects}
            onCreate={openCreateProject}
            onEdit={handleEditProject}
            onDelete={handleDeleteProject}
          />
        );

        case "sites":
          return (
            <SiteTable
              sites={sites}
              projects={projects}
              onCreate={openCreateSite}
              onEdit={handleEditSite}
              onDelete={handleDeleteSite}
            />
          );

      case "languages":
        return (
          <LanguageTable
            languages={languages}
            onCreate={openCreateLanguage}
            onEdit={handleEditLanguage}
            onDelete={handleDeleteLanguage}
            onToggleStatus={handleToggleLanguage}
          />
        );
      
      case "translate":
        return (
          <TranslationTab
            projects={projects}
            sites={sites}
            languages={languages}
          />
        );
        
      default:
        return (
          <Dashboard
            projectCount={projects.length}
            siteCount={sites.length}
            languageCount={languages.length}
          />
        );
    }
  };

  return (
    <div className="localization-container">

      {/* Header */}

      <div className="localization-header">
        <div>
          <h2>AI Native Localization Platform</h2>

          <p>
            Manage localization projects, websites and supported languages.
          </p>
        </div>
      </div>

      {/* Navigation */}

      <div className="localization-nav">

        <button
          className={`nav-btn ${
            activeTab === "dashboard" ? "active" : ""
          }`}
          onClick={() => setActiveTab("dashboard")}
        >
          Dashboard
        </button>

        <button
          className={`nav-btn ${
            activeTab === "projects" ? "active" : ""
          }`}
          onClick={() => setActiveTab("projects")}
        >
          Projects
        </button>

        <button
          className={`nav-btn ${
            activeTab === "sites" ? "active" : ""
          }`}
          onClick={() => setActiveTab("sites")}
        >
          Sites
        </button>

        <button
          className={`nav-btn ${
            activeTab === "languages" ? "active" : ""
          }`}
          onClick={() => setActiveTab("languages")}
        >
          Languages
        </button>

        <button
          className={`nav-btn ${
            activeTab === "translate" ? "active" : ""
          }`}
          onClick={() => setActiveTab("translate")}
        >
          Translate
        </button>

      </div>

      {/* Main Content */}

      <div className="localization-content">
        {isLoadingWorkspace ? (
          <p>Loading localization workspace...</p>
        ) : workspaceLoadError ? (
          <p className="status-inactive">{workspaceLoadError}</p>
        ) : (
          renderContent()
        )}
      </div>

      {/* Modal */}

      <CreateProjectModal
        isOpen={showProjectModal}
        editingProject={editingProject}
        onClose={handleCloseModal}
        onSave={handleSaveProject}
      />
      <CreateSiteModal
        isOpen={showSiteModal}
        editingSite={editingSite}
        projects={projects}
        onClose={() => {
          setEditingSite(null);
          setShowSiteModal(false);
        }}
        onSave={(site) => {
          if (editingSite) {
            handleUpdateSite(site);
          } else {
            handleCreateSite(site);
          }
        }}
      />
      <CreateLanguageModal
        isOpen={showLanguageModal}
        editingLanguage={editingLanguage}
        onClose={() => {
          setEditingLanguage(null);
          setShowLanguageModal(false);
        }}
        onSave={(language) => {
          if (editingLanguage) {
            handleUpdateLanguage(language);
          } else {
            handleCreateLanguage(language);
          }
        }}
      />

    </div>
  );
};

export default LocalizationTab;