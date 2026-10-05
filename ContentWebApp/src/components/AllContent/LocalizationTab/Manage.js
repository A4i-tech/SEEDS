import React from "react";
import { useToast } from "./Toast";
import { SitesView } from "./SitesView";

export function ManageScreen({ nav, loc }) {
  const { toast } = useToast();
  if (nav === "sites") return <SitesView loc={loc} toast={toast} />;
  return null;
}

export default ManageScreen;
