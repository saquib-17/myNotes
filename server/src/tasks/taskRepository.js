import { getPool } from '../db/pool.js';

export const TASK_LIMITS = {
  MAX_TITLE_LENGTH: 200,
  MAX_DETAILS_LENGTH: 5000,
  ALLOWED_STATUSES: ['pending', 'completed'],
  ALLOWED_PRIORITIES: ['none', 'low', 'medium', 'high'],
};

/**
 * Validates and normalizes task title.
 * Must be non-empty string between 1 and 200 characters.
 */
export function validateAndNormalizeTaskTitle(title) {
  if (typeof title !== 'string') {
    const err = new Error('Task title must be a string.');
    err.status = 400;
    throw err;
  }
  const trimmed = title.trim();
  if (trimmed.length === 0) {
    const err = new Error('Task title cannot be empty.');
    err.status = 400;
    throw err;
  }
  if (trimmed.length > TASK_LIMITS.MAX_TITLE_LENGTH) {
    const err = new Error(`Task title cannot exceed ${TASK_LIMITS.MAX_TITLE_LENGTH} characters.`);
    err.status = 400;
    throw err;
  }
  return trimmed;
}

/**
 * Validates and normalizes task details.
 * Optional; must not exceed 5000 characters.
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
    const err = new Error(`Task details cannot exceed ${TASK_LIMITS.MAX_DETAILS_LENGTH} characters.`);
    err.status = 400;
    throw err;
  }
  return trimmed;
}

/**
 * Validates task priority.
 * Must be one of 'none', 'low', 'medium', 'high'.
 */
export function validateTaskPriority(priority) {
  if (priority === undefined || priority === null) {
    return 'none';
  }
  if (typeof priority !== 'string' || !TASK_LIMITS.ALLOWED_PRIORITIES.includes(priority.toLowerCase())) {
    const err = new Error(`Task priority must be one of: ${TASK_LIMITS.ALLOWED_PRIORITIES.join(', ')}.`);
    err.status = 400;
    throw err;
  }
  return priority.toLowerCase();
}

/**
 * Validates task status.
 * Must be one of 'pending', 'completed'.
 */
export function validateTaskStatus(status) {
  if (status === undefined || status === null) {
    return 'pending';
  }
  if (typeof status !== 'string' || !TASK_LIMITS.ALLOWED_STATUSES.includes(status.toLowerCase())) {
    const err = new Error(`Task status must be one of: ${TASK_LIMITS.ALLOWED_STATUSES.join(', ')}.`);
    err.status = 400;
    throw err;
  }
  return status.toLowerCase();
}

/**
 * Validates task due date.
 * If provided, must match YYYY-MM-DD format and be a valid calendar date.
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
    INSERT INTO tasks (user_id, title, details, status, priority, due_date, completed_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING
      id,
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
  status,
  priority,
  q = '',
  limit = 20,
  offset = 0,
  pool = getPool(),
}) {
  const conditions = ['user_id = $1', 'deleted_at IS NULL'];
  const values = [userId];

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
 * Finds an owned, active task by id and user_id.
 */
export async function findTaskByIdAndUserId({ id, userId, pool = getPool() }) {
  const query = `
    SELECT
      id,
      title,
      details,
      status,
      priority,
      to_char(due_date, 'YYYY-MM-DD') AS "dueDate",
      completed_at AS "completedAt",
      created_at AS "createdAt",
      updated_at AS "updatedAt"
    FROM tasks
    WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL;
  `;

  const result = await pool.query(query, [id, userId]);
  return result.rows[0] || null;
}

/**
 * Updates an owned, active task.
 */
export async function updateTask({
  id,
  userId,
  title,
  details,
  status,
  priority,
  dueDate,
  pool = getPool(),
}) {
  const existing = await findTaskByIdAndUserId({ id, userId, pool });
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
    WHERE id = $7 AND user_id = $8 AND deleted_at IS NULL
    RETURNING
      id,
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
    finalTitle,
    finalDetails,
    finalStatus,
    finalPriority,
    finalDueDate,
    finalCompletedAt,
    id,
    userId,
  ];

  const result = await pool.query(updateQuery, values);
  if (result.rowCount === 1) {
    return { task: result.rows[0] };
  }

  return { notFound: true };
}

/**
 * Sets task status to completed or pending (convenience method).
 */
export async function setTaskStatus({ id, userId, status, pool = getPool() }) {
  const normalizedStatus = validateTaskStatus(status);
  const completedAtExpr = normalizedStatus === 'completed' ? 'now()' : 'NULL';

  const query = `
    UPDATE tasks
    SET
      status = $1,
      completed_at = ${completedAtExpr},
      updated_at = now()
    WHERE id = $2 AND user_id = $3 AND deleted_at IS NULL
    RETURNING
      id,
      title,
      details,
      status,
      priority,
      to_char(due_date, 'YYYY-MM-DD') AS "dueDate",
      completed_at AS "completedAt",
      created_at AS "createdAt",
      updated_at AS "updatedAt";
  `;

  const result = await pool.query(query, [normalizedStatus, id, userId]);
  if (result.rowCount === 1) {
    return { task: result.rows[0] };
  }

  return { notFound: true };
}

/**
 * Soft deletes an owned task. Never physically deletes task rows.
 */
export async function softDeleteTask({ id, userId, pool = getPool() }) {
  const query = `
    UPDATE tasks
    SET
      deleted_at = now(),
      updated_at = now()
    WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL
    RETURNING id;
  `;

  const result = await pool.query(query, [id, userId]);
  if (result.rowCount === 1) {
    return { success: true, deleted: true };
  }

  return { notFound: true };
}
