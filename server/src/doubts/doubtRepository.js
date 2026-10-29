import { getPool } from '../db/pool.js';

export const DOUBT_LIMITS = {
  MAX_QUESTION_LENGTH: 1000,
  MAX_DETAILS_LENGTH: 5000,
  MAX_RESOLUTION_LENGTH: 5000,
  MAX_SUBJECT_LENGTH: 80,
  ALLOWED_STATUSES: ['open', 'resolved'],
};

/**
 * Escapes characters that carry special meaning inside SQL LIKE/ILIKE patterns.
 */
function escapeLikeWildcards(str) {
  return str.replace(/([%_\\])/g, '\\$1');
}

/**
 * Validates and normalizes doubt question.
 */
export function validateAndNormalizeQuestion(question) {
  if (typeof question !== 'string') {
    const err = new Error('Field "question" must be a string.');
    err.status = 400;
    throw err;
  }
  const trimmed = question.trim();
  if (trimmed.length === 0) {
    const err = new Error('Doubt question cannot be empty.');
    err.status = 400;
    throw err;
  }
  if (trimmed.length > DOUBT_LIMITS.MAX_QUESTION_LENGTH) {
    const err = new Error(
      `Doubt question cannot exceed ${DOUBT_LIMITS.MAX_QUESTION_LENGTH} characters.`
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
  if (trimmed.length > DOUBT_LIMITS.MAX_DETAILS_LENGTH) {
    const err = new Error(
      `Details cannot exceed ${DOUBT_LIMITS.MAX_DETAILS_LENGTH} characters.`
    );
    err.status = 400;
    throw err;
  }
  return trimmed;
}

/**
 * Validates and normalizes resolution text.
 */
export function validateAndNormalizeResolution(resolution) {
  if (resolution === undefined || resolution === null) {
    return null;
  }
  if (typeof resolution !== 'string') {
    const err = new Error('Field "resolution" must be a string.');
    err.status = 400;
    throw err;
  }
  const trimmed = resolution.trim();
  if (trimmed.length === 0) {
    return null;
  }
  if (trimmed.length > DOUBT_LIMITS.MAX_RESOLUTION_LENGTH) {
    const err = new Error(
      `Resolution cannot exceed ${DOUBT_LIMITS.MAX_RESOLUTION_LENGTH} characters.`
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
  if (trimmed.length > DOUBT_LIMITS.MAX_SUBJECT_LENGTH) {
    const err = new Error(
      `Subject cannot exceed ${DOUBT_LIMITS.MAX_SUBJECT_LENGTH} characters.`
    );
    err.status = 400;
    throw err;
  }
  return trimmed;
}

/**
 * Validates status ('open' or 'resolved').
 */
export function validateDoubtStatus(status) {
  if (status === undefined || status === null) {
    return 'open';
  }
  if (typeof status !== 'string') {
    const err = new Error('Field "status" must be a string.');
    err.status = 400;
    throw err;
  }
  const normalized = status.trim().toLowerCase();
  if (!DOUBT_LIMITS.ALLOWED_STATUSES.includes(normalized)) {
    const err = new Error(
      `Invalid status "${status}". Allowed: ${DOUBT_LIMITS.ALLOWED_STATUSES.join(', ')}.`
    );
    err.status = 400;
    throw err;
  }
  return normalized;
}

function mapDoubtRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    workspaceId: row.workspace_id || null,
    question: row.question,
    details: row.details,
    subject: row.subject,
    status: row.status,
    resolution: row.resolution,
    resolvedAt: row.resolved_at ? row.resolved_at.toISOString() : null,
    createdAt: row.created_at ? row.created_at.toISOString() : null,
    updatedAt: row.updated_at ? row.updated_at.toISOString() : null,
  };
}

/**
 * Creates a new doubt.
 */
export async function createDoubt({
  userId,
  workspaceId = null,
  question,
  details = null,
  subject = null,
  status = 'open',
  resolution = null,
  pool = getPool(),
}) {
  const normalizedQuestion = validateAndNormalizeQuestion(question);
  const normalizedDetails = validateAndNormalizeDetails(details);
  const normalizedResolution = validateAndNormalizeResolution(resolution);
  const normalizedSubject = validateAndNormalizeSubject(subject);
  const normalizedStatus = validateDoubtStatus(status);
  const resolvedAt = normalizedStatus === 'resolved' ? new Date() : null;

  const query = `
    INSERT INTO doubts (
      user_id,
      workspace_id,
      question,
      details,
      subject,
      status,
      resolution,
      resolved_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING *;
  `;

  const values = [
    userId,
    workspaceId || null,
    normalizedQuestion,
    normalizedDetails,
    normalizedSubject,
    normalizedStatus,
    normalizedResolution,
    resolvedAt,
  ];

  const result = await pool.query(query, values);
  return mapDoubtRow(result.rows[0]);
}

/**
 * Lists active doubts owned by the user with filtering, search, and pagination.
 */
export async function findDoubtsByUserId({
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

  if (status && DOUBT_LIMITS.ALLOWED_STATUSES.includes(status.toLowerCase())) {
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
      `(question ILIKE $${idx} ESCAPE '\\' OR details ILIKE $${idx} ESCAPE '\\' OR subject ILIKE $${idx} ESCAPE '\\' OR resolution ILIKE $${idx} ESCAPE '\\')`
    );
  }

  const whereClause = conditions.join(' AND ');

  const countQuery = `SELECT count(*)::int AS total FROM doubts WHERE ${whereClause};`;
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
      question,
      details,
      subject,
      status,
      resolution,
      resolved_at,
      created_at,
      updated_at
    FROM doubts
    WHERE ${whereClause}
    ORDER BY CASE WHEN status = 'open' THEN 0 ELSE 1 END ASC, updated_at DESC, id ASC
    LIMIT $${limitParamIdx} OFFSET $${offsetParamIdx};
  `;

  const result = await pool.query(selectQuery, selectValues);
  const hasMore = result.rows.length > parsedLimit;
  const rawItems = (hasMore ? result.rows.slice(0, parsedLimit) : result.rows).map(mapDoubtRow);

  return {
    doubts: rawItems,
    items: rawItems,
    rawItems,
    total,
    limit: parsedLimit,
    offset: parsedOffset,
    hasMore,
  };
}

/**
 * Retrieves a single active doubt by ID.
 */
export async function findDoubtByIdAndUserId({ id, userId, workspaceId = null, pool = getPool() }) {
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
      question,
      details,
      subject,
      status,
      resolution,
      resolved_at,
      created_at,
      updated_at
    FROM doubts
    WHERE ${conditions.join(' AND ')};
  `;
  const result = await pool.query(query, values);
  if (result.rows.length === 0) {
    return null;
  }
  return mapDoubtRow(result.rows[0]);
}

/**
 * Updates an existing doubt.
 */
export async function updateDoubt({
  id,
  userId,
  workspaceId = null,
  question,
  details,
  subject,
  status,
  resolution,
  pool = getPool(),
}) {
  const current = await findDoubtByIdAndUserId({ id, userId, workspaceId, pool });
  if (!current) {
    return null;
  }

  const setClauses = [];
  const values = [id, userId];

  if (question !== undefined) {
    const normalizedQuestion = validateAndNormalizeQuestion(question);
    values.push(normalizedQuestion);
    setClauses.push(`question = $${values.length}`);
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

  if (resolution !== undefined) {
    const normalizedResolution = validateAndNormalizeResolution(resolution);
    values.push(normalizedResolution);
    setClauses.push(`resolution = $${values.length}`);
  }

  if (status !== undefined) {
    const normalizedStatus = validateDoubtStatus(status);
    values.push(normalizedStatus);
    setClauses.push(`status = $${values.length}`);

    if (normalizedStatus === 'resolved' && current.status !== 'resolved') {
      setClauses.push(`resolved_at = now()`);
    } else if (normalizedStatus === 'open' && current.status !== 'open') {
      setClauses.push(`resolved_at = NULL`);
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
    UPDATE doubts
    SET ${setClauses.join(', ')}
    WHERE ${conditions.join(' AND ')}
    RETURNING *;
  `;

  const result = await pool.query(query, values);
  if (result.rows.length === 0) {
    return null;
  }
  return mapDoubtRow(result.rows[0]);
}

/**
 * Sets doubt status ('open' or 'resolved'), optionally setting resolution.
 */
export async function setDoubtStatus({ id, userId, workspaceId = null, status, resolution, pool = getPool() }) {
  const normalizedStatus = validateDoubtStatus(status);
  const conditions = ['id = $1', 'user_id = $2', 'deleted_at IS NULL'];
  const values = [id, userId, normalizedStatus];
  const setClauses = [`status = $3`];

  if (normalizedStatus === 'resolved') {
    setClauses.push('resolved_at = now()');
    if (resolution !== undefined) {
      const normalizedResolution = validateAndNormalizeResolution(resolution);
      values.push(normalizedResolution);
      setClauses.push(`resolution = $${values.length}`);
    }
  } else {
    // When returning to open, clear resolved_at but preserve existing resolution unless explicitly passed
    setClauses.push('resolved_at = NULL');
    if (resolution !== undefined) {
      const normalizedResolution = validateAndNormalizeResolution(resolution);
      values.push(normalizedResolution);
      setClauses.push(`resolution = $${values.length}`);
    }
  }

  setClauses.push('updated_at = now()');

  if (workspaceId) {
    values.push(workspaceId);
    conditions.push(`workspace_id = $${values.length}`);
  }

  const query = `
    UPDATE doubts
    SET ${setClauses.join(', ')}
    WHERE ${conditions.join(' AND ')}
    RETURNING *;
  `;

  const result = await pool.query(query, values);
  if (result.rows.length === 0) {
    return null;
  }
  return mapDoubtRow(result.rows[0]);
}

/**
 * Soft deletes a doubt.
 */
export async function softDeleteDoubt({ id, userId, workspaceId = null, pool = getPool() }) {
  const conditions = ['id = $1', 'user_id = $2', 'deleted_at IS NULL'];
  const values = [id, userId];
  if (workspaceId) {
    values.push(workspaceId);
    conditions.push(`workspace_id = $${values.length}`);
  }

  const query = `
    UPDATE doubts
    SET deleted_at = now(), updated_at = now()
    WHERE ${conditions.join(' AND ')}
    RETURNING id;
  `;
  const result = await pool.query(query, values);
  return (result.rowCount ?? 0) > 0;
}

