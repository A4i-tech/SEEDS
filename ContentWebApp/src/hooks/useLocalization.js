import { useEffect, useState } from "react";
import { onboardingService } from "../services/onboardingService";
import { languageService } from "../services/languageService";

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

  const handleCreateLanguage = async (language) => {
    const created = await languageService.createLanguage({
      name: language.name,
      code: language.code,
      direction: language.direction,
      enabled: language.enabled,
    });
    setLanguages((prev) => [...prev, created]);
    return created;
  };

  const handleUpdateLanguage = async (id, fields) => {
    const updated = await languageService.updateLanguage(id, fields);
    setLanguages((prev) => prev.map((l) => (l.id === id ? updated : l)));
    return updated;
  };

  const handleDeleteLanguage = async (id) => {
    await languageService.deleteLanguage(id);
    setLanguages((prev) => prev.filter((l) => l.id !== id));
  };

  const handleCreateProject = async (project) => {
    const created = await onboardingService.createProject({
      name: project.name,
      description: project.description,
      sourceLanguage: project.sourceLanguage,
      status: project.status,
    });
    setProjects((prev) => [...prev, created]);
    return created;
  };

  const handleUpdateProject = async (id, fields) => {
    const updated = await onboardingService.updateProject(id, fields);
    setProjects((prev) => prev.map((p) => (p.id === id ? updated : p)));
    return updated;
  };

  const handleDeleteProject = async (id) => {
    await onboardingService.deleteProject(id);
    setProjects((prev) => prev.filter((p) => p.id !== id));
  };

  const handleCreateSite = async (site) => {
    const created = await onboardingService.createSite({
      projectId: site.projectId,
      domain: site.domain,
      name: site.name,
      status: site.status,
    });
    setSites((prev) => [...prev, created]);
    return created;
  };

  const handleUpdateSite = async (id, fields) => {
    const updated = await onboardingService.updateSite(id, fields);
    setSites((prev) => prev.map((s) => (s.id === id ? updated : s)));
    return updated;
  };

  const handleDeleteSite = async (id) => {
    await onboardingService.deleteSite(id);
    setSites((prev) => prev.filter((s) => s.id !== id));
  };

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
