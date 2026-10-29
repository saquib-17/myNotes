import { getPool } from '../db/pool.js';

/**
 * Validates date string in YYYY-MM-DD format.
 */
function isValidDateString(dateStr) {
  if (typeof dateStr !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return false;
  }
  const [year, month, day] = dateStr.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

/**
 * Returns today's date formatted as YYYY-MM-DD in UTC.
 */
function getTodayUtcString() {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const day = String(now.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Retrieves the comprehensive dashboard overview for an authenticated user.
 *
 * @param {object} params
 * @param {string} params.userId
 * @param {string} [params.workspaceId]
 * @param {string} [params.clientDate] Optional YYYY-MM-DD date from client
 * @param {object} [params.pool] Database pool
 * @returns {Promise<object>} Dashboard payload matching API contract
 */
export async function getDashboardOverview({
  userId,
  workspaceId = null,
  clientDate,
  pool = getPool(),
}) {
  if (!userId) {
    const err = new Error('userId is required.');
    err.status = 400;
    throw err;
  }

  const todayStr = clientDate && isValidDateString(clientDate)
    ? clientDate
    : getTodayUtcString();

  const wsStats = workspaceId ? 'AND workspace_id = $3' : '';
  const wsStatsParams = workspaceId ? [userId, todayStr, workspaceId] : [userId, todayStr];

  const wsTwoFilter = workspaceId ? 'AND workspace_id = $3' : '';
  const wsTwoParams = workspaceId ? [userId, todayStr, workspaceId] : [userId, todayStr];

  const wsOneFilter = workspaceId ? 'AND workspace_id = $2' : '';
  const wsOneParams = workspaceId ? [userId, workspaceId] : [userId];

  // Run stats and focused item lists concurrently
  const [
    statsResult,
    dueTasksResult,
    overdueTasksResult,
    focusTasksResult,
    focusDoubtsResult,
    focusRevisionResult,
    recentNotesResult,
    recentQuestionsResult,
    recentDocumentsResult,
  ] = await Promise.all([
    // 1. Stats and journal saved check
    pool.query(
      `
      SELECT
        (SELECT COUNT(*) FROM notes WHERE user_id = $1 AND deleted_at IS NULL ${wsStats})::int AS "activeNotes",
        (SELECT COUNT(*) FROM notes WHERE user_id = $1 AND deleted_at IS NULL AND pinned = true ${wsStats})::int AS "pinnedNotes",
        (SELECT COUNT(*) FROM tasks WHERE user_id = $1 AND deleted_at IS NULL AND status = 'pending' ${wsStats})::int AS "pendingTasks",
        (SELECT COUNT(*) FROM tasks WHERE user_id = $1 AND deleted_at IS NULL AND status = 'completed' ${wsStats})::int AS "completedTasks",
        (SELECT COUNT(*) FROM doubts WHERE user_id = $1 AND deleted_at IS NULL AND status = 'open' ${wsStats})::int AS "openDoubts",
        (SELECT COUNT(*) FROM revision_items WHERE user_id = $1 AND deleted_at IS NULL AND status = 'pending' ${wsStats})::int AS "pendingRevisionItems",
        (SELECT COUNT(*) FROM questions WHERE user_id = $1 AND deleted_at IS NULL ${wsStats})::int AS "totalQuestions",
        (SELECT COUNT(*) FROM questions WHERE user_id = $1 AND deleted_at IS NULL AND status = 'learning' ${wsStats})::int AS "learningQuestions",
        (SELECT COUNT(*) FROM questions WHERE user_id = $1 AND deleted_at IS NULL AND status = 'mastered' ${wsStats})::int AS "masteredQuestions",
        (SELECT COUNT(*) FROM documents WHERE user_id = $1 AND deleted_at IS NULL AND favorite = true ${wsStats})::int AS "favoriteDocuments",
        (SELECT COUNT(*) FROM journal_entries WHERE user_id = $1 AND deleted_at IS NULL ${wsStats})::int AS "journalEntries",
        EXISTS(SELECT 1 FROM journal_entries WHERE user_id = $1 AND deleted_at IS NULL AND entry_date = $2 ${wsStats})::bool AS "journalSaved"
      `,
      wsStatsParams
    ),

    // 2. Due tasks today (pending only)
    pool.query(
      `
      SELECT id, workspace_id AS "workspaceId", title, priority, due_date::text AS due_date, updated_at
      FROM tasks
      WHERE user_id = $1 AND deleted_at IS NULL AND status = 'pending' AND due_date = $2 ${wsTwoFilter}
      ORDER BY priority = 'high' DESC, priority = 'medium' DESC, updated_at DESC, id ASC
      LIMIT 5
      `,
      wsTwoParams
    ),

    // 3. Overdue tasks (pending only with due_date < today)
    pool.query(
      `
      SELECT id, workspace_id AS "workspaceId", title, priority, due_date::text AS due_date, updated_at
      FROM tasks
      WHERE user_id = $1 AND deleted_at IS NULL AND status = 'pending' AND due_date < $2 ${wsTwoFilter}
      ORDER BY due_date ASC, priority = 'high' DESC, updated_at DESC, id ASC
      LIMIT 5
      `,
      wsTwoParams
    ),

    // 4. Focus tasks (pending, ordered by due_date ASC NULLS LAST, priority DESC, updated_at DESC)
    pool.query(
      `
      SELECT id, workspace_id AS "workspaceId", title, priority, due_date::text AS due_date, updated_at
      FROM tasks
      WHERE user_id = $1 AND deleted_at IS NULL AND status = 'pending' ${wsOneFilter}
      ORDER BY due_date ASC NULLS LAST, priority = 'high' DESC, priority = 'medium' DESC, updated_at DESC, id ASC
      LIMIT 5
      `,
      wsOneParams
    ),

    // 5. Focus doubts (open doubts, ordered by created_at DESC)
    pool.query(
      `
      SELECT id, workspace_id AS "workspaceId", question, subject, created_at, updated_at
      FROM doubts
      WHERE user_id = $1 AND deleted_at IS NULL AND status = 'open' ${wsOneFilter}
      ORDER BY created_at DESC, id ASC
      LIMIT 5
      `,
      wsOneParams
    ),

    // 6. Focus revision items (pending, ordered by updated_at DESC)
    pool.query(
      `
      SELECT id, workspace_id AS "workspaceId", title, subject, updated_at
      FROM revision_items
      WHERE user_id = $1 AND deleted_at IS NULL AND status = 'pending' ${wsOneFilter}
      ORDER BY updated_at DESC, id ASC
      LIMIT 5
      `,
      wsOneParams
    ),

    // 7. Recent notes (active notes, ordered by updated_at DESC)
    pool.query(
      `
      SELECT id, workspace_id AS "workspaceId", title, pinned, updated_at
      FROM notes
      WHERE user_id = $1 AND deleted_at IS NULL ${wsOneFilter}
      ORDER BY updated_at DESC, id ASC
      LIMIT 5
      `,
      wsOneParams
    ),

    // 8. Recent questions (active questions, ordered by updated_at DESC)
    pool.query(
      `
      SELECT id, workspace_id AS "workspaceId", type, question, topic, difficulty, status, updated_at
      FROM questions
      WHERE user_id = $1 AND deleted_at IS NULL ${wsOneFilter}
      ORDER BY updated_at DESC, id ASC
      LIMIT 5
      `,
      wsOneParams
    ),

    // 9. Recent documents (active documents, ordered by updated_at DESC)
    pool.query(
      `
      SELECT id, workspace_id AS "workspaceId", title, url, category, topic, favorite, updated_at
      FROM documents
      WHERE user_id = $1 AND deleted_at IS NULL ${wsOneFilter}
      ORDER BY updated_at DESC, id ASC
      LIMIT 5
      `,
      wsOneParams
    ),
  ]);

  const statsRow = statsResult.rows[0] || {};

  return {
    date: todayStr,
    workspaceId: workspaceId || null,
    stats: {
      activeNotes: statsRow.activeNotes || 0,
      pinnedNotes: statsRow.pinnedNotes || 0,
      pendingTasks: statsRow.pendingTasks || 0,
      completedTasks: statsRow.completedTasks || 0,
      openDoubts: statsRow.openDoubts || 0,
      pendingRevisionItems: statsRow.pendingRevisionItems || 0,
      totalQuestions: statsRow.totalQuestions || 0,
      learningQuestions: statsRow.learningQuestions || 0,
      masteredQuestions: statsRow.masteredQuestions || 0,
      favoriteDocuments: statsRow.favoriteDocuments || 0,
      journalEntries: statsRow.journalEntries || 0,
    },
    today: {
      journalSaved: Boolean(statsRow.journalSaved),
      dueTasks: dueTasksResult.rows,
      overdueTasks: overdueTasksResult.rows,
    },
    focus: {
      tasks: focusTasksResult.rows,
      doubts: focusDoubtsResult.rows,
      revisionItems: focusRevisionResult.rows,
    },
    recent: {
      notes: recentNotesResult.rows,
      questions: recentQuestionsResult.rows,
      documents: recentDocumentsResult.rows,
    },
  };
}
