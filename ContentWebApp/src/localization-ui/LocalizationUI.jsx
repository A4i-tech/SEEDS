import React, { useEffect, useMemo, useState } from "react";
import Skeleton, { SkeletonTheme } from "react-loading-skeleton";
import "react-loading-skeleton/dist/skeleton.css";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "./tokens.css";
import "./ui.css";
import "./shell.css";
import "./manage.css";

import { useLocalization } from "../hooks/useLocalization";
import { translationService } from "../services/translationService";
import { ToastProvider } from "./Toast";
import { AppShell } from "./AppShell";
import { usePersistentState, useLastSession } from "./lib/prefs";
import { pagesFromDocs } from "./lib/segments";
import { DashboardScreen } from "./screens/Dashboard";
import { WorkspaceScreen } from "./screens/Workspace";
import { PlaceholderScreen } from "./screens/Placeholder";

export default function LocalizationUI() {
  const loc = useLocalization();
  const { sites, languages, isLoadingWorkspace } = loc;

  const [nav, setNav] = useState("dashboard");
  const [theme] = usePersistentState("theme", "");
  const [scope, setScope] = usePersistentState("scope", {
    projectId: "",
    siteId: "",
    route: "",
    lang: "hi",
  });
  const [uiLanguage, setUiLanguage] = usePersistentState("uiLanguage", "");
  const [lastSession, rememberSession] = useLastSession();

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
    if (!scope.lang && languages.length) setScope((s) => ({ ...s, lang: languages[0].code }));
  }, [languages, scope.lang, setScope]);

  useEffect(() => {
    if (!uiLanguage && languages.length) setUiLanguage(languages[0].code);
  }, [languages, uiLanguage, setUiLanguage]);

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

  useEffect(() => {
    if (scope.siteId && scope.route) rememberSession(scope);
  }, [scope.siteId, scope.route, scope.lang, rememberSession]);

  const goWorkspace = (next) => {
    setScope((s) => ({ ...s, ...next }));
    setNav("workspace");
  };

  const rootRef = React.useRef(null);
  const [shellH, setShellH] = useState("100vh");
  React.useLayoutEffect(() => {
    const measure = () => {
      const el = rootRef.current;
      if (!el) return;
      setShellH(`${Math.max(480, window.innerHeight - el.getBoundingClientRect().top)}px`);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [nav]);

  let screen;
  if (nav === "dashboard") {
    screen = (
      <DashboardScreen
        loc={loc}
        scope={scope}
        lastSession={lastSession}
        onResume={(sc) => goWorkspace(sc)}
        onOpenReview={(sc) => goWorkspace(sc)}
      />
    );
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
    <div
      className="loca-ui"
      data-theme={theme || undefined}
      ref={rootRef}
      style={{ height: shellH }}
    >
      <ToastProvider>
        <AppShell nav={nav} onNav={setNav} flush={nav === "workspace"}>
          {isLoadingWorkspace && nav === "dashboard" ? (
            <div style={{ padding: 28 }}>
              <SkeletonTheme baseColor="var(--surface-2)" highlightColor="var(--surface-3)">
                <Skeleton count={6} height={64} borderRadius={10} style={{ marginBottom: 8 }} />
              </SkeletonTheme>
            </div>
          ) : (
            screen
          )}
        </AppShell>
      </ToastProvider>
    </div>
  );
}
