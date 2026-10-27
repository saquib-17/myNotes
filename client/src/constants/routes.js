/**
 * Route definitions, navigation groupings, and path safety validation
 * for the MyNotes application shell (Stage 4).
 */

export const APPROVED_ROUTES = [
  "/dashboard",
  "/notes",
  "/trash",
  "/questions",
  "/documents",
  "/tasks",
  "/inbox",
  "/workspaces",
  "/revision",
  "/journal",
];

const NOTE_DETAIL_ROUTE_REGEX = /^\/notes\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COLLECTION_DETAIL_ROUTE_REGEX = /^\/collections\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TAG_DETAIL_ROUTE_REGEX = /^\/tags\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Validates a return path against approved private routes.
 * Rejects external URLs, protocol-relative paths (//), unknown routes,
 * or anything that does not match an approved private route.
 * Also allows valid internal note detail paths (/notes/:uuid) and collection paths (/collections/:uuid).
 * Always falls back to /dashboard.
 *
 * @param {string|undefined} pathname
 * @returns {string}
 */
export function safeReturnPath(pathname) {
  if (typeof pathname !== "string") {
    return "/dashboard";
  }
  if (APPROVED_ROUTES.includes(pathname)) {
    return pathname;
  }
  if (NOTE_DETAIL_ROUTE_REGEX.test(pathname)) {
    return pathname;
  }
  if (COLLECTION_DETAIL_ROUTE_REGEX.test(pathname)) {
    return pathname;
  }
  if (TAG_DETAIL_ROUTE_REGEX.test(pathname)) {
    return pathname;
  }
  return "/dashboard";
}

/**
 * Grouped navigation structure for desktop sidebar and mobile drawer.
 * Four groups: Home, Knowledge, Daily, Growth.
 */
export const NAV_GROUPS = [
  {
    title: "Home",
    items: [
      {
        to: "/dashboard",
        label: "Today",
        description: "Your daily workspace, activity overview, and system foundation.",
      },
    ],
  },
  {
    title: "Knowledge",
    items: [
      {
        to: "/notes",
        label: "Notes",
        description: "Capture, organize, and synthesize your thoughts and documentation.",
      },
      {
        to: "/questions",
        label: "Questions",
        description: "Collect important questions and track your active understanding.",
      },
      {
        to: "/documents",
        label: "Documents",
        description: "Store, organize, and reference essential source materials.",
      },
    ],
  },
  {
    title: "Daily",
    items: [
      {
        to: "/tasks",
        label: "Tasks",
        description: "Manage actionable to-dos, priorities, and daily task completion.",
      },
      {
        to: "/inbox",
        label: "Inbox",
        description: "Quickly capture and triage incoming thoughts, links, and items.",
      },
    ],
  },
  {
    title: "Growth",
    items: [
      {
        to: "/workspaces",
        label: "Workspaces",
        description: "Organize your notes and resources into focused topical workspaces.",
      },
      {
        to: "/revision",
        label: "Revision",
        description: "Review and reinforce knowledge using spaced repetition cycles.",
      },
      {
        to: "/journal",
        label: "Journal",
        description: "Reflect on daily insights, learning progress, and personal reflections.",
      },
    ],
  },
];

/**
 * Helper to get the page title and description for a given pathname.
 *
 * @param {string} pathname
 * @returns {{ title: string, description: string }}
 */
export function getRouteMetadata(pathname) {
  if (typeof pathname === "string" && NOTE_DETAIL_ROUTE_REGEX.test(pathname)) {
    return { title: "Note Editor", description: "Edit your private rich-text note." };
  }
  if (typeof pathname === "string" && COLLECTION_DETAIL_ROUTE_REGEX.test(pathname)) {
    return { title: "Collection", description: "View and organize notes in this collection." };
  }
  if (typeof pathname === "string" && TAG_DETAIL_ROUTE_REGEX.test(pathname)) {
    return { title: "Tag", description: "View notes tagged with this label." };
  }
  if (pathname === "/trash") {
    return { title: "Trash", description: "View and restore soft-deleted notes." };
  }
  for (const group of NAV_GROUPS) {
    const item = group.items.find((i) => i.to === pathname);
    if (item) {
      return { title: item.label, description: item.description };
    }
  }
  return { title: "MyNotes", description: "Personal Knowledge & Activity Workspace" };
}
