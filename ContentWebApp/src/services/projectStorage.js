const STORAGE_KEY = "localization_projects";

// ===============================
// Get All Projects
// ===============================

export const getProjects = () => {
  try {
    const data = localStorage.getItem(STORAGE_KEY);

    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error("Error loading projects:", error);
    return [];
  }
};

// ===============================
// Save All Projects
// ===============================

export const saveProjects = (projects) => {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(projects)
    );
  } catch (error) {
    console.error("Error saving projects:", error);
  }
};

// ===============================
// Add Project
// ===============================

export const addProject = (project) => {

  const projects = getProjects();

  projects.push(project);

  saveProjects(projects);

};

// ===============================
// Update Project
// ===============================

export const updateProject = (updatedProject) => {

  const projects = getProjects();

  const updated = projects.map((project) =>
    project.id === updatedProject.id
      ? updatedProject
      : project
  );

  saveProjects(updated);

};

// ===============================
// Delete Project
// ===============================

export const deleteProject = (projectId) => {

  const projects = getProjects();

  const filtered = projects.filter(
    (project) => project.id !== projectId
  );

  saveProjects(filtered);

};

// ===============================
// Get Single Project
// ===============================

export const getProject = (projectId) => {

  const projects = getProjects();

  return projects.find(
    (project) => project.id === projectId
  );

};