import { getPool } from '../db/pool.js';

export const TASK_LIMITS = {
  MIN_TITLE_LENGTH: 1,
  MAX_TITLE_LENGTH: 200,
  MAX_DETAILS_LENGTH: 5000,
  ALLOWED_PRIORITIES: ['none', 'low', 'medium', 'high'],
  ALLOWED_STATUSES: ['pending', 'completed'],
};

/**
 * Validates and normalizes task title.
 */
export function validateAndNormalizeTaskTitle(title) {
  if (typeof title !== 'string') {
    const err = new Error('Task title must be a string.');
    err.status = 400;
    throw err;
  }
  const trimmed = title.trim();
  if (trimmed.length < TASK_LIMITS.MIN_TITLE_LENGTH) {
    const err = new Error('Task title is required and cannot be empty.');
    err.status = 400;
    throw err;
  }
  if (trimmed.length > TASK_LIMITS.MAX_TITLE_LENGTH) {
    const err = new Error(
      `Task title cannot exceed ${TASK_LIMITS.MAX_TITLE_LENGTH} characters.`
    );
    err.status = 400;
    throw err;
  }
  return trimmed;
}

/**
 * Validates and normalizes optional task details.
 */
export function validateAndNormalizeTaskDetails(details) {
  if (details === undefined || details === null) {
    return null;
  }
  if (typeof details !== 'string') {
    const err = new Error('Task details must be a string.');
    err.status = 400;
    throw err;
  }
  const trimmed = details.trim();
  if (trimmed.length === 0) {
    return null;
  }
  if (trimmed.length > TASK_LIMITS.MAX_DETAILS_LENGTH) {
    const err = new Error(
      `Task details cannot exceed ${TASK_LIMITS.MAX_DETAILS_LENGTH} characters.`
    );
    err.status = 400;
    throw err;
  }
  return trimmed;
}

/**
 * Validates task priority.
 */
export function validateTaskPriority(priority) {
  if (priority === undefined || priority === null) {
    return 'none';
  }
  if (typeof priority !== 'string' || !TASK_LIMITS.ALLOWED_PRIORITIES.includes(priority.trim().toLowerCase())) {
    const err = new Error(
      `Task priority must be one of: ${TASK_LIMITS.ALLOWED_PRIORITIES.join(', ')}.`
    );
    err.status = 400;
    throw err;
  }
  return priority.trim().toLowerCase();
}

/**
 * Validates task status.
 */
export function validateTaskStatus(status) {
  if (status === undefined || status === null) {
    return 'pending';
  }
  if (typeof status !== 'string' || !TASK_LIMITS.ALLOWED_STATUSES.includes(status.trim().toLowerCase())) {
    const err = new Error(
      `Task status must be one of: ${TASK_LIMITS.ALLOWED_STATUSES.join(', ')}.`
    );
    err.status = 400;
    throw err;
  }
  return status.trim().toLowerCase();
}

/**
 * Validates optional task due date (YYYY-MM-DD format).
 */
export function validateTaskDueDate(dueDate) {
  if (dueDate === undefined || dueDate === null || dueDate === '') {
    return null;
  }
  if (typeof dueDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
    const err = new Error('Task due date must be in YYYY-MM-DD format.');
    err.status = 400;
    throw err;
  }
  const [year, month, day] = dueDate.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    const err = new Error('Task due date must be a valid calendar date.');
    err.status = 400;
    throw err;
  }
  return dueDate;
}

/**
 * Escapes characters with special meaning in SQL LIKE patterns (%, _, \).
 */
function escapeLikeWildcards(text) {
  return text.replace(/[\\%_]/g, '\\$&');
}

/**
 * Creates a new task for the authenticated user.
 */
export async function createTask({
  userId,
  workspaceId = null,
  title,
  details = null,
  status = 'pending',
  priority = 'none',
  dueDate = null,
  pool = getPool(),
}) {
  const normalizedTitle = validateAndNormalizeTaskTitle(title);
  const normalizedDetails = validateAndNormalizeTaskDetails(details);
  const normalizedStatus = validateTaskStatus(status);
  const normalizedPriority = validateTaskPriority(priority);
  const normalizedDueDate = validateTaskDueDate(dueDate);
  const completedAt = normalizedStatus === 'completed' ? new Date().toISOString() : null;

  const query = `
    INSERT INTO tasks (user_id, workspace_id, title, details, status, priority, due_date, completed_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING
      id,
      workspace_id AS "workspaceId",
      title,
      details,
      status,
      priority,
      to_char(due_date, 'YYYY-MM-DD') AS "dueDate",
      completed_at AS "completedAt",
      created_at AS "createdAt",
      updated_at AS "updatedAt";
  `;

  const values = [
    userId,
    workspaceId || null,
    normalizedTitle,
    normalizedDetails,
    normalizedStatus,
    normalizedPriority,
    normalizedDueDate,
    completedAt,
  ];

  const result = await pool.query(query, values);
  return result.rows[0];
}

/**
 * Lists active tasks for a user with status/priority filtering, search, and pagination.
 */
export async function findTasksByUserId({
  userId,
  workspaceId = null,
  status,
  priority,
  q = '',
  limit = 20,
  offset = 0,
  pool = getPool(),
}) {
  const conditions = ['user_id = $1', 'deleted_at IS NULL'];
  const values = [userId];

  if (workspaceId) {
    values.push(workspaceId);
    conditions.push(`workspace_id = $${values.length}`);
  }

  if (status && TASK_LIMITS.ALLOWED_STATUSES.includes(status.toLowerCase())) {
    values.push(status.toLowerCase());
    conditions.push(`status = $${values.length}`);
  }

  if (priority && TASK_LIMITS.ALLOWED_PRIORITIES.includes(priority.toLowerCase())) {
    values.push(priority.toLowerCase());
    conditions.push(`priority = $${values.length}`);
  }

  if (typeof q === 'string' && q.trim().length > 0) {
    const escaped = escapeLikeWildcards(q.trim());
    values.push(`%${escaped}%`);
    const idx = values.length;
    conditions.push(`(title ILIKE $${idx} ESCAPE '\\' OR details ILIKE $${idx} ESCAPE '\\')`);
  }

  const whereClause = conditions.join(' AND ');

  const countQuery = `SELECT count(*)::int AS total FROM tasks WHERE ${whereClause};`;
  const countResult = await pool.query(countQuery, values);
  const total = countResult.rows[0].total;

  const selectValues = [...values, limit + 1, offset];
  const limitParamIdx = selectValues.length - 1;
  const offsetParamIdx = selectValues.length;

  const selectQuery = `
    SELECT
      id,
      workspace_id AS "workspaceId",
      title,
      details,
      status,
      priority,
      to_char(due_date, 'YYYY-MM-DD') AS "dueDate",
      completed_at AS "completedAt",
      created_at AS "createdAt",
      updated_at AS "updatedAt"
    FROM tasks
    WHERE ${whereClause}
    ORDER BY
      CASE WHEN status = 'pending' THEN 0 ELSE 1 END,
      due_date ASC NULLS LAST,
      CASE priority
        WHEN 'high' THEN 1
        WHEN 'medium' THEN 2
        WHEN 'low' THEN 3
        ELSE 4
      END,
      updated_at DESC,
      id ASC
    LIMIT $${limitParamIdx} OFFSET $${offsetParamIdx};
  `;

  const result = await pool.query(selectQuery, selectValues);
  const hasMore = result.rows.length > limit;
  const rawItems = hasMore ? result.rows.slice(0, limit) : result.rows;

  return {
    tasks: rawItems,
    items: rawItems,
    rawItems,
    total,
    limit,
    offset,
    hasMore,
  };
}

/**
 * Finds an owned, active task by id, user_id, and optional workspaceId.
 */
export async function findTaskByIdAndUserId({ id, userId, workspaceId = null, pool = getPool() }) {
  const conditions = ['id = $1', 'user_id = $2', 'deleted_at IS NULL'];
  const values = [id, userId];
  if (workspaceId) {
    values.push(workspaceId);
    conditions.push(`workspace_id = $${values.length}`);
  }

  const query = `
    SELECT
      id,
      workspace_id AS "workspaceId",
      title,
      details,
      status,
      priority,
      to_char(due_date, 'YYYY-MM-DD') AS "dueDate",
      completed_at AS "completedAt",
      created_at AS "createdAt",
      updated_at AS "updatedAt"
    FROM tasks
    WHERE ${conditions.join(' AND ')};
  `;

  const result = await pool.query(query, values);
  return result.rows[0] || null;
}

/**
 * Updates an owned, active task.
 */
export async function updateTask({
  id,
  userId,
  workspaceId = null,
  title,
  details,
  status,
  priority,
  dueDate,
  pool = getPool(),
}) {
  const existing = await findTaskByIdAndUserId({ id, userId, workspaceId, pool });
  if (!existing) {
    return { notFound: true };
  }

  const finalTitle = title !== undefined ? validateAndNormalizeTaskTitle(title) : existing.title;
  const finalDetails = details !== undefined ? validateAndNormalizeTaskDetails(details) : existing.details;
  const finalPriority = priority !== undefined ? validateTaskPriority(priority) : existing.priority;
  const finalDueDate = dueDate !== undefined ? validateTaskDueDate(dueDate) : existing.dueDate;

  let finalStatus = existing.status;
  let finalCompletedAt = existing.completedAt;

  if (status !== undefined) {
    finalStatus = validateTaskStatus(status);
    if (finalStatus === 'completed' && existing.status !== 'completed') {
      finalCompletedAt = new Date().toISOString();
    } else if (finalStatus === 'pending' && existing.status !== 'pending') {
      finalCompletedAt = null;
    }
  }

  const conditions = ['id = $7', 'user_id = $8', 'deleted_at IS NULL'];
  const values = [
    finalTitle,
    finalDetails,
    finalStatus,
    finalPriority,
    finalDueDate,
    finalCompletedAt,
    id,
    userId,
  ];

  if (workspaceId) {
    values.push(workspaceId);
    conditions.push(`workspace_id = $${values.length}`);
  }

  const updateQuery = `
    UPDATE tasks
    SET
      title = $1,
      details = $2,
      status = $3,
      priority = $4,
      due_date = $5,
      completed_at = $6,
      updated_at = now()
    WHERE ${conditions.join(' AND ')}
    RETURNING
      id,
      workspace_id AS "workspaceId",
      title,
      details,
      status,
      priority,
      to_char(due_date, 'YYYY-MM-DD') AS "dueDate",
      completed_at AS "completedAt",
      created_at AS "createdAt",
      updated_at AS "updatedAt";
  `;

  const result = await pool.query(updateQuery, values);
  if (result.rowCount === 1) {
    return { task: result.rows[0] };
  }

  return { notFound: true };
}

/**
 * Sets task status to completed or pending (convenience method).
 */
export async function setTaskStatus({ id, userId, workspaceId = null, status, pool = getPool() }) {
  const normalizedStatus = validateTaskStatus(status);
  const completedAtExpr = normalizedStatus === 'completed' ? 'now()' : 'NULL';

  const conditions = ['id = $2', 'user_id = $3', 'deleted_at IS NULL'];
  const values = [normalizedStatus, id, userId];

  if (workspaceId) {
    values.push(workspaceId);
    conditions.push(`workspace_id = $${values.length}`);
  }

  const query = `
    UPDATE tasks
    SET
      status = $1,
      completed_at = ${completedAtExpr},
      updated_at = now()
    WHERE ${conditions.join(' AND ')}
    RETURNING
      id,
      workspace_id AS "workspaceId",
      title,
      details,
      status,
      priority,
      to_char(due_date, 'YYYY-MM-DD') AS "dueDate",
      completed_at AS "completedAt",
      created_at AS "createdAt",
      updated_at AS "updatedAt";
  `;

  const result = await pool.query(query, values);
  if (result.rowCount === 1) {
    return { task: result.rows[0] };
  }

  return { notFound: true };
}

/**
 * Soft deletes an owned task. Never physically deletes task rows.
 */
export async function softDeleteTask({ id, userId, workspaceId = null, pool = getPool() }) {
  const conditions = ['id = $1', 'user_id = $2', 'deleted_at IS NULL'];
  const values = [id, userId];

  if (workspaceId) {
    values.push(workspaceId);
    conditions.push(`workspace_id = $${values.length}`);
  }

  const query = `
    UPDATE tasks
    SET
      deleted_at = now(),
      updated_at = now()
    WHERE ${conditions.join(' AND ')}
    RETURNING id;
  `;

  const result = await pool.query(query, values);
  if (result.rowCount === 1) {
    return { success: true, deleted: true };
  }

  return { notFound: true };
}
