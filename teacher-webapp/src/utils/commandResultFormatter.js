import { ROUTES } from "../constants/routes";

// Routes the app actually serves (see constants/routes.js). A NAVIGATE step whose
// target is outside these prefixes is treated as a planner hallucination and
// dropped rather than navigated to.
const KNOWN_ROUTE_PREFIXES = ["/classrooms", "/content/"];

// The platform API serializes Mongo's `_id` as `id` (see platform/app/models/*).
// Older backend-server responses used `_id`. Read both so a serializer change can
// never silently break navigation again — a missing id used to make the result
// card render with no action at all.
const idOf = (obj) => obj?.id || obj?._id || null;

// Endpoints differ: /class returns a plain array, /content returns
// { data: [...], pagination }. Accept either.
const unwrapList = (data) =>
  Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : [];

const personName = (p) => p?.name || p?.phone_number || p?.phoneNumber || "Unnamed";

/**
 * Format a single command+result pair into a display-friendly object.
 * @param {Object} command - { method, path, description, ... }
 * @param {Object} result  - { status, data, error }
 * @returns {{ title: string, summary: string, items: string[] }}
 */
export function formatResult(command, result) {
  if (!command || !result) {
    return { title: "Command", summary: "No details available", items: [] };
  }

  if (result.error) {
    return { title: command.description || "Command", summary: result.error, items: [] };
  }

  const path = command.path || "";
  const data = result.data;

  // Single classroom (GET /class/:id) — list its members instead of a bare
  // "Completed successfully", which told the teacher nothing.
  if (path.match(/^\/class\/[^/]+$/) && command.method === "GET") {
    const students = Array.isArray(data?.students) ? data.students : [];
    const leaders = Array.isArray(data?.leaders) ? data.leaders : [];
    return {
      title: data?.name ? `Class: ${data.name}` : "Classroom",
      summary:
        `${students.length} student${students.length !== 1 ? "s" : ""}, ` +
        `${leaders.length} leader${leaders.length !== 1 ? "s" : ""}`,
      items: [...students, ...leaders].map(personName),
    };
  }

  // Classroom list
  if (path.match(/\/class\/?$/) && command.method === "GET") {
    const names = unwrapList(data).map((c) => c.name);
    return {
      title: "Classrooms",
      summary: `Found ${names.length} classroom${names.length !== 1 ? "s" : ""}`,
      items: names,
    };
  }

  // Students list
  if (path.includes("/teacher/students")) {
    const names = unwrapList(data).map(personName);
    return {
      title: "Students",
      summary: `Found ${names.length} student${names.length !== 1 ? "s" : ""}`,
      items: names,
    };
  }

  // Teacher profile
  if (path.includes("/teacher/me")) {
    const phone = data?.phoneNumber || data?.phone || "";
    return {
      title: "Your Profile",
      summary: phone ? `Phone: ${phone}` : "Profile loaded",
      items: data?.name ? [data.name] : [],
    };
  }

  // Content list (handles both plain array and paginated { data: [...], pagination })
  if (path.match(/\/content\/?/) && command.method === "GET") {
    const items = Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : [];
    const titles = items.map((c) => c.title?.english || c.title?.local || c.expName || c.name || "Untitled");
    return {
      title: "Content",
      summary: `Found ${titles.length} item${titles.length !== 1 ? "s" : ""}`,
      items: titles,
    };
  }

  // Fallback
  return {
    title: command.description || "Command",
    summary: result.status < 300 ? "Completed successfully" : `Status ${result.status}`,
    items: [],
  };
}

/**
 * Determine which page to navigate to based on the executed commands.
 * For content commands, extracts the content ID to enable direct navigation + auto-play.
 * @param {Object[]} commands - Array of command objects
 * @param {Object[]} results  - Array of result objects
 * @returns {{ label: string, path: string, autoNavigate?: boolean } | null}
 */
export function getNavigationTarget(commands, results) {
  if (!commands || commands.length === 0) return null;

  let confIdSearchResult = null;
  let classIdSearchResult = null;
  let singleClassData = null;
  let sawClassCommand = false;
  let sawStudentsCommand = false;

  for (let i = 0; i < commands.length; i++) {
    const cmd = commands[i];
    const res = results?.[i];
    const path = cmd.path || "";

    // Frontend navigation pseudo-command — go straight to the requested route.
    if (cmd.method === "NAVIGATE" && res?.status < 300) {
      const target = res?.data?.navigate || path;
      if (target === "/action/content-load-more") {
        return { action: "CONTENT_LOAD_MORE", label: "Load more content", autoNavigate: true };
      }
      if (target === "/action/content-stop") {
        return { action: "CONTENT_STOP", label: "Stop content", autoNavigate: true };
      }
      // The content library is a drawer, not a route. The planner sometimes invents
      // a page for it ("/content-library", "/content"); map those onto the drawer
      // instead of navigating to a route that does not exist (blank screen).
      if (/^\/(action\/)?content(-library|s)?\/?$/.test(target)) {
        return { action: "OPEN_CONTENT_DRAWER", label: "Open Content Library", autoNavigate: true };
      }
      // Only navigate to routes the app actually serves — an unknown invented path
      // would otherwise render nothing at all.
      if (!KNOWN_ROUTE_PREFIXES.some((p) => target.startsWith(p))) {
        return null;
      }
      return { label: "Go", path: target, autoNavigate: true };
    }

    // Track classroom ID if fetched
    if (path.match(/^\/class\/([^/]+)$/) && cmd.method === "GET" && res?.status < 300) {
      classIdSearchResult = idOf(res?.data);
      singleClassData = res?.data;
    }

    // Track conference ID if created
    if (path.match(/\/conference\/create/) && res?.status < 300) {
      confIdSearchResult = res?.data?.id;
    }

    // Conference started -> Navigate to Classroom Detail with autoStart state
    if (path.match(/\/conference\/start/) && res?.status < 300) {
      const targetConfId = confIdSearchResult || path.split("/").pop(); // Fallback to path param
      if (classIdSearchResult) {
         return {
           label: "Go to Conference Call",
           path: ROUTES.CLASSROOM_DETAIL(classIdSearchResult),
           autoNavigate: true,
           state: { confId: targetConfId, autoStart: true },
         };
      }
    }

    // Content command — navigate directly to the content detail page for auto-play
    if (path.match(/\/content/) && cmd.method === "GET" && res?.status < 300) {
      const raw = res?.data;
      // Unwrap paginated response { data: [...], pagination } or plain array
      const items = Array.isArray(raw) ? raw : Array.isArray(raw?.data) ? raw.data : null;
      const single = !items && idOf(raw) ? raw : null;

      // Single content item → play directly
      if (single) {
        return {
          label: `Play: ${single.title?.english || single.expName || "Content"}`,
          path: ROUTES.CONTENT_DETAILS(idOf(single)),
          autoNavigate: true,
        };
      }

      // Array result
      if (items && items.length > 0 && idOf(items[0])) {
        // Search query (search/expName/ids) → play the first match directly.
        // `search=` is the title search, which is what "play The alphabet song" uses.
        if (path.includes("search=") || path.includes("expName=") || path.includes("ids=")) {
          return {
            label: `Play: ${items[0].title?.english || items[0].expName || "Content"}`,
            path: ROUTES.CONTENT_DETAILS(idOf(items[0])),
            autoNavigate: true,
            state: { contentList: items, currentIndex: 0 },
          };
        }
        // Content library browse (no search filter) → open content drawer
        return { action: "OPEN_CONTENT_DRAWER", label: "Open Content Library", autoNavigate: true };
      }

      // No items resolved
      return null;
    }

    // New classroom created -> offer to navigate directly to it (POST with no _id = create)
    if (path.match(/\/class\/?$/) && cmd.method === "POST" && res?.status < 300 && idOf(res?.data)) {
      const roomName = res.data.name || "new classroom";
      return {
        label: `Go to ${roomName}`,
        path: ROUTES.CLASSROOM_DETAIL(idOf(res.data)),
      };
    }

    // Note generic class/student commands but DON'T return yet — a later command
    // (e.g. conference start) may be a higher-priority navigation target.
    if (path.match(/\/class/)) sawClassCommand = true;
    if (path.includes("/teacher/students")) sawStudentsCommand = true;
  }

  // Generic fallback: only after scanning ALL commands for priority targets.
  // A standalone "open class X" (GET /class/:id, no conference-start after it) goes
  // straight to that class rather than the generic classrooms list.
  if (idOf(singleClassData)) {
    return { label: `Go to ${singleClassData.name || "classroom"}`, path: ROUTES.CLASSROOM_DETAIL(idOf(singleClassData)), autoNavigate: true };
  }
  if (sawClassCommand || sawStudentsCommand) {
    return { label: "Go to Classrooms", path: ROUTES.CLASSROOMS };
  }

  return null;
}
