import crypto from 'crypto';
import { query } from '../db/pool.js';

/**
 * Creates a safe, non-reversible, opaque session identifier.
 * Ensures session tokens, cookie secrets, or raw SIDs are never exposed to the client.
 *
 * @param {string} sid
 * @returns {string} Safe opaque ID
 */
export function hashSessionId(sid) {
  if (!sid || typeof sid !== 'string') {
    return 'sess_unknown';
  }
  return `sess_${crypto.createHash('sha256').update(sid).digest('hex').slice(0, 16)}`;
}

/**
 * Retrieves all active, non-expired sessions for a user from the PostgreSQL session store.
 *
 * @param {object} params
 * @param {string} params.userId
 * @param {string} [params.currentSessionId]
 * @param {Function} [customQuery]
 * @returns {Promise<Array<{ id: string, createdAt: string|null, lastSeenAt: string|null, expiresAt: string|null, currentSession: boolean }>>}
 */
export async function getUserSessions(
  { userId, currentSessionId },
  customQuery = query
) {
  if (!userId) {
    return [];
  }

  const result = await customQuery(
    `SELECT sid, sess, expire
     FROM "session"
     WHERE sess->>'userId' = $1 AND expire > now()
     ORDER BY expire DESC;`,
    [userId]
  );

  return result.rows.map((row) => {
    let sessData = {};
    if (typeof row.sess === 'string') {
      try {
        sessData = JSON.parse(row.sess);
      } catch {
        sessData = {};
      }
    } else if (row.sess && typeof row.sess === 'object') {
      sessData = row.sess;
    }

    const isCurrent = Boolean(currentSessionId && row.sid === currentSessionId);

    return {
      id: hashSessionId(row.sid),
      createdAt: sessData.createdAt || null,
      lastSeenAt: sessData.lastSeenAt || null,
      expiresAt: row.expire ? new Date(row.expire).toISOString() : null,
      currentSession: isCurrent,
    };
  });
}

/**
 * Invalidates all active sessions for a user EXCEPT the current session.
 *
 * @param {object} params
 * @param {string} params.userId
 * @param {string} params.currentSessionId
 * @param {Function} [customQuery]
 * @returns {Promise<number>} Number of sessions invalidated
 */
export async function invalidateOtherSessions(
  { userId, currentSessionId },
  customQuery = query
) {
  if (!userId) {
    return 0;
  }

  const result = await customQuery(
    `DELETE FROM "session"
     WHERE sess->>'userId' = $1 AND sid != $2;`,
    [userId, currentSessionId || '']
  );

  return result.rowCount || 0;
}

/**
 * Invalidates ALL active sessions for a user (including current).
 *
 * @param {object} params
 * @param {string} params.userId
 * @param {Function} [customQuery]
 * @returns {Promise<number>} Number of sessions invalidated
 */
export async function invalidateAllUserSessions(
  { userId },
  customQuery = query
) {
  if (!userId) {
    return 0;
  }

  const result = await customQuery(
    `DELETE FROM "session"
     WHERE sess->>'userId' = $1;`,
    [userId]
  );

  return result.rowCount || 0;
}

