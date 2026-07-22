import { useEffect, useState } from "react";
import { createLocalizationProject } from "../models/LocalizationProject";
const STORAGE_KEY = "localization_workspace";

const getInitialWorkspace = () => {

  const defaultWorkspace = {

    projects: [],

    sites: [],

    languages: [
      {
        id: 1,
        name: "English",
        code: "en",
        direction: "LTR",
        enabled: true,
      },
    ],

  };

  try {

    const saved =
      localStorage.getItem(STORAGE_KEY);

    if (!saved) {

      return defaultWorkspace;

    }

    return {
      ...defaultWorkspace,
      ...JSON.parse(saved),
    };

  } catch (error) {

    console.error(
      "Failed to load workspace",
      error
    );

    return defaultWorkspace;

  }

};

export const useLocalization = () => {

  // ===================================
  // Localization State
  // ===================================
  const initialWorkspace =
  getInitialWorkspace();

  const [projects, setProjects] = useState(
    initialWorkspace.projects
  );

  const [sites, setSites] = useState(
    initialWorkspace.sites
  );

  const [languages, setLanguages] = useState(
    initialWorkspace.languages
  );

  // ===================================
  // Restore Workspace
  // ===================================


  // ===================================
  // Auto Save Workspace
  // ===================================

  useEffect(() => {

    try {

      const workspace = {

        projects,

        sites,

        languages,

        updatedAt: new Date().toISOString(),

      };

      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(workspace)
      );

      console.log("💾 Localization Workspace Saved");

    } catch (error) {

      console.error(
        "Failed to save workspace",
        error
      );

    }

  }, [projects, sites, languages]);

  // ===================================
  // Modal State
  // ===================================

  const [showProjectModal, setShowProjectModal] =
    useState(false);

  const [showSiteModal, setShowSiteModal] =
    useState(false);

  const [showLanguageModal, setShowLanguageModal] =
    useState(false);

  // ===================================
  // Project Actions
  // ===================================

// ===================================
// Create Project
// ===================================

const handleCreateProject = (project) => {

  const newProject = createLocalizationProject({

    name: project.name,

    description: project.description,

    sourceLanguage: project.sourceLanguage,

    status: project.status,

  });

  setProjects((prevProjects) => [

    ...prevProjects,

    newProject,

  ]);

};

// ===================================
  // Return Hook API
  // ===================================

  return {

    // Projects
    projects,
    setProjects,
    handleCreateProject,

    // Sites
    sites,
    setSites,

    // Languages
    languages,
    setLanguages,

    // Project Modal
    showProjectModal,
    setShowProjectModal,

    // Site Modal
    showSiteModal,
    setShowSiteModal,

    // Language Modal
    showLanguageModal,
    setShowLanguageModal,

  };

};