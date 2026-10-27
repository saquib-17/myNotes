import { getPool } from '../db/pool.js';

export const JOURNAL_LIMITS = {
  MAX_CONTENT_LENGTH: 20000,
};

/**
 * Escapes characters that carry special meaning inside SQL LIKE/ILIKE patterns.
 */
function escapeLikeWildcards(str) {
  return str.replace(/([%_\\])/g, '\\$1');
}

/**
 * Validates journal entry date format (YYYY-MM-DD), ensures calendar validity,
 * and rejects future dates unless allowFuture is explicitly true.
 */
export function validateEntryDate(entryDate, allowFuture = false) {
  if (typeof entryDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(entryDate)) {
    const err = new Error('Journal entry date must be in YYYY-MM-DD format.');
    err.status = 400;
    throw err;
  }

  const [year, month, day] = entryDate.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    const err = new Error('Journal entry date must be a valid calendar date.');
    err.status = 400;
    throw err;
  }

  if (!allowFuture) {
    const now = new Date();
    const localYear = now.getFullYear();
    const localMonth = String(now.getMonth() + 1).padStart(2, '0');
    const localDay = String(now.getDate()).padStart(2, '0');
    const localToday = `${localYear}-${localMonth}-${localDay}`;
    const utcToday = now.toISOString().slice(0, 10);
    const maxToday = localToday > utcToday ? localToday : utcToday;

    if (entryDate > maxToday) {
      const err = new Error('Journal entry date cannot be in the future.');
      err.status = 400;
      throw err;
    }
  }

  return entryDate;
}

/**
 * Validates journal content.
 * Accepts string or null/undefined (treated as empty string). Max length 20,000 characters.
 */
export function validateJournalContent(content) {
  if (content === undefined || content === null) {
    return '';
  }
  if (typeof content !== 'string') {
    const err = new Error('Journal content must be a string.');
    err.status = 400;
    throw err;
  }
  if (content.length > JOURNAL_LIMITS.MAX_CONTENT_LENGTH) {
    const err = new Error(
      `Journal content cannot exceed ${JOURNAL_LIMITS.MAX_CONTENT_LENGTH} characters.`
    );
    err.status = 400;
    throw err;
  }
  return content;
}

/**
 * Lists active journal entries for a user with optional date filtering, text search, and pagination.
 */
export async function findJournalEntriesByUserId({
  userId,
  from,
  to,
  q,
  limit = 20,
  offset = 0,
  pool = getPool(),
}) {
  if (!userId) {
    const err = new Error('userId is required.');
    err.status = 400;
    throw err;
  }

  const parsedLimit = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
  const parsedOffset = Math.max(parseInt(offset, 10) || 0, 0);

  const conditions = ['user_id = $1', 'deleted_at IS NULL'];
  const values = [userId];

  if (from) {
    validateEntryDate(from, true);
    values.push(from);
    conditions.push(`entry_date >= $${values.length}`);
  }

  if (to) {
    validateEntryDate(to, true);
    values.push(to);
    conditions.push(`entry_date <= $${values.length}`);
  }

  if (q && typeof q === 'string' && q.trim()) {
    values.push(`%${escapeLikeWildcards(q.trim())}%`);
    conditions.push(`content ILIKE $${values.length}`);
  }

  const whereClause = conditions.join(' AND ');

  const countQuery = `
    SELECT COUNT(*) AS total
    FROM journal_entries
    WHERE ${whereClause}
  `;
  const countResult = await pool.query(countQuery, values);
  const total = parseInt(countResult.rows[0].total, 10) || 0;

  const selectQuery = `
    SELECT id, user_id, entry_date::text AS entry_date, content, created_at, updated_at
    FROM journal_entries
    WHERE ${whereClause}
    ORDER BY entry_date DESC, id ASC
    LIMIT $${values.length + 1} OFFSET $${values.length + 2}
  `;
  const selectResult = await pool.query(selectQuery, [...values, parsedLimit, parsedOffset]);
  const entries = selectResult.rows;

  return {
    entries,
    items: entries,
    total,
    limit: parsedLimit,
    offset: parsedOffset,
    hasMore: parsedOffset + entries.length < total,
    has_more: parsedOffset + entries.length < total,
  };
}

/**
 * Finds a single active journal entry for a given user and date.
 */
export async function findJournalEntryByDateAndUserId({
  userId,
  entryDate,
  pool = getPool(),
}) {
  if (!userId) {
    const err = new Error('userId is required.');
    err.status = 400;
    throw err;
  }
  const validDate = validateEntryDate(entryDate, true);

  const query = `
    SELECT id, user_id, entry_date::text AS entry_date, content, created_at, updated_at
    FROM journal_entries
    WHERE user_id = $1 AND entry_date = $2 AND deleted_at IS NULL
  `;
  const result = await pool.query(query, [userId, validDate]);
  return result.rows[0] || null;
}

/**
 * Creates or updates an active journal entry for a specific calendar date.
 * If an active entry exists, updates it.
 * If not, creates a new entry (even if an older entry for this date was soft-deleted).
 */
export async function upsertJournalEntry({
  userId,
  entryDate,
  content,
  pool = getPool(),
}) {
  if (!userId) {
    const err = new Error('userId is required.');
    err.status = 400;
    throw err;
  }
  const validDate = validateEntryDate(entryDate, false);
  const validContent = validateJournalContent(content);

  const existing = await findJournalEntryByDateAndUserId({
    userId,
    entryDate: validDate,
    pool,
  });

  if (existing) {
    const updateQuery = `
      UPDATE journal_entries
      SET content = $1, updated_at = NOW()
      WHERE id = $2
      RETURNING id, user_id, entry_date::text AS entry_date, content, created_at, updated_at
    `;
    const result = await pool.query(updateQuery, [validContent, existing.id]);
    return {
      entry: result.rows[0],
      created: false,
    };
  }

  const insertQuery = `
    INSERT INTO journal_entries (user_id, entry_date, content)
    VALUES ($1, $2, $3)
    RETURNING id, user_id, entry_date::text AS entry_date, content, created_at, updated_at
  `;
  const result = await pool.query(insertQuery, [userId, validDate, validContent]);
  return {
    entry: result.rows[0],
    created: true,
  };
}

/**
 * Soft-deletes an active journal entry for a given user and date.
 * Returns true if an entry was soft-deleted, false if not found.
 */
export async function softDeleteJournalEntry({
  userId,
  entryDate,
  pool = getPool(),
}) {
  if (!userId) {
    const err = new Error('userId is required.');
    err.status = 400;
    throw err;
  }
  const validDate = validateEntryDate(entryDate, true);

  const query = `
    UPDATE journal_entries
    SET deleted_at = NOW(), updated_at = NOW()
    WHERE user_id = $1 AND entry_date = $2 AND deleted_at IS NULL
    RETURNING id
  `;
  const result = await pool.query(query, [userId, validDate]);
  return result.rowCount > 0;
}

