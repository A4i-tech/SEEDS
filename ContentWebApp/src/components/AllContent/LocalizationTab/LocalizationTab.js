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
    setProjects,
  
    sites,
    setSites,
  
    languages,
    setLanguages,
  
    showProjectModal,
    setShowProjectModal,
  
    showSiteModal,
    setShowSiteModal,

    showLanguageModal,
    setShowLanguageModal,
  
    handleCreateProject,
  } = useLocalization();
  // ==========================================
// Persistent Localization Workspace
// ==========================================



  console.log("showLanguageModal =", showLanguageModal);

  // ==========================================
  // Create Project
  // ==========================================

  const openCreateProject = () => {
    console.log("Opening Language Modal");  
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

  const handleUpdateProject = (updatedProject) => {
    setProjects((prevProjects) =>
      prevProjects.map((project) => {
        if (project.id !== updatedProject.id) {
          return project;
        }
  
        return {
          ...project,
          ...updatedProject,
          updated: new Date().toLocaleDateString(),
        };
      })
    );
  
    setEditingProject(null);
    setShowProjectModal(false);
  };
  // ==========================================
  // Delete Project
  // ==========================================

  const handleDeleteProject = (id) => {
    const confirmDelete = window.confirm(
      "Are you sure you want to delete this project?"
    );

    if (!confirmDelete) return;

    setProjects((prevProjects) =>
      prevProjects.filter((project) => project.id !== id)
    );
  };


  // ==========================================
// Site Actions
// ==========================================

const openCreateSite = () => {
  console.log("Register Site clicked");

  setEditingSite(null);

  setShowSiteModal(true);
};

const handleEditSite = (site) => {
  setEditingSite(site);
  setShowSiteModal(true);
};

const handleCreateSite = (site) => {
  const newSite = {
    id: Date.now(),

    name: site.name,

    url: site.url,

    projectId: Number(site.projectId),

    status: site.status,

    created: new Date().toLocaleDateString(),

    updated: new Date().toLocaleDateString(),
  };

  setSites((prevSites) => [...prevSites, newSite]);

  setEditingSite(null);

  setShowSiteModal(false);
};

const handleUpdateSite = (updatedSite) => {
  setSites((prevSites) =>
    prevSites.map((site) =>
      site.id === updatedSite.id
        ? {
            ...site,
            ...updatedSite,
            projectId: Number(updatedSite.projectId),
            updated: new Date().toLocaleDateString(),
          }
        : site
    )
  );

  setEditingSite(null);
  setShowSiteModal(false);
};

const handleDeleteSite = (id) => {
  const confirmDelete = window.confirm(
    "Are you sure you want to delete this site?"
  );

  if (!confirmDelete) return;

  setSites((prevSites) =>
    prevSites.filter((site) => site.id !== id)
  );
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

const handleCreateLanguage = (language) => {
  setLanguages((prev) => [...prev, language]);

  setEditingLanguage(null);
  setShowLanguageModal(false);
};

const handleUpdateLanguage = (updatedLanguage) => {
  setLanguages((prev) =>
    prev.map((language) =>
      language.id === updatedLanguage.id
        ? updatedLanguage
        : language
    )
  );

  setEditingLanguage(null);
  setShowLanguageModal(false);
};

const handleDeleteLanguage = (id) => {
  const confirmDelete = window.confirm(
    "Delete this language?"
  );

  if (!confirmDelete) return;

  setLanguages((prev) =>
    prev.filter((language) => language.id !== id)
  );
};

const handleToggleLanguage = (id) => {
  setLanguages((prev) =>
    prev.map((language) =>
      language.id === id
        ? {
            ...language,
            enabled: !language.enabled,
          }
        : language
    )
  );
};

  // ==========================================
  // Modal Save
  // ==========================================

  const handleSaveProject = (project) => {
    if (editingProject) {
      handleUpdateProject(project);
    } else {
      handleCreateProject(project);
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
          <h2>🌍 AI Native Localization Platform</h2>

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
          📊 Dashboard
        </button>

        <button
          className={`nav-btn ${
            activeTab === "projects" ? "active" : ""
          }`}
          onClick={() => setActiveTab("projects")}
        >
          📁 Projects
        </button>

        <button
          className={`nav-btn ${
            activeTab === "sites" ? "active" : ""
          }`}
          onClick={() => setActiveTab("sites")}
        >
          🌐 Sites
        </button>

        <button
          className={`nav-btn ${
            activeTab === "languages" ? "active" : ""
          }`}
          onClick={() => setActiveTab("languages")}
        >
          🌍 Languages
        </button>

        <button
          className={`nav-btn ${
            activeTab === "translate" ? "active" : ""
          }`}
          onClick={() => setActiveTab("translate")}
        >
          🌍 Translate
        </button>

      </div>

      {/* Main Content */}

      <div className="localization-content">
        {renderContent()}
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