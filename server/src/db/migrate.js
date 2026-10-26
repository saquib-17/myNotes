import dotenv from 'dotenv';
dotenv.config();

import { runner } from 'node-pg-migrate';
import { getDbConfig } from '../config/db.config.js';
import { getPool, closePool } from './pool.js';

async function runMigrations() {
  console.log('[Migration Runner] Starting database migration check...');

  // Validate configuration presence
  let config;
  try {
    config = getDbConfig();
  } catch (err) {
    console.error(`[Migration Runner Error] ${err.message}`);
    process.exit(1);
  }

  const pool = getPool();

  try {
    // Safety check 1: Confirm connected user and database match expected target
    const identResult = await pool.query('SELECT current_user, current_database();');
    const { current_user: currentUser, current_database: currentDb } = identResult.rows[0];

    console.log(`[Migration Runner] Connected identity: user="${currentUser}", database="${currentDb}"`);

    if (currentUser !== config.user || currentDb !== config.database) {
      throw new Error(
        `Safety Check Failed: Expected connection as user "${config.user}" on database "${config.database}", ` +
        `but connected as user "${currentUser}" on database "${currentDb}". Aborting.`
      );
    }

    if (currentDb !== 'mynotes_dev') {
      throw new Error(
        `Safety Check Failed: Target database is "${currentDb}". Migrations are restricted to "mynotes_dev". Aborting.`
      );
    }

    // Safety check 2: Check for unmanaged tables before applying migrations
    const hasPgMigrationsResult = await pool.query(
      "SELECT to_regclass('public.pgmigrations') AS ref;"
    );
    const hasPgMigrations = hasPgMigrationsResult.rows[0]?.ref !== null;

    if (!hasPgMigrations) {
      const hasMetadataResult = await pool.query(
        "SELECT to_regclass('public.app_metadata') AS ref;"
      );
      if (hasMetadataResult.rows[0]?.ref !== null) {
        throw new Error(
          'Collision detected: Table "app_metadata" already exists, but "pgmigrations" tracking is absent. ' +
          'Refusing to overwrite unmanaged schema.'
        );
      }
    } else {
      // Check if migration 1700000000001 has been recorded
      const appliedAuthMigration = await pool.query(
        "SELECT 1 FROM pgmigrations WHERE name LIKE '%1700000000001%';"
      );
      if (appliedAuthMigration.rows.length === 0) {
        const hasUsers = await pool.query("SELECT to_regclass('public.users') AS ref;");
        const hasSession = await pool.query("SELECT to_regclass('public.session') AS ref;");
        if (hasUsers.rows[0]?.ref !== null || hasSession.rows[0]?.ref !== null) {
          throw new Error(
            'Collision detected: Table "users" or "session" already exists prior to running migration 1700000000001. ' +
            'Refusing to overwrite unmanaged schema.'
          );
        }
      }

      // Check if migration 1700000000002 has been recorded
      const appliedNotesMigration = await pool.query(
        "SELECT 1 FROM pgmigrations WHERE name LIKE '%1700000000002%';"
      );
      if (appliedNotesMigration.rows.length === 0) {
        const hasNotes = await pool.query("SELECT to_regclass('public.notes') AS ref;");
        if (hasNotes.rows[0]?.ref !== null) {
          throw new Error(
            'Collision detected: Table "notes" already exists prior to running migration 1700000000002. ' +
            'Refusing to overwrite unmanaged schema.'
          );
        }
      }
    }

    // Execute migrations via node-pg-migrate runner
    console.log('[Migration Runner] Applying pending migrations...');
    const applied = await runner({
      databaseUrl: config,
      dir: 'migrations',
      migrationsTable: 'pgmigrations',
      direction: 'up',
      singleTransaction: true,
      verbose: false,
    });

    if (applied && applied.length > 0) {
      console.log(`[Migration Runner] Successfully applied ${applied.length} migration(s):`);
      for (const m of applied) {
        console.log(`  - ${m.name}`);
      }
    } else {
      console.log('[Migration Runner] No pending migrations. Database schema is up to date.');
    }
  } catch (err) {
    console.error(`[Migration Runner Failure] ${err.message}`);
    process.exitCode = 1;
  } finally {
    await closePool();
  }
}

runMigrations();
