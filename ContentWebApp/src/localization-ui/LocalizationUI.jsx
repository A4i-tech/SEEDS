import React, { useEffect, useMemo, useState } from "react";
import Skeleton, { SkeletonTheme } from "react-loading-skeleton";
import "react-loading-skeleton/dist/skeleton.css";

import { useLocalization } from "../hooks/useLocalization";
import { translationService } from "../services/translationService";
import { ToastProvider } from "./Toast";
import { AppShell } from "./AppShell";
import { usePersistentState } from "./lib/prefs";
import { pagesFromDocs } from "./lib/segments";
import { DashboardScreen } from "./screens/Dashboard";
import { WorkspaceScreen } from "./screens/Workspace";
import { PlaceholderScreen } from "./screens/Placeholder";

export default function LocalizationUI() {
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
    if (!scope.siteId || nav !== "workspace") {
      setSiteDocs([]);
      setPagesError(null);
      return;
    }
    setPagesError(null);
    translationService
      .listTranslations({ siteId: scope.siteId })
      .then((docs) => {
        if (!cancelled) setSiteDocs(docs);
      })
      .catch((e) => {
        if (cancelled) return;
        setSiteDocs([]);
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

  let screen;
  if (nav === "dashboard") {
    screen = <DashboardScreen loc={loc} />;
  } else if (nav === "workspace") {
    screen = (
      <WorkspaceScreen
        scope={scope}
        languages={languages.filter((l) => l.enabled)}
        sites={sites}
        onScope={setScope}
        pages={pages}
        pagesError={pagesError}
      />
    );
  } else {
    screen = <PlaceholderScreen nav={nav} />;
  }

  return (
    <ToastProvider>
      <AppShell nav={nav} onNav={setNav}>
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
      </AppShell>
    </ToastProvider>
  );
}
