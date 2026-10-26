/**
 * Route definitions, navigation groupings, and path safety validation
 * for the MyNotes application shell (Stage 4).
 */

export const APPROVED_ROUTES = [
  "/dashboard",
  "/notes",
  "/questions",
  "/documents",
  "/tasks",
  "/inbox",
  "/workspaces",
  "/revision",
  "/journal",
];

/**
 * Validates a return path against approved private routes.
 * Rejects external URLs, protocol-relative paths (//), unknown routes,
 * or anything that does not match an approved private route.
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
  for (const group of NAV_GROUPS) {
    const item = group.items.find((i) => i.to === pathname);
    if (item) {
      return { title: item.label, description: item.description };
    }
  }
  return { title: "MyNotes", description: "Personal Knowledge & Activity Workspace" };
}
