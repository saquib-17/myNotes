import dotenv from 'dotenv';
dotenv.config();

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDbConfig } from '../config/db.config.js';
import { getPool, closePool } from './pool.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(__dirname, '../../migrations');

async function showMigrationStatus() {
  console.log('[Migration Status] Inspecting migration history...');

  try {
    getDbConfig();
  } catch (err) {
    console.error(`[Migration Status Error] ${err.message}`);
    process.exit(1);
  }

  const pool = getPool();

  try {
    // Check if the migration history table exists
    const checkTable = await pool.query(
      "SELECT to_regclass('public.pgmigrations') AS ref;"
    );

    if (checkTable.rows[0]?.ref === null) {
      console.log('[Migration Status] Migration history table "pgmigrations" is not initialized.');
      console.log('No migrations have been executed yet.');
      return;
    }

    // Read applied migrations from pgmigrations
    const appliedResult = await pool.query(
      'SELECT id, name, run_on FROM pgmigrations ORDER BY id ASC;'
    );
    const appliedNames = new Set(appliedResult.rows.map((r) => r.name));

    // Read files from migrations directory
    const files = fs.existsSync(migrationsDir)
      ? fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql') || f.endsWith('.js'))
      : [];

    console.log(`\nApplied Migrations (${appliedResult.rows.length}):`);
    if (appliedResult.rows.length === 0) {
      console.log('  (none)');
    } else {
      for (const row of appliedResult.rows) {
        console.log(`  [x] ${row.name} (executed: ${row.run_on.toISOString()})`);
      }
    }

    const pending = files.filter((f) => {
      const nameWithoutExt = f.replace(/\.(sql|js)$/, '');
      return !appliedNames.has(nameWithoutExt) && !appliedNames.has(f);
    });

    console.log(`\nPending Migrations (${pending.length}):`);
    if (pending.length === 0) {
      console.log('  (none — schema is fully up to date)');
    } else {
      for (const f of pending) {
        console.log(`  [ ] ${f}`);
      }
    }
  } catch (err) {
    console.error(`[Migration Status Failure] ${err.message}`);
    process.exitCode = 1;
  } finally {
    await closePool();
  }
}

showMigrationStatus();
