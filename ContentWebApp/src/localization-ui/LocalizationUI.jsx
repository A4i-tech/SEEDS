import React, { useEffect, useMemo, useState } from "react";
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
import { ToastProvider, TooltipProvider } from "./primitives";
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
  // Website Translation state — Source/Target language for Translate & Review only.
  // `scope.lang` here means translationLanguage (the target language for site content).
  const [scope, setScope] = usePersistentState("scope", { projectId: "", siteId: "", route: "", lang: "hi" });
  // UI Language state — application interface language only. Completely separate
  // from `scope`: never read by Translate & Review, never triggers any API call.
  const [uiLanguage, setUiLanguage] = usePersistentState("uiLanguage", "");
  const [lastSession, rememberSession] = useLastSession();

  // Pages (routes) for the selected site — derived from existing list endpoint.
  // Only needed by the workspace's route picker, so only fetch once the user
  // actually opens the workspace — this call returns every doc for the whole
  // site (all routes/languages, no filter) and can be tens of MB on real sites.
  const [siteDocs, setSiteDocs] = useState([]);
  const [pagesError, setPagesError] = useState(null);
  useEffect(() => {
    let cancelled = false;
    if (!scope.siteId || nav !== "workspace") { setSiteDocs([]); setPagesError(null); return; }
    setPagesError(null);
    translationService
      .listTranslations({ siteId: scope.siteId })
      .then((docs) => { if (!cancelled) setSiteDocs(docs || []); })
      .catch((e) => {
        if (cancelled) return;
        setSiteDocs([]);
        setPagesError(e && e.status === 403 ? "forbidden" : (e && e.message) || "Failed to load pages");
      });
    return () => { cancelled = true; };
  }, [scope.siteId, nav]);

  const pages = useMemo(() => pagesFromDocs(siteDocs, scope.lang), [siteDocs, scope.lang]);

  // Default translation target language once loaded (Website Translation state only).
  useEffect(() => {
    if (!scope.lang && languages.length) setScope((s) => ({ ...s, lang: languages[0].code }));
  }, [languages, scope.lang, setScope]);

  // Default UI language once loaded (UI Language state only — no effect on `scope`).
  useEffect(() => {
    if (!uiLanguage && languages.length) setUiLanguage(languages[0].code);
  }, [languages, uiLanguage, setUiLanguage]);

  // Auto-select a page when a site is chosen but no route is set yet, so the
  // workspace populates immediately instead of asking twice. A brand-new site
  // has no translation docs yet (pages = []) — default to "/" so the user can
  // still hit "Translate Website" instead of getting stuck with nothing to pick.
  useEffect(() => {
    // Correct the route when it isn't set yet OR when it's a stale value that
    // isn't one of this site's actual pages (e.g. the "/" fallback set before
    // siteDocs/pages finished loading). Without the second clause the "/"
    // fallback sticks and load() queries a route with no documents.
    const routeMissing =
      !scope.route || (pages.length > 0 && !pages.some((p) => p.route === scope.route));
    if (scope.siteId && routeMissing) {
      setScope((s) => ({ ...s, route: pages.length ? pages[0].route : "/" }));
    }
  }, [scope.siteId, scope.route, pages, setScope]);

  // First site by default so Overview + workspace have data on entry.
  useEffect(() => {
    if (!scope.siteId && sites.length) {
      const first = sites[0];
      setScope((s) => ({ ...s, siteId: first.siteId || first.id }));
    }
  }, [sites, scope.siteId, setScope]);

  // Remember the last workspace scope for "Continue previous session".
  useEffect(() => {
    if (scope.siteId && scope.route) rememberSession(scope);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope.siteId, scope.route, scope.lang]);

  const goWorkspace = (next) => { setScope((s) => ({ ...s, ...next })); setNav("workspace"); };

  // Fill the viewport space below the app's top nav (module is nested, not full-screen).
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
        loc={loc} scope={scope} lastSession={lastSession}
        onResume={(sc) => goWorkspace(sc)}
        onOpenReview={(sc) => goWorkspace(sc)}
      />
    );
  } else if (nav === "workspace") {
    screen = (
      <WorkspaceScreen
        scope={scope} languages={languages.filter((l) => l.enabled)} sites={sites}
        onScope={setScope} pages={pages} pagesError={pagesError}
      />
    );
  } else {
    screen = <PlaceholderScreen nav={nav} />;
  }

  return (
    <div className="loca-ui" data-theme={theme || undefined} ref={rootRef} style={{ height: shellH }}>
      <TooltipProvider>
        <ToastProvider>
          <AppShell
            nav={nav}
            onNav={setNav}
            flush={nav === "workspace"}
          >
            {isLoadingWorkspace && nav === "dashboard" ? null : screen}
          </AppShell>
        </ToastProvider>
      </TooltipProvider>
    </div>
  );
}
