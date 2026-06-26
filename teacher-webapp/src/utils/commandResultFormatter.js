import { ROUTES } from "../constants/routes";

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

  // Classroom list
  if (path.match(/\/class\/?$/) && command.method === "GET") {
    const names = Array.isArray(data) ? data.map((c) => c.name) : [];
    return {
      title: "Classrooms",
      summary: `Found ${names.length} classroom${names.length !== 1 ? "s" : ""}`,
      items: names,
    };
  }

  // Students list
  if (path.includes("/teacher/students")) {
    const names = Array.isArray(data) ? data.map((s) => s.name || s.phoneNumber) : [];
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
  let sawClassCommand = false;
  let sawStudentsCommand = false;

  for (let i = 0; i < commands.length; i++) {
    const cmd = commands[i];
    const res = results?.[i];
    const path = cmd.path || "";

    // Frontend navigation pseudo-command — go straight to the requested route.
    if (cmd.method === "NAVIGATE" && res?.status < 300) {
      const target = res?.data?.navigate || path;
      return { label: "Go", path: target, autoNavigate: true };
    }

    // Track classroom ID if fetched
    if (path.match(/^\/class\/([^/]+)$/) && cmd.method === "GET" && res?.status < 300) {
      classIdSearchResult = res?.data?._id;
    }

    // Track conference ID if created
    if (path.match(/\/call\/conference\/create/) && res?.status < 300) {
      confIdSearchResult = res?.data?.id;
    }

    // Conference started -> Navigate to Classroom Detail with autoStart state
    if (path.match(/\/call\/conference\/start/) && res?.status < 300) {
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
      const single = !items && raw && raw._id ? raw : null;

      // Single content item → play directly
      if (single) {
        return {
          label: `Play: ${single.title?.english || single.expName || "Content"}`,
          path: ROUTES.CONTENT_DETAILS(single._id),
          autoNavigate: true,
        };
      }

      // Array result
      if (items && items.length > 0 && items[0]._id) {
        // Search query (expName/ids) → play the first match directly
        if (path.includes("expName=") || path.includes("ids=")) {
          return {
            label: `Play: ${items[0].title?.english || items[0].expName || "Content"}`,
            path: ROUTES.CONTENT_DETAILS(items[0]._id),
            autoNavigate: true,
            state: { contentList: items, currentIndex: 0 },
          };
        }
        // Content library browse (no search filter) → open content drawer
        return { action: "OPEN_CONTENT_DRAWER", label: "Open Content Library" };
      }

      // No items resolved
      return null;
    }

    // New classroom created -> offer to navigate directly to it (POST with no _id = create)
    if (path.match(/\/class\/?$/) && cmd.method === "POST" && res?.status < 300 && res?.data?._id) {
      const roomName = res.data.name || "new classroom";
      return {
        label: `Go to ${roomName}`,
        path: ROUTES.CLASSROOM_DETAIL(res.data._id),
      };
    }

    // Note generic class/student commands but DON'T return yet — a later command
    // (e.g. conference start) may be a higher-priority navigation target.
    if (path.match(/\/class/)) sawClassCommand = true;
    if (path.includes("/teacher/students")) sawStudentsCommand = true;
  }

  // Generic fallback: only after scanning ALL commands for priority targets.
  if (sawClassCommand || sawStudentsCommand) {
    return { label: "Go to Classrooms", path: ROUTES.CLASSROOMS };
  }

  return null;
}
