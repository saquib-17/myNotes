import { getPool } from '../db/pool.js';

export const REVISION_ITEM_LIMITS = {
  MAX_TITLE_LENGTH: 200,
  MAX_DETAILS_LENGTH: 5000,
  MAX_SUBJECT_LENGTH: 80,
  ALLOWED_STATUSES: ['pending', 'revised'],
};

/**
 * Escapes characters that carry special meaning inside SQL LIKE/ILIKE patterns.
 */
function escapeLikeWildcards(str) {
  return str.replace(/([%_\\])/g, '\\$1');
}

/**
 * Validates and normalizes revision item title.
 */
export function validateAndNormalizeTitle(title) {
  if (typeof title !== 'string') {
    const err = new Error('Field "title" must be a string.');
    err.status = 400;
    throw err;
  }
  const trimmed = title.trim();
  if (trimmed.length === 0) {
    const err = new Error('Revision item title cannot be empty.');
    err.status = 400;
    throw err;
  }
  if (trimmed.length > REVISION_ITEM_LIMITS.MAX_TITLE_LENGTH) {
    const err = new Error(
      `Revision item title cannot exceed ${REVISION_ITEM_LIMITS.MAX_TITLE_LENGTH} characters.`
    );
    err.status = 400;
    throw err;
  }
  return trimmed;
}

/**
 * Validates and normalizes details.
 */
export function validateAndNormalizeDetails(details) {
  if (details === undefined || details === null) {
    return null;
  }
  if (typeof details !== 'string') {
    const err = new Error('Field "details" must be a string.');
    err.status = 400;
    throw err;
  }
  const trimmed = details.trim();
  if (trimmed.length === 0) {
    return null;
  }
  if (trimmed.length > REVISION_ITEM_LIMITS.MAX_DETAILS_LENGTH) {
    const err = new Error(
      `Details cannot exceed ${REVISION_ITEM_LIMITS.MAX_DETAILS_LENGTH} characters.`
    );
    err.status = 400;
    throw err;
  }
  return trimmed;
}

/**
 * Validates and normalizes subject.
 */
export function validateAndNormalizeSubject(subject) {
  if (subject === undefined || subject === null) {
    return null;
  }
  if (typeof subject !== 'string') {
    const err = new Error('Field "subject" must be a string.');
    err.status = 400;
    throw err;
  }
  const trimmed = subject.trim();
  if (trimmed.length === 0) {
    return null;
  }
  if (trimmed.length > REVISION_ITEM_LIMITS.MAX_SUBJECT_LENGTH) {
    const err = new Error(
      `Subject cannot exceed ${REVISION_ITEM_LIMITS.MAX_SUBJECT_LENGTH} characters.`
    );
    err.status = 400;
    throw err;
  }
  return trimmed;
}

/**
 * Validates status ('pending' or 'revised').
 */
export function validateRevisionStatus(status) {
  if (status === undefined || status === null) {
    return 'pending';
  }
  if (typeof status !== 'string') {
    const err = new Error('Field "status" must be a string.');
    err.status = 400;
    throw err;
  }
  const normalized = status.trim().toLowerCase();
  if (!REVISION_ITEM_LIMITS.ALLOWED_STATUSES.includes(normalized)) {
    const err = new Error(
      `Invalid status "${status}". Allowed: ${REVISION_ITEM_LIMITS.ALLOWED_STATUSES.join(', ')}.`
    );
    err.status = 400;
    throw err;
  }
  return normalized;
}

function mapRevisionItemRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    workspaceId: row.workspace_id || null,
    title: row.title,
    details: row.details,
    subject: row.subject,
    status: row.status,
    revisedAt: row.revised_at ? row.revised_at.toISOString() : null,
    createdAt: row.created_at ? row.created_at.toISOString() : null,
    updatedAt: row.updated_at ? row.updated_at.toISOString() : null,
  };
}

/**
 * Creates a new revision item.
 */
export async function createRevisionItem({
  userId,
  workspaceId = null,
  title,
  details = null,
  subject = null,
  status = 'pending',
  pool = getPool(),
}) {
  const normalizedTitle = validateAndNormalizeTitle(title);
  const normalizedDetails = validateAndNormalizeDetails(details);
  const normalizedSubject = validateAndNormalizeSubject(subject);
  const normalizedStatus = validateRevisionStatus(status);
  const revisedAt = normalizedStatus === 'revised' ? new Date() : null;

  const query = `
    INSERT INTO revision_items (
      user_id,
      workspace_id,
      title,
      details,
      subject,
      status,
      revised_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING *;
  `;

  const values = [
    userId,
    workspaceId || null,
    normalizedTitle,
    normalizedDetails,
    normalizedSubject,
    normalizedStatus,
    revisedAt,
  ];

  const result = await pool.query(query, values);
  return mapRevisionItemRow(result.rows[0]);
}

/**
 * Lists active revision items owned by the user with filtering, search, and pagination.
 */
export async function findRevisionItemsByUserId({
  userId,
  workspaceId = null,
  status,
  subject,
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

  if (status && REVISION_ITEM_LIMITS.ALLOWED_STATUSES.includes(status.toLowerCase())) {
    values.push(status.toLowerCase());
    conditions.push(`status = $${values.length}`);
  }

  if (typeof subject === 'string' && subject.trim().length > 0) {
    values.push(subject.trim().toLowerCase());
    conditions.push(`LOWER(subject) = $${values.length}`);
  }

  if (typeof q === 'string' && q.trim().length > 0) {
    const escaped = escapeLikeWildcards(q.trim());
    values.push(`%${escaped}%`);
    const idx = values.length;
    conditions.push(
      `(title ILIKE $${idx} ESCAPE '\\' OR details ILIKE $${idx} ESCAPE '\\' OR subject ILIKE $${idx} ESCAPE '\\')`
    );
  }

  const whereClause = conditions.join(' AND ');

  const countQuery = `SELECT count(*)::int AS total FROM revision_items WHERE ${whereClause};`;
  const countResult = await pool.query(countQuery, values);
  const total = countResult.rows[0].total;

  const parsedLimit = Math.max(1, Math.min(100, parseInt(limit, 10) || 20));
  const parsedOffset = Math.max(0, parseInt(offset, 10) || 0);

  const selectValues = [...values, parsedLimit + 1, parsedOffset];
  const limitParamIdx = selectValues.length - 1;
  const offsetParamIdx = selectValues.length;

  const selectQuery = `
    SELECT
      id,
      title,
      details,
      subject,
      status,
      revised_at,
      created_at,
      updated_at
    FROM revision_items
    WHERE ${whereClause}
    ORDER BY CASE WHEN status = 'pending' THEN 0 ELSE 1 END ASC, updated_at DESC, id ASC
    LIMIT $${limitParamIdx} OFFSET $${offsetParamIdx};
  `;

  const result = await pool.query(selectQuery, selectValues);
  const hasMore = result.rows.length > parsedLimit;
  const rawItems = (hasMore ? result.rows.slice(0, parsedLimit) : result.rows).map(mapRevisionItemRow);

  return {
    revisionItems: rawItems,
    items: rawItems,
    rawItems,
    total,
    limit: parsedLimit,
    offset: parsedOffset,
    hasMore,
  };
}

/**
 * Retrieves a single active revision item by ID.
 */
export async function findRevisionItemByIdAndUserId({ id, userId, workspaceId = null, pool = getPool() }) {
  const conditions = ['id = $1', 'user_id = $2', 'deleted_at IS NULL'];
  const values = [id, userId];
  if (workspaceId) {
    values.push(workspaceId);
    conditions.push(`workspace_id = $${values.length}`);
  }

  const query = `
    SELECT
      id,
      workspace_id,
      title,
      details,
      subject,
      status,
      revised_at,
      created_at,
      updated_at
    FROM revision_items
    WHERE ${conditions.join(' AND ')};
  `;
  const result = await pool.query(query, values);
  if (result.rows.length === 0) {
    return null;
  }
  return mapRevisionItemRow(result.rows[0]);
}

/**
 * Updates an existing revision item.
 */
export async function updateRevisionItem({
  id,
  userId,
  workspaceId = null,
  title,
  details,
  subject,
  status,
  pool = getPool(),
}) {
  const current = await findRevisionItemByIdAndUserId({ id, userId, workspaceId, pool });
  if (!current) {
    return null;
  }

  const setClauses = [];
  const values = [id, userId];

  if (title !== undefined) {
    const normalizedTitle = validateAndNormalizeTitle(title);
    values.push(normalizedTitle);
    setClauses.push(`title = $${values.length}`);
  }

  if (details !== undefined) {
    const normalizedDetails = validateAndNormalizeDetails(details);
    values.push(normalizedDetails);
    setClauses.push(`details = $${values.length}`);
  }

  if (subject !== undefined) {
    const normalizedSubject = validateAndNormalizeSubject(subject);
    values.push(normalizedSubject);
    setClauses.push(`subject = $${values.length}`);
  }

  if (status !== undefined) {
    const normalizedStatus = validateRevisionStatus(status);
    values.push(normalizedStatus);
    setClauses.push(`status = $${values.length}`);

    if (normalizedStatus === 'revised' && current.status !== 'revised') {
      setClauses.push(`revised_at = now()`);
    } else if (normalizedStatus === 'pending' && current.status !== 'pending') {
      setClauses.push(`revised_at = NULL`);
    }
  }

  if (setClauses.length === 0) {
    return current;
  }

  setClauses.push('updated_at = now()');

  const conditions = ['id = $1', 'user_id = $2', 'deleted_at IS NULL'];
  if (workspaceId) {
    values.push(workspaceId);
    conditions.push(`workspace_id = $${values.length}`);
  }

  const query = `
    UPDATE revision_items
    SET ${setClauses.join(', ')}
    WHERE ${conditions.join(' AND ')}
    RETURNING *;
  `;

  const result = await pool.query(query, values);
  if (result.rows.length === 0) {
    return null;
  }
  return mapRevisionItemRow(result.rows[0]);
}

/**
 * Sets revision item status directly ('pending' or 'revised').
 */
export async function setRevisionItemStatus({ id, userId, workspaceId = null, status, pool = getPool() }) {
  const normalizedStatus = validateRevisionStatus(status);
  const revisedAtClause = normalizedStatus === 'revised' ? 'revised_at = now()' : 'revised_at = NULL';

  const conditions = ['id = $1', 'user_id = $2', 'deleted_at IS NULL'];
  const values = [id, userId, normalizedStatus];
  if (workspaceId) {
    values.push(workspaceId);
    conditions.push(`workspace_id = $${values.length}`);
  }

  const query = `
    UPDATE revision_items
    SET status = $3, ${revisedAtClause}, updated_at = now()
    WHERE ${conditions.join(' AND ')}
    RETURNING *;
  `;

  const result = await pool.query(query, values);
  if (result.rows.length === 0) {
    return null;
  }
  return mapRevisionItemRow(result.rows[0]);
}

/**
 * Soft deletes a revision item.
 */
export async function softDeleteRevisionItem({ id, userId, workspaceId = null, pool = getPool() }) {
  const conditions = ['id = $1', 'user_id = $2', 'deleted_at IS NULL'];
  const values = [id, userId];
  if (workspaceId) {
    values.push(workspaceId);
    conditions.push(`workspace_id = $${values.length}`);
  }

  const query = `
    UPDATE revision_items
    SET deleted_at = now(), updated_at = now()
    WHERE ${conditions.join(' AND ')}
    RETURNING id;
  `;
  const result = await pool.query(query, values);
  return (result.rowCount ?? 0) > 0;
}

