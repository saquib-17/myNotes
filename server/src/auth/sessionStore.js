import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import { getPool } from '../db/pool.js';

const PgSession = connectPgSimple(session);

let storeInstance = null;

/**
 * Returns the shared PostgreSQL session store instance.
 * Lazily initializes using the application's shared pg.Pool.
 *
 * @returns {connectPgSimple.PGStore}
 */
export function getSessionStore() {
  if (!storeInstance) {
    storeInstance = new PgSession({
      pool: getPool(),
      tableName: 'session',
      createTableIfMissing: false,
      pruneSessionInterval: 900, // Prune expired sessions every 15 minutes
    });
  }
  return storeInstance;
}

/**
 * Gracefully shuts down the session store prune timer during server termination.
 * Note: Since connect-pg-simple was provided an external pool, this does NOT close the pool itself.
 *
 * @returns {Promise<void>}
 */
export async function closeSessionStore() {
  if (storeInstance) {
    try {
      await storeInstance.close();
      console.log('[Session Store] Prune timer cleared.');
    } catch (err) {
      console.error('[Session Store Error] Failed to close cleanly:', err.message);
    } finally {
      storeInstance = null;
    }
  }
}
