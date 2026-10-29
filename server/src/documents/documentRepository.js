import { getPool } from '../db/pool.js';

export const DOCUMENT_LIMITS = {
  MAX_TITLE_LENGTH: 200,
  MAX_URL_LENGTH: 2048,
  MAX_DESCRIPTION_LENGTH: 2000,
  MAX_TOPIC_LENGTH: 80,
  ALLOWED_CATEGORIES: ['pdf', 'article', 'documentation', 'course', 'video', 'repository', 'other'],
};

/**
 * Escapes characters that carry special meaning inside SQL LIKE/ILIKE patterns.
 */
function escapeLikeWildcards(str) {
  return str.replace(/([%_\\])/g, '\\$1');
}

/**
 * Validates and normalizes document title.
 */
export function validateAndNormalizeTitle(title) {
  if (typeof title !== 'string') {
    const err = new Error('Field "title" must be a string.');
    err.status = 400;
    throw err;
  }
  const trimmed = title.trim();
  if (trimmed.length === 0) {
    const err = new Error('Document title cannot be empty.');
    err.status = 400;
    throw err;
  }
  if (trimmed.length > DOCUMENT_LIMITS.MAX_TITLE_LENGTH) {
    const err = new Error(
      `Document title cannot exceed ${DOCUMENT_LIMITS.MAX_TITLE_LENGTH} characters.`
    );
    err.status = 400;
    throw err;
  }
  return trimmed;
}

/**
 * Validates and normalizes document URL.
 * Strictly permits only http: and https: protocols.
 */
export function validateAndNormalizeUrl(url) {
  if (typeof url !== 'string') {
    const err = new Error('Field "url" must be a string.');
    err.status = 400;
    throw err;
  }
  const trimmed = url.trim();
  if (trimmed.length === 0) {
    const err = new Error('Document URL cannot be empty.');
    err.status = 400;
    throw err;
  }
  if (trimmed.length > DOCUMENT_LIMITS.MAX_URL_LENGTH) {
    const err = new Error(
      `Document URL cannot exceed ${DOCUMENT_LIMITS.MAX_URL_LENGTH} characters.`
    );
    err.status = 400;
    throw err;
  }

  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    const err = new Error('Document URL must be a valid, well-formed URL.');
    err.status = 400;
    throw err;
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    const err = new Error('Document URL must use http or https protocol.');
    err.status = 400;
    throw err;
  }

  return trimmed;
}

/**
 * Validates and normalizes document description.
 */
export function validateAndNormalizeDescription(description) {
  if (description === undefined || description === null) {
    return null;
  }
  if (typeof description !== 'string') {
    const err = new Error('Field "description" must be a string.');
    err.status = 400;
    throw err;
  }
  const trimmed = description.trim();
  if (trimmed.length === 0) {
    return null;
  }
  if (trimmed.length > DOCUMENT_LIMITS.MAX_DESCRIPTION_LENGTH) {
    const err = new Error(
      `Description cannot exceed ${DOCUMENT_LIMITS.MAX_DESCRIPTION_LENGTH} characters.`
    );
    err.status = 400;
    throw err;
  }
  return trimmed;
}

/**
 * Validates and normalizes document topic.
 */
export function validateAndNormalizeTopic(topic) {
  if (topic === undefined || topic === null) {
    return null;
  }
  if (typeof topic !== 'string') {
    const err = new Error('Field "topic" must be a string.');
    err.status = 400;
    throw err;
  }
  const trimmed = topic.trim();
  if (trimmed.length === 0) {
    return null;
  }
  if (trimmed.length > DOCUMENT_LIMITS.MAX_TOPIC_LENGTH) {
    const err = new Error(
      `Topic cannot exceed ${DOCUMENT_LIMITS.MAX_TOPIC_LENGTH} characters.`
    );
    err.status = 400;
    throw err;
  }
  return trimmed;
}

/**
 * Validates document category.
 */
export function validateCategory(category) {
  if (category === undefined || category === null) {
    return 'other';
  }
  if (typeof category !== 'string') {
    const err = new Error('Field "category" must be a string.');
    err.status = 400;
    throw err;
  }
  const normalized = category.trim().toLowerCase();
  if (!DOCUMENT_LIMITS.ALLOWED_CATEGORIES.includes(normalized)) {
    const err = new Error(
      `Invalid category "${category}". Allowed: ${DOCUMENT_LIMITS.ALLOWED_CATEGORIES.join(', ')}.`
    );
    err.status = 400;
    throw err;
  }
  return normalized;
}

/**
 * Validates favorite boolean.
 */
export function validateFavorite(favorite) {
  if (favorite === undefined || favorite === null) {
    return false;
  }
  if (typeof favorite !== 'boolean') {
    const err = new Error('Field "favorite" must be a boolean.');
    err.status = 400;
    throw err;
  }
  return favorite;
}

function mapDocumentRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    workspaceId: row.workspace_id || null,
    title: row.title,
    url: row.url,
    description: row.description,
    category: row.category,
    topic: row.topic,
    favorite: Boolean(row.favorite),
    createdAt: row.created_at ? row.created_at.toISOString() : null,
    updatedAt: row.updated_at ? row.updated_at.toISOString() : null,
  };
}

/**
 * Creates a new document owned by the user.
 */
export async function createDocument({
  userId,
  workspaceId = null,
  title,
  url,
  description = null,
  category = 'other',
  topic = null,
  favorite = false,
  pool = getPool(),
}) {
  const normalizedTitle = validateAndNormalizeTitle(title);
  const normalizedUrl = validateAndNormalizeUrl(url);
  const normalizedDescription = validateAndNormalizeDescription(description);
  const normalizedCategory = validateCategory(category);
  const normalizedTopic = validateAndNormalizeTopic(topic);
  const normalizedFavorite = validateFavorite(favorite);

  const query = `
    INSERT INTO documents (
      user_id,
      workspace_id,
      title,
      url,
      description,
      category,
      topic,
      favorite
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING *;
  `;

  const values = [
    userId,
    workspaceId || null,
    normalizedTitle,
    normalizedUrl,
    normalizedDescription,
    normalizedCategory,
    normalizedTopic,
    normalizedFavorite,
  ];

  const result = await pool.query(query, values);
  return mapDocumentRow(result.rows[0]);
}

/**
 * Lists active documents owned by the user with filtering, search, and pagination.
 */
export async function findDocumentsByUserId({
  userId,
  workspaceId = null,
  category,
  topic,
  favorite,
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

  if (category && DOCUMENT_LIMITS.ALLOWED_CATEGORIES.includes(category.toLowerCase())) {
    values.push(category.toLowerCase());
    conditions.push(`category = $${values.length}`);
  }

  if (typeof topic === 'string' && topic.trim().length > 0) {
    values.push(topic.trim().toLowerCase());
    conditions.push(`LOWER(topic) = $${values.length}`);
  }

  if (favorite !== undefined && favorite !== null) {
    if (favorite === true || favorite === 'true') {
      conditions.push(`favorite = true`);
    } else if (favorite === false || favorite === 'false') {
      conditions.push(`favorite = false`);
    }
  }

  if (typeof q === 'string' && q.trim().length > 0) {
    const escaped = escapeLikeWildcards(q.trim());
    values.push(`%${escaped}%`);
    const idx = values.length;
    conditions.push(
      `(title ILIKE $${idx} ESCAPE '\\' OR description ILIKE $${idx} ESCAPE '\\' OR url ILIKE $${idx} ESCAPE '\\' OR topic ILIKE $${idx} ESCAPE '\\')`
    );
  }

  const whereClause = conditions.join(' AND ');

  const countQuery = `SELECT count(*)::int AS total FROM documents WHERE ${whereClause};`;
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
      url,
      description,
      category,
      topic,
      favorite,
      created_at,
      updated_at
    FROM documents
    WHERE ${whereClause}
    ORDER BY favorite DESC, updated_at DESC, id ASC
    LIMIT $${limitParamIdx} OFFSET $${offsetParamIdx};
  `;

  const result = await pool.query(selectQuery, selectValues);
  const hasMore = result.rows.length > parsedLimit;
  const rawItems = (hasMore ? result.rows.slice(0, parsedLimit) : result.rows).map(mapDocumentRow);

  return {
    documents: rawItems,
    items: rawItems,
    rawItems,
    total,
    limit: parsedLimit,
    offset: parsedOffset,
    hasMore,
  };
}

/**
 * Retrieves a single active document by ID.
 */
export async function findDocumentByIdAndUserId({ id, userId, workspaceId = null, pool = getPool() }) {
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
      url,
      description,
      category,
      topic,
      favorite,
      created_at,
      updated_at
    FROM documents
    WHERE ${conditions.join(' AND ')};
  `;
  const result = await pool.query(query, values);
  if (result.rows.length === 0) {
    return null;
  }
  return mapDocumentRow(result.rows[0]);
}

/**
 * Updates an existing document owned by the user.
 */
export async function updateDocument({
  id,
  userId,
  workspaceId = null,
  title,
  url,
  description,
  category,
  topic,
  favorite,
  pool = getPool(),
}) {
  const setClauses = [];
  const values = [id, userId];

  if (title !== undefined) {
    const normalizedTitle = validateAndNormalizeTitle(title);
    values.push(normalizedTitle);
    setClauses.push(`title = $${values.length}`);
  }

  if (url !== undefined) {
    const normalizedUrl = validateAndNormalizeUrl(url);
    values.push(normalizedUrl);
    setClauses.push(`url = $${values.length}`);
  }

  if (description !== undefined) {
    const normalizedDescription = validateAndNormalizeDescription(description);
    values.push(normalizedDescription);
    setClauses.push(`description = $${values.length}`);
  }

  if (category !== undefined) {
    const normalizedCategory = validateCategory(category);
    values.push(normalizedCategory);
    setClauses.push(`category = $${values.length}`);
  }

  if (topic !== undefined) {
    const normalizedTopic = validateAndNormalizeTopic(topic);
    values.push(normalizedTopic);
    setClauses.push(`topic = $${values.length}`);
  }

  if (favorite !== undefined) {
    const normalizedFavorite = validateFavorite(favorite);
    values.push(normalizedFavorite);
    setClauses.push(`favorite = $${values.length}`);
  }

  if (setClauses.length === 0) {
    return findDocumentByIdAndUserId({ id, userId, workspaceId, pool });
  }

  setClauses.push('updated_at = now()');

  const conditions = ['id = $1', 'user_id = $2', 'deleted_at IS NULL'];
  if (workspaceId) {
    values.push(workspaceId);
    conditions.push(`workspace_id = $${values.length}`);
  }

  const query = `
    UPDATE documents
    SET ${setClauses.join(', ')}
    WHERE ${conditions.join(' AND ')}
    RETURNING *;
  `;

  const result = await pool.query(query, values);
  if (result.rows.length === 0) {
    return null;
  }
  return mapDocumentRow(result.rows[0]);
}

/**
 * Sets document favorite status.
 */
export async function setDocumentFavorite({ id, userId, workspaceId = null, favorite, pool = getPool() }) {
  const normalizedFavorite = validateFavorite(favorite);
  const conditions = ['id = $1', 'user_id = $2', 'deleted_at IS NULL'];
  const values = [id, userId, normalizedFavorite];
  if (workspaceId) {
    values.push(workspaceId);
    conditions.push(`workspace_id = $${values.length}`);
  }

  const query = `
    UPDATE documents
    SET favorite = $3, updated_at = now()
    WHERE ${conditions.join(' AND ')}
    RETURNING *;
  `;
  const result = await pool.query(query, values);
  if (result.rows.length === 0) {
    return null;
  }
  return mapDocumentRow(result.rows[0]);
}

/**
 * Soft deletes a document.
 */
export async function softDeleteDocument({ id, userId, workspaceId = null, pool = getPool() }) {
  const conditions = ['id = $1', 'user_id = $2', 'deleted_at IS NULL'];
  const values = [id, userId];
  if (workspaceId) {
    values.push(workspaceId);
    conditions.push(`workspace_id = $${values.length}`);
  }

  const query = `
    UPDATE documents
    SET deleted_at = now(), updated_at = now()
    WHERE ${conditions.join(' AND ')}
    RETURNING id;
  `;
  const result = await pool.query(query, values);
  return (result.rowCount ?? 0) > 0;
}

