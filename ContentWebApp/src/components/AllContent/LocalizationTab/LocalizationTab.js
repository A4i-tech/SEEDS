import React, { useEffect, useMemo, useState } from "react";
import Skeleton, { SkeletonTheme } from "react-loading-skeleton";
import "react-loading-skeleton/dist/skeleton.css";
import "../ContentTab/css/ContentTab.css";

import { useLocalization } from "../../../hooks/useLocalization";
import { translationService } from "../../../services/translationService";
import { ToastProvider } from "./Toast";
import { usePersistentState } from "../../../hooks/usePersistentState";
import { pagesFromDocs } from "../../../utils/segments";
import { DashboardScreen } from "./Dashboard";
import { WorkspaceScreen } from "./Workspace";

export default function LocalizationTab() {
  const loc = useLocalization();
  const { sites, languages, isLoadingWorkspace } = loc;

  const [nav, setNav] = useState("dashboard");
  const [scope, setScope] = usePersistentState("scope", {
    projectId: "",
    siteId: "",
    route: "",
    lang: "hi",
  });
  const [siteDocs, setSiteDocs] = useState([]);
  const [pagesError, setPagesError] = useState(null);
  useEffect(() => {
    let cancelled = false;
    setSiteDocs([]);
    setPagesError(null);
    if (!scope.siteId || nav !== "workspace") return undefined;
    translationService
      .listTranslations({ siteId: scope.siteId })
      .then((docs) => {
        if (!cancelled) setSiteDocs(docs);
      })
      .catch((e) => {
        if (cancelled) return;
        setPagesError(e.status === 403 ? "forbidden" : e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [scope.siteId, nav]);

  const pages = useMemo(() => pagesFromDocs(siteDocs, scope.lang), [siteDocs, scope.lang]);

  useEffect(() => {
    const routeMissing =
      !scope.route || (pages.length > 0 && !pages.some((p) => p.route === scope.route));
    if (scope.siteId && routeMissing) {
      setScope((s) => ({ ...s, route: pages.length ? pages[0].route : "/" }));
    }
  }, [scope.siteId, scope.route, pages, setScope]);

  useEffect(() => {
    if (!scope.siteId && sites.length) {
      const first = sites[0];
      setScope((s) => ({ ...s, siteId: first.siteId }));
    }
  }, [sites, scope.siteId, setScope]);

  const screen =
    nav === "dashboard" ? (
      <DashboardScreen loc={loc} />
    ) : (
      <WorkspaceScreen
        scope={scope}
        languages={languages.filter((l) => l.enabled)}
        sites={sites}
        onScope={setScope}
        pages={pages}
        pagesError={pagesError}
      />
    );

  return (
    <ToastProvider>
      <div className="tabs-container">
        {[
          { id: "dashboard", label: "Registration" },
          { id: "workspace", label: "Translate & Review" },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`tab-button${nav === tab.id ? " active" : ""}`}
            onClick={() => setNav(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {isLoadingWorkspace && nav === "dashboard" ? (
        <div style={{ padding: 28 }}>
          <SkeletonTheme
            baseColor="var(--color-skeleton-base)"
            highlightColor="var(--color-skeleton-highlight)"
          >
            <Skeleton count={6} height={64} borderRadius={10} style={{ marginBottom: 8 }} />
          </SkeletonTheme>
        </div>
      ) : (
        screen
      )}
    </ToastProvider>
  );
}
