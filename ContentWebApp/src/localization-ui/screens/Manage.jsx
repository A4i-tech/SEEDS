import React from "react";
import { useToast } from "../Toast";
import { ProjectsView } from "./manage/ProjectsView";
import { SitesView } from "./manage/SitesView";
import { LanguagesView } from "./manage/LanguagesView";

export function ManageScreen({ nav, loc }) {
  const { toast } = useToast();
  if (nav === "projects") return <ProjectsView loc={loc} toast={toast} />;
  if (nav === "sites") return <SitesView loc={loc} toast={toast} />;
  if (nav === "languages") return <LanguagesView loc={loc} toast={toast} />;
  return null;
}

export default ManageScreen;
