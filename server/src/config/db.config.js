/**
 * Database Configuration Module
 * Validates discrete PostgreSQL connection settings from environment variables.
 * Never prints or leaks passwords, connection strings, or full config objects.
 */

const REQUIRED_VARS = ['PGHOST', 'PGPORT', 'PGDATABASE', 'PGUSER', 'PGPASSWORD'];

/**
 * Validates and returns database connection configuration.
 * Throws descriptive errors if any setting is missing or invalid.
 *
 * @returns {import('pg').PoolConfig}
 */
export function getDbConfig() {
  const missing = REQUIRED_VARS.filter((varName) => !process.env[varName] || process.env[varName].trim() === '');
  if (missing.length > 0) {
    throw new Error(
      `Database configuration error: Missing required environment variable(s): ${missing.join(', ')}. ` +
      'Please verify that server/.env exists and defines these variables.'
    );
  }

  const port = parseInt(process.env.PGPORT, 10);
  if (Number.isNaN(port) || port < 1 || port > 65535) {
    throw new Error('Database configuration error: PGPORT must be a valid port number between 1 and 65535.');
  }

  return {
    host: process.env.PGHOST.trim(),
    port,
    database: process.env.PGDATABASE.trim(),
    user: process.env.PGUSER.trim(),
    password: process.env.PGPASSWORD,
    // Finite connection and query timeouts to prevent hanging resources
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
    statement_timeout: 10000,
    max: 10,
  };
}
