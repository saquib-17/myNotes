import dotenv from 'dotenv';
dotenv.config();

import { getDbConfig } from '../config/db.config.js';
import { getPool, closePool } from './pool.js';

async function checkDatabase() {
  console.log('[Database Verification] Running safe connectivity and readiness check...');

  let config;
  try {
    config = getDbConfig();
  } catch (err) {
    console.error(`[Database Verification Error] ${err.message}`);
    process.exit(1);
  }

  const pool = getPool();

  try {
    // 1. Verify connection and current credentials
    const identResult = await pool.query(
      'SELECT current_user, current_database(), version();'
    );
    const { current_user: currentUser, current_database: currentDb } = identResult.rows[0];

    console.log(`[Database Verification] Connection established: host="${config.host}", port=${config.port}`);
    console.log(`[Database Verification] Authenticated identity: user="${currentUser}", database="${currentDb}"`);

    let passed = true;

    // Check user match
    if (currentUser !== config.user) {
      console.error(`[Database Verification FAILED] Expected user "${config.user}", but got "${currentUser}".`);
      passed = false;
    }

    // Check database match
    if (currentDb !== config.database) {
      console.error(`[Database Verification FAILED] Expected database "${config.database}", but got "${currentDb}".`);
      passed = false;
    }

    // 2. Verify foundation schema presence
    const schemaResult = await pool.query(
      "SELECT to_regclass('public.app_metadata') AS table_ref;"
    );
    const hasMetadata = schemaResult.rows[0]?.table_ref !== null;

    if (hasMetadata) {
      console.log('[Database Verification] Foundation schema check: table "app_metadata" is present and ready.');
    } else {
      console.warn('[Database Verification WARNING] Foundation table "app_metadata" is not found. Please run "npm run db:migrate".');
      passed = false;
    }

    if (passed) {
      console.log('\n[Database Verification SUCCESS] Database is ready for application use.');
      process.exitCode = 0;
    } else {
      console.error('\n[Database Verification FAILED] One or more verification checks failed.');
      process.exitCode = 1;
    }
  } catch (err) {
    console.error(`[Database Verification FAILED] Connection error: ${err.message}`);
    process.exitCode = 1;
  } finally {
    await closePool();
  }
}

checkDatabase();
