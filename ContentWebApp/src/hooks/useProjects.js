import { useEffect, useState } from "react";

import {
  getProjects,
  addProject,
  updateProject,
  deleteProject,
} from "../services/projectStorage";

const useProjects = () => {

  const [projects, setProjects] = useState([]);

  // ==========================================
  // Load Projects
  // ==========================================

  useEffect(() => {

    const storedProjects = getProjects();

    setProjects(storedProjects);

  }, []);

  // ==========================================
  // Create Project
  // ==========================================

  const createProject = (project) => {

    const newProject = {
      ...project,
      id: project.id || `PRJ-${Date.now()}`,
      createdAt:
        project.createdAt || new Date().toLocaleString(),
      lastUpdated: new Date().toLocaleString(),
    };

    addProject(newProject);

    setProjects(getProjects());

  };

  // ==========================================
  // Edit Project
  // ==========================================

  const editProject = (project) => {

    const updatedProject = {
      ...project,
      lastUpdated: new Date().toLocaleString(),
    };

    updateProject(updatedProject);

    setProjects(getProjects());

  };

  // ==========================================
  // Remove Project
  // ==========================================

  const removeProject = (projectId) => {

    deleteProject(projectId);

    setProjects(getProjects());

  };

  // ==========================================
  // Reload Projects
  // ==========================================

  const reloadProjects = () => {

    setProjects(getProjects());

  };

  return {

    projects,

    createProject,

    editProject,

    removeProject,

    reloadProjects,

  };

};

export default useProjects;