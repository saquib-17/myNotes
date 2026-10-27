import dotenv from 'dotenv';
dotenv.config();

import assert from 'node:assert/strict';
import { getPool, closePool } from '../src/db/pool.js';
import {
  createNote,
  findNotesByUserId,
  findNoteByIdAndUserId,
  updateNote,
  trashNote,
  setNotePinned,
  findTrashedNotesByUserId,
  restoreNote,
} from '../src/notes/noteRepository.js';
import { derivePlainText, validateContent } from '../src/notes/contentValidator.js';

async function runControlledIntegrationCheck() {
  console.log('[Integration Check] Starting controlled PostgreSQL integration verification...');

  const pool = getPool();
  const createdUserIds = [];
  const createdNoteIds = [];

  try {
    // 1. Verify connected database identity
    const ident = await pool.query('SELECT current_user, current_database();');
    const { current_user: user, current_database: db } = ident.rows[0];
    console.log(`[Integration Check] Connected as user="${user}" on database="${db}"`);
    assert.strictEqual(db, 'mynotes_dev', 'Target database must be mynotes_dev');

    // 2. Verify schema and table readiness
    const tablesCheck = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name IN ('users', 'session', 'notes', 'app_metadata')
      ORDER BY table_name;
    `);
    const tableNames = tablesCheck.rows.map((r) => r.table_name);
    console.log(`[Integration Check] Verified core tables present: ${tableNames.join(', ')}`);
    assert.ok(tableNames.includes('notes'), 'Table "notes" must exist');
    assert.ok(tableNames.includes('users'), 'Table "users" must exist');

    // 3. Create two isolated temporary user accounts directly in the database
    const userARes = await pool.query(`
      INSERT INTO users (email, password_hash)
      VALUES ($1, $2)
      RETURNING id, email;
    `, ['integration_test_user_a@example.com', '$argon2id$v=19$m=65536,t=3,p=4$dummyhashforisolationcheckA']);
    const userA = userARes.rows[0];
    createdUserIds.push(userA.id);

    const userBRes = await pool.query(`
      INSERT INTO users (email, password_hash)
      VALUES ($1, $2)
      RETURNING id, email;
    `, ['integration_test_user_b@example.com', '$argon2id$v=19$m=65536,t=3,p=4$dummyhashforisolationcheckB']);
    const userB = userBRes.rows[0];
    createdUserIds.push(userB.id);

    console.log('[Integration Check] Created 2 isolated temporary test users.');

    // 4. Test Note Creation for User A and User B
    const docA = {
      type: 'doc',
      content: [
        {
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: 'User A Secret Strategy' }],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'This document contains 100% confidential notes for User A.' },
            { type: 'hardBreak' },
            { type: 'text', text: 'Literal wildcard test: 50% discount and user_id pattern.' },
          ],
        },
      ],
    };
    validateContent(docA);
    const textA = derivePlainText(docA);

    const noteA = await createNote({
      userId: userA.id,
      title: 'Strategy Plan 2026',
      contentJson: docA,
      contentText: textA,
      pool,
    });
    createdNoteIds.push(noteA.id);
    assert.strictEqual(noteA.version, 1, 'New note version must be 1');
    assert.strictEqual(noteA.title, 'Strategy Plan 2026');

    const docB = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'User B private project notes.' }],
        },
      ],
    };
    validateContent(docB);
    const textB = derivePlainText(docB);

    const noteB = await createNote({
      userId: userB.id,
      title: 'User B Roadmap',
      contentJson: docB,
      contentText: textB,
      pool,
    });
    createdNoteIds.push(noteB.id);

    console.log('[Integration Check] Verified note creation: User A and User B notes persisted.');

    // 5. Verify Cross-User Isolation in Listing
    const listA = await findNotesByUserId({ userId: userA.id, pool });
    assert.strictEqual(listA.rawItems.length, 1);
    assert.strictEqual(listA.rawItems[0].id, noteA.id);

    const listB = await findNotesByUserId({ userId: userB.id, pool });
    assert.strictEqual(listB.rawItems.length, 1);
    assert.strictEqual(listB.rawItems[0].id, noteB.id);

    console.log('[Integration Check] Verified cross-user listing isolation.');

    // 6. Verify Cross-User Isolation in Direct Read
    const readAByA = await findNoteByIdAndUserId({ id: noteA.id, userId: userA.id, pool });
    assert.ok(readAByA !== null);
    assert.strictEqual(readAByA.title, 'Strategy Plan 2026');

    const readAByB = await findNoteByIdAndUserId({ id: noteA.id, userId: userB.id, pool });
    assert.strictEqual(readAByB, null, 'User B must not read User A note (returns null/404)');

    console.log('[Integration Check] Verified cross-user direct read isolation.');

    // 7. Verify Cross-User Isolation in Mutation (Update & Trash)
    const updateAByB = await updateNote({
      id: noteA.id,
      userId: userB.id,
      expectedVersion: 1,
      title: 'Hacked by B',
      contentJson: docA,
      contentText: textA,
      pool,
    });
    assert.strictEqual(updateAByB.notFound, true, 'User B cannot update User A note');

    const trashAByB = await trashNote({
      id: noteA.id,
      userId: userB.id,
      expectedVersion: 1,
      pool,
    });
    assert.strictEqual(trashAByB.notFound, true, 'User B cannot trash User A note');

    console.log('[Integration Check] Verified cross-user mutation isolation (update/trash).');

    // 8. Verify Optimistic Concurrency Control (Atomic Version Check)
    // Perform two concurrent update operations both expecting version 1
    const [concurrentResult1, concurrentResult2] = await Promise.all([
      updateNote({
        id: noteA.id,
        userId: userA.id,
        expectedVersion: 1,
        title: 'Strategy Plan 2026 (Update Alpha)',
        contentJson: docA,
        contentText: textA,
        pool,
      }),
      updateNote({
        id: noteA.id,
        userId: userA.id,
        expectedVersion: 1,
        title: 'Strategy Plan 2026 (Update Beta)',
        contentJson: docA,
        contentText: textA,
        pool,
      }),
    ]);

    // Exactly one must succeed and one must conflict
    const successCount = (concurrentResult1.updatedNote ? 1 : 0) + (concurrentResult2.updatedNote ? 1 : 0);
    const conflictCount = (concurrentResult1.conflict ? 1 : 0) + (concurrentResult2.conflict ? 1 : 0);

    assert.strictEqual(successCount, 1, 'Exactly one concurrent update must succeed');
    assert.strictEqual(conflictCount, 1, 'Exactly one concurrent update must report conflict (409)');

    // Verify persisted version is now 2
    const readAfterConcurrency = await findNoteByIdAndUserId({ id: noteA.id, userId: userA.id, pool });
    assert.strictEqual(readAfterConcurrency.version, 2);

    console.log('[Integration Check] Verified optimistic concurrency: concurrent expectedVersion=1 resolved to 1 success, 1 conflict.');

    // 9. Verify Literal Wildcard Search Handling
    // Search for "100%" (contains %)
    const searchPercent = await findNotesByUserId({ userId: userA.id, q: '100%', pool });
    assert.strictEqual(searchPercent.rawItems.length, 1);

    // Search for "user_id" (contains _)
    const searchUnderscore = await findNotesByUserId({ userId: userA.id, q: 'user_id', pool });
    assert.strictEqual(searchUnderscore.rawItems.length, 1);

    // Search for a character pattern that would match under unescaped wildcards but not literally
    const searchNoMatch = await findNotesByUserId({ userId: userA.id, q: '1000%', pool });
    assert.strictEqual(searchNoMatch.rawItems.length, 0);

    console.log('[Integration Check] Verified parameterized search with literal LIKE wildcards.');

    // 9.5. Verify Note Pinning & Priority Ordering in Real Database
    const noteA2 = await createNote({
      userId: userA.id,
      title: 'Secondary Note (Newer)',
      contentJson: docA,
      contentText: 'Secondary content',
      pool,
    });
    createdNoteIds.push(noteA2.id);

    // Pin noteA (which was created earlier)
    const pinRes = await setNotePinned({ id: noteA.id, userId: userA.id, pinned: true, pool });
    assert.strictEqual(pinRes.updatedNote.pinned, true);

    // List notes for userA: pinned noteA must be first even though noteA2 is newer
    const listPinned = await findNotesByUserId({ userId: userA.id, pool });
    assert.strictEqual(listPinned.rawItems[0].id, noteA.id, 'Pinned note must appear first in listing');
    assert.strictEqual(listPinned.rawItems[0].pinned, true);
    assert.strictEqual(listPinned.rawItems[1].id, noteA2.id);
    assert.strictEqual(listPinned.rawItems[1].pinned, false);

    // Clean up noteA2
    await pool.query('DELETE FROM notes WHERE id = $1', [noteA2.id]);
    const noteA2Idx = createdNoteIds.indexOf(noteA2.id);
    if (noteA2Idx !== -1) createdNoteIds.splice(noteA2Idx, 1);

    console.log('[Integration Check] Verified note pinning and priority ordering in PostgreSQL.');

    // 10. Verify Soft Deletion to Trash
    const trashResult = await trashNote({
      id: noteA.id,
      userId: userA.id,
      expectedVersion: 2,
      pool,
    });
    assert.strictEqual(trashResult.success, true);

    // Verify row in database: deleted_at IS NOT NULL and version is 3
    const directRow = await pool.query('SELECT version, deleted_at, content_json, content_text FROM notes WHERE id = $1', [noteA.id]);
    assert.strictEqual(directRow.rows[0].version, 3);
    assert.ok(directRow.rows[0].deleted_at !== null);
    assert.ok(typeof directRow.rows[0].content_json === 'object');
    assert.ok(typeof directRow.rows[0].content_text === 'string');

    // Active listing must no longer return Note A
    const listAfterTrash = await findNotesByUserId({ userId: userA.id, pool });
    assert.strictEqual(listAfterTrash.rawItems.length, 0);

    console.log('[Integration Check] Verified soft-deletion to trash: version incremented to 3, excluded from active queries.');

    // 10.5. Verify Trash Listing & Restore in PostgreSQL
    const trashListA = await findTrashedNotesByUserId({ userId: userA.id, pool });
    assert.strictEqual(trashListA.rawItems.length, 1);
    assert.strictEqual(trashListA.rawItems[0].id, noteA.id);
    assert.strictEqual(trashListA.rawItems[0].pinned, true, 'Pinned status must be present in trash');
    assert.ok(trashListA.rawItems[0].deletedAt !== null);

    // Cross-user trash isolation check
    const trashListB = await findTrashedNotesByUserId({ userId: userB.id, pool });
    assert.strictEqual(trashListB.rawItems.length, 0, 'User B must not see User A trashed notes');

    // Restore noteA
    const restoreResult = await restoreNote({ id: noteA.id, userId: userA.id, pool });
    assert.ok(restoreResult.restoredNote, 'Restore must return restored note');
    assert.strictEqual(restoreResult.restoredNote.pinned, true, 'Pinned status must be preserved after restore');

    // Active listing must return noteA again
    const listAfterRestore = await findNotesByUserId({ userId: userA.id, pool });
    assert.strictEqual(listAfterRestore.rawItems.length, 1);
    assert.strictEqual(listAfterRestore.rawItems[0].id, noteA.id);
    assert.strictEqual(listAfterRestore.rawItems[0].pinned, true);

    // Soft-delete again for foreign-key check
    await trashNote({ id: noteA.id, userId: userA.id, expectedVersion: 3, pool });

    console.log('[Integration Check] Verified trash listing, ownership isolation, and restore with preserved pinned state in PostgreSQL.');

    // 11. Verify Foreign Key ON DELETE RESTRICT policy
    let deleteUserBlocked = false;
    try {
      await pool.query('DELETE FROM users WHERE id = $1', [userA.id]);
    } catch (err) {
      if (err.code === '23001' || err.code === '23503') { // 23001 is PostgreSQL RESTRICT violation
        deleteUserBlocked = true;
      }
    }
    assert.strictEqual(deleteUserBlocked, true, 'User deletion must be blocked by foreign key constraint ON DELETE RESTRICT');
    console.log('[Integration Check] Verified foreign key policy: ON DELETE RESTRICT prevents accidental cascading deletion.');

    console.log('\n[Integration Check SUCCESS] All 12 PostgreSQL integration assertions passed.');
  } finally {
    // 12. Clean up exact temporary records created by this check
    console.log('[Integration Check] Cleaning up temporary records...');
    if (createdNoteIds.length > 0) {
      await pool.query('DELETE FROM notes WHERE id = ANY($1)', [createdNoteIds]);
    }
    if (createdUserIds.length > 0) {
      await pool.query('DELETE FROM users WHERE id = ANY($1)', [createdUserIds]);
    }
    console.log('[Integration Check] Temporary records successfully cleaned up.');
    await closePool();
  }
}

runControlledIntegrationCheck().catch((err) => {
  console.error('[Integration Check FAILED]', err);
  process.exit(1);
});
