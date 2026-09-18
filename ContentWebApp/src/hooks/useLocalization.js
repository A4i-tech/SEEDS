import { useEffect, useState } from "react";
import { onboardingService } from "../services/onboardingService";
import { languageService } from "../services/languageService";

function useCrudState(actions, setState) {
  const handleCreate = async (payload) => {
    const created = await actions.create(payload);
    setState((prev) => [...prev, created]);
    return created;
  };
  const handleUpdate = async (id, fields) => {
    const updated = await actions.update(id, fields);
    setState((prev) => prev.map((item) => (item.id === id ? updated : item)));
    return updated;
  };
  const handleDelete = async (id) => {
    await actions.delete(id);
    setState((prev) => prev.filter((item) => item.id !== id));
  };
  return { handleCreate, handleUpdate, handleDelete };
}

export const useLocalization = () => {
  const [projects, setProjects] = useState([]);
  const [sites, setSites] = useState([]);
  const [languages, setLanguages] = useState([]);
  const [isLoadingWorkspace, setIsLoadingWorkspace] = useState(true);
  const [workspaceLoadError, setWorkspaceLoadError] = useState(null);
  const [showProjectModal, setShowProjectModal] = useState(false);
  const [showSiteModal, setShowSiteModal] = useState(false);
  const [showLanguageModal, setShowLanguageModal] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setIsLoadingWorkspace(true);
      setWorkspaceLoadError(null);

      const [projectsResult, sitesResult, languagesResult] = await Promise.allSettled([
        onboardingService.listProjects(),
        onboardingService.listSites(),
        languageService.listLanguages(),
      ]);
      if (cancelled) return;

      if (projectsResult.status === "fulfilled") setProjects(projectsResult.value);
      if (sitesResult.status === "fulfilled") setSites(sitesResult.value);
      if (languagesResult.status === "fulfilled") setLanguages(languagesResult.value);

      const failed = [projectsResult, sitesResult, languagesResult].find((r) => r.status === "rejected");
      if (failed) {
        console.error("useLocalization: failed to load workspace data", failed.reason);
        setWorkspaceLoadError(failed.reason);
      }
      setIsLoadingWorkspace(false);
    };

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const languageCrud = useCrudState(
    {
      create: (language) =>
        languageService.createLanguage({
          name: language.name,
          code: language.code,
          direction: language.direction,
          enabled: language.enabled,
        }),
      update: (id, fields) => languageService.updateLanguage(id, fields),
      delete: (id) => languageService.deleteLanguage(id),
    },
    setLanguages
  );
  const handleCreateLanguage = languageCrud.handleCreate;
  const handleUpdateLanguage = languageCrud.handleUpdate;
  const handleDeleteLanguage = languageCrud.handleDelete;

  const projectCrud = useCrudState(
    {
      create: (project) =>
        onboardingService.createProject({
          name: project.name,
          description: project.description,
          sourceLanguage: project.sourceLanguage,
          status: project.status,
        }),
      update: (id, fields) => onboardingService.updateProject(id, fields),
      delete: (id) => onboardingService.deleteProject(id),
    },
    setProjects
  );
  const handleCreateProject = projectCrud.handleCreate;
  const handleUpdateProject = projectCrud.handleUpdate;
  const handleDeleteProject = projectCrud.handleDelete;

  const siteCrud = useCrudState(
    {
      create: (site) =>
        onboardingService.createSite({
          projectId: site.projectId,
          domain: site.domain,
          name: site.name,
          status: site.status,
        }),
      update: (id, fields) => onboardingService.updateSite(id, fields),
      delete: (id) => onboardingService.deleteSite(id),
    },
    setSites
  );
  const handleCreateSite = siteCrud.handleCreate;
  const handleUpdateSite = siteCrud.handleUpdate;
  const handleDeleteSite = siteCrud.handleDelete;

  return {
    projects,
    setProjects,
    handleCreateProject,
    handleUpdateProject,
    handleDeleteProject,

    sites,
    setSites,
    handleCreateSite,
    handleUpdateSite,
    handleDeleteSite,

    isLoadingWorkspace,
    workspaceLoadError,

    languages,
    setLanguages,
    handleCreateLanguage,
    handleUpdateLanguage,
    handleDeleteLanguage,

    showProjectModal,
    setShowProjectModal,
    showSiteModal,
    setShowSiteModal,
    showLanguageModal,
    setShowLanguageModal,
  };
};
