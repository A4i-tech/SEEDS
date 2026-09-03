import { useEffect, useState } from "react";
import { onboardingService } from "../services/onboardingService";
import { languageService } from "../services/languageService";

export const useLocalization = () => {

  const [projects, setProjects] = useState([]);

  const [sites, setSites] = useState([]);

  const [isLoadingWorkspace, setIsLoadingWorkspace] = useState(true);

  const [workspaceLoadError, setWorkspaceLoadError] = useState("");

  useEffect(() => {

    let cancelled = false;

    const load = async () => {

      setIsLoadingWorkspace(true);
      setWorkspaceLoadError("");

      try {

        const [loadedProjects, loadedSites, loadedLanguages] = await Promise.all([
          onboardingService.listProjects(),
          onboardingService.listSites(),
          languageService.listLanguages(),
        ]);

        if (cancelled) return;

        setProjects(loadedProjects);
        setSites(loadedSites);
        setLanguages(loadedLanguages);

      } catch (error) {

        if (!cancelled) {
          setWorkspaceLoadError(error.message);
        }

      } finally {

        if (!cancelled) {
          setIsLoadingWorkspace(false);
        }

      }

    };

    load();

    return () => {
      cancelled = true;
    };

  }, []);

  const [languages, setLanguages] = useState([]);

  const handleCreateLanguage = async (language) => {
    const created = await languageService.createLanguage({
      name: language.name,
      code: language.code,
      direction: language.direction,
      enabled: language.enabled,
    });

    setLanguages((prevLanguages) => [...prevLanguages, created]);

    return created;
  };

  const handleUpdateLanguage = async (id, fields) => {
    const updated = await languageService.updateLanguage(id, fields);

    setLanguages((prevLanguages) =>
      prevLanguages.map((language) => (language.id === id ? updated : language))
    );

    return updated;
  };

  const handleDeleteLanguage = async (id) => {
    await languageService.deleteLanguage(id);

    setLanguages((prevLanguages) =>
      prevLanguages.filter((language) => language.id !== id)
    );
  };

  const [showProjectModal, setShowProjectModal] =
    useState(false);

  const [showSiteModal, setShowSiteModal] =
    useState(false);

  const [showLanguageModal, setShowLanguageModal] =
    useState(false);

  const handleCreateProject = async (project) => {
    const created = await onboardingService.createProject({
      name: project.name,
      description: project.description,
      sourceLanguage: project.sourceLanguage,
      status: project.status,
    });

    setProjects((prevProjects) => [...prevProjects, created]);

    return created;
  };

  const handleUpdateProject = async (id, fields) => {
    const updated = await onboardingService.updateProject(id, fields);

    setProjects((prevProjects) =>
      prevProjects.map((project) =>
        project.id === id ? updated : project
      )
    );

    return updated;
  };

  const handleDeleteProject = async (id) => {
    await onboardingService.deleteProject(id);

    setProjects((prevProjects) =>
      prevProjects.filter((project) => project.id !== id)
    );
  };

  const handleCreateSite = async (site) => {
    const created = await onboardingService.createSite({
      projectId: site.projectId,
      domain: site.domain,
      name: site.name,
      status: site.status,
    });

    setSites((prevSites) => [...prevSites, created]);

    return created;
  };

  const handleUpdateSite = async (id, fields) => {
    const updated = await onboardingService.updateSite(id, fields);

    setSites((prevSites) =>
      prevSites.map((site) => (site.id === id ? updated : site))
    );

    return updated;
  };

  const handleDeleteSite = async (id) => {
    await onboardingService.deleteSite(id);

    setSites((prevSites) =>
      prevSites.filter((site) => site.id !== id)
    );
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
