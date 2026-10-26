import pg from 'pg';
import { getDbConfig } from '../config/db.config.js';

const { Pool } = pg;

let pool = null;

/**
 * Returns the shared application database pool.
 * Initializes the pool lazily on first access.
 *
 * @returns {pg.Pool}
 */
export function getPool() {
  if (!pool) {
    const config = getDbConfig();
    pool = new Pool(config);

    // Handle unexpected errors on idle clients in the pool without crashing the process
    pool.on('error', (err) => {
      console.error('[Database Pool Error] Unexpected idle client error:', err.message);
    });
  }
  return pool;
}

/**
 * Executes a parameterized query using the shared connection pool.
 *
 * @param {string} text - SQL query string
 * @param {Array<unknown>} [params] - Parameterized query values
 * @returns {Promise<pg.QueryResult>}
 */
export async function query(text, params) {
  const activePool = getPool();
  return activePool.query(text, params);
}

/**
 * Checks out a client from the pool for transactional multi-statement workflows.
 * Caller MUST release the client in a finally block:
 *
 * const client = await getClient();
 * try {
 *   await client.query('BEGIN');
 *   ...
 *   await client.query('COMMIT');
 * } catch (err) {
 *   await client.query('ROLLBACK');
 *   throw err;
 * } finally {
 *   client.release();
 * }
 *
 * @returns {Promise<pg.PoolClient>}
 */
export async function getClient() {
  const activePool = getPool();
  return activePool.connect();
}

/**
 * Closes the database connection pool gracefully within a bounded timeout.
 *
 * @param {number} [timeoutMs=5000] - Maximum time to wait for pool termination
 * @returns {Promise<void>}
 */
export async function closePool(timeoutMs = 5000) {
  if (!pool) {
    return;
  }

  const currentPool = pool;
  pool = null;

  const closePromise = currentPool.end();
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new Error('Database pool shutdown timed out')), timeoutMs).unref();
  });

  try {
    await Promise.race([closePromise, timeoutPromise]);
    console.log('[Database Pool] Closed all connections cleanly.');
  } catch (err) {
    console.error('[Database Pool] Error during pool closure:', err.message);
  }
}

/**
 * Checks readiness of the database and verification of the initial schema.
 *
 * @param {pg.Pool} [customPool] - Optional pool instance (defaults to shared pool)
 * @returns {Promise<boolean>} True if database is reachable and app_metadata exists, false otherwise.
 */
export async function checkDatabaseReadiness(customPool) {
  try {
    const activePool = customPool || getPool();
    // Bounded check querying for the presence of the foundation table
    const result = await activePool.query(
      "SELECT to_regclass('public.app_metadata') AS table_ref;"
    );

    const hasTable = result.rows.length > 0 && result.rows[0].table_ref !== null;
    return hasTable;
  } catch {
    return false;
  }
}
