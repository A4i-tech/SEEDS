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

  // Content list
  if (path.match(/\/content\/?/) && command.method === "GET") {
    const items = Array.isArray(data) ? data : [];
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

  for (let i = 0; i < commands.length; i++) {
    const cmd = commands[i];
    const res = results?.[i];
    const path = cmd.path || "";

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
      const data = res?.data;

      // If result is a single content item with _id, go directly to it
      if (data && !Array.isArray(data) && data._id) {
        return {
          label: `Play: ${data.title?.english || data.expName || "Content"}`,
          path: ROUTES.CONTENT_DETAILS(data._id),
          autoNavigate: true,
        };
      }

      // If result is an array with content items, go to the first one
      if (Array.isArray(data) && data.length > 0 && data[0]._id) {
        return {
          label: `Play: ${data[0].title?.english || data[0].expName || "Content"}`,
          path: ROUTES.CONTENT_DETAILS(data[0]._id),
          autoNavigate: true,
          // Pass full list for next/prev navigation
          state: { contentList: data, currentIndex: 0 },
        };
      }

      // Fallback to content listing page
      return { label: "Go to Content", path: ROUTES.CONTENT };
    }

    if (path.match(/\/class/)) {
      return { label: "Go to Classrooms", path: ROUTES.CLASSROOMS };
    }
    if (path.includes("/teacher/students")) {
      return { label: "Go to Classrooms", path: ROUTES.CLASSROOMS };
    }
  }

  return null;
}
