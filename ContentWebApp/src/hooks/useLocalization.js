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
  const [sites, setSites] = useState([]);
  const [languages, setLanguages] = useState([]);
  const [isLoadingWorkspace, setIsLoadingWorkspace] = useState(true);
  const [workspaceLoadError, setWorkspaceLoadError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setIsLoadingWorkspace(true);
      setWorkspaceLoadError(null);

      const [sitesResult, languagesResult] = await Promise.allSettled([
        onboardingService.listSites(),
        languageService.listLanguages(),
      ]);
      if (cancelled) return;

      if (sitesResult.status === "fulfilled") setSites(sitesResult.value);
      if (languagesResult.status === "fulfilled") setLanguages(languagesResult.value);

      const failed = [sitesResult, languagesResult].find((r) => r.status === "rejected");
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

  const siteCrud = useCrudState(
    {
      create: (site) =>
        onboardingService.createSite({
          domain: site.domain,
          name: site.name,
          status: site.status,
          languages: site.languages,
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

    sites,
    setSites,
    handleCreateSite,
    handleUpdateSite,
    handleDeleteSite,

    isLoadingWorkspace,
    workspaceLoadError,

    languages,
    setLanguages,
  };
};
