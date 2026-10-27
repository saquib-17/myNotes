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
import {
  createCollection,
  findCollectionsByUserId,
  findCollectionByIdAndUserId,
  updateCollection,
  softDeleteCollection,
} from '../src/collections/collectionRepository.js';
import {
  createTag,
  findTagsByUserId,
  findTagByIdAndUserId,
  updateTag,
  deleteTag,
} from '../src/tags/tagRepository.js';
import {
  createTask,
  findTasksByUserId,
  findTaskByIdAndUserId,
  updateTask,
  setTaskStatus,
  softDeleteTask,
} from '../src/tasks/taskRepository.js';
import {
  createQuestion,
  findQuestionsByUserId,
  findQuestionByIdAndUserId,
  updateQuestion,
  recordPractice,
  updateQuestionStatus,
  softDeleteQuestion,
} from '../src/questions/questionRepository.js';
import {
  createDocument,
  findDocumentsByUserId,
  findDocumentByIdAndUserId,
  updateDocument,
  setDocumentFavorite,
  softDeleteDocument,
} from '../src/documents/documentRepository.js';
import {
  createRevisionItem,
  findRevisionItemsByUserId,
  findRevisionItemByIdAndUserId,
  updateRevisionItem,
  setRevisionItemStatus,
  softDeleteRevisionItem,
} from '../src/revision/revisionItemRepository.js';
import {
  createDoubt,
  findDoubtsByUserId,
  findDoubtByIdAndUserId,
  updateDoubt,
  setDoubtStatus,
  softDeleteDoubt,
} from '../src/doubts/doubtRepository.js';
import { derivePlainText, validateContent } from '../src/notes/contentValidator.js';

async function runControlledIntegrationCheck() {
  console.log('[Integration Check] Starting controlled PostgreSQL integration verification...');

  const pool = getPool();
  const createdUserIds = [];
  const createdNoteIds = [];
  const createdCollectionIds = [];
  const createdTagIds = [];
  const createdTaskIds = [];
  const createdQuestionIds = [];
  const createdDocumentIds = [];
  const createdRevisionItemIds = [];
  const createdDoubtIds = [];

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
      WHERE table_schema = 'public' AND table_name IN ('users', 'session', 'notes', 'collections', 'tags', 'note_tags', 'tasks', 'questions', 'documents', 'revision_items', 'doubts', 'app_metadata')
      ORDER BY table_name;
    `);
    const tableNames = tablesCheck.rows.map((r) => r.table_name);
    console.log(`[Integration Check] Verified core tables present: ${tableNames.join(', ')}`);
    assert.ok(tableNames.includes('notes'), 'Table "notes" must exist');
    assert.ok(tableNames.includes('collections'), 'Table "collections" must exist');
    assert.ok(tableNames.includes('tags'), 'Table "tags" must exist');
    assert.ok(tableNames.includes('note_tags'), 'Table "note_tags" must exist');
    assert.ok(tableNames.includes('tasks'), 'Table "tasks" must exist');
    assert.ok(tableNames.includes('questions'), 'Table "questions" must exist');
    assert.ok(tableNames.includes('documents'), 'Table "documents" must exist');
    assert.ok(tableNames.includes('revision_items'), 'Table "revision_items" must exist');
    assert.ok(tableNames.includes('doubts'), 'Table "doubts" must exist');
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

    // 10.7. Verify Collections in PostgreSQL
    const createColResult = await createCollection({ userId: userA.id, name: 'Placement Prep', pool });
    assert.ok(createColResult.collection, 'Collection creation must succeed');
    const colA = createColResult.collection;
    createdCollectionIds.push(colA.id);

    // Duplicate active collection name must conflict
    const dupColResult = await createCollection({ userId: userA.id, name: ' placement prep ', pool });
    assert.strictEqual(dupColResult.conflict, true, 'Duplicate active collection name must result in conflict');

    // Create note in collection
    const colNoteResult = await createNote({
      userId: userA.id,
      title: 'DSA Roadmap',
      contentJson: docA,
      contentText: textA,
      pinned: false,
      collectionId: colA.id,
      pool,
    });
    createdNoteIds.push(colNoteResult.id);
    assert.strictEqual(colNoteResult.collectionId, colA.id);

    // Verify collections listing returns noteCount = 1
    const colsList = await findCollectionsByUserId({ userId: userA.id, pool });
    const foundCol = colsList.find((c) => c.id === colA.id);
    assert.ok(foundCol, 'Created collection must appear in listing');
    assert.strictEqual(foundCol.noteCount, 1);

    const directCol = await findCollectionByIdAndUserId({ id: colA.id, userId: userA.id, pool });
    assert.strictEqual(directCol.name, 'Placement Prep');

    // Verify findNotesByUserId collectionId filter
    const filteredNotes = await findNotesByUserId({ userId: userA.id, collectionId: colA.id, pool });
    assert.strictEqual(filteredNotes.rawItems.length, 1);
    assert.strictEqual(filteredNotes.rawItems[0].id, colNoteResult.id);

    // Rename collection
    const renamedCol = await updateCollection({ id: colA.id, userId: userA.id, name: 'Placement Prep 2026', pool });
    assert.strictEqual(renamedCol.collection.name, 'Placement Prep 2026');

    // Soft delete collection -> notes must have collection_id = null and remain active
    const softDelCol = await softDeleteCollection({ id: colA.id, userId: userA.id, pool });
    assert.strictEqual(softDelCol.success, true);

    const recheckNote = await findNoteByIdAndUserId({ id: colNoteResult.id, userId: userA.id, pool });
    assert.ok(recheckNote, 'Note must remain active after collection soft-deletion');
    assert.strictEqual(recheckNote.collectionId, null, 'Note collectionId must be cleared to null');

    console.log('[Integration Check] Verified collection creation, uniqueness, note association, filter, rename, and soft-delete unassignment in PostgreSQL.');

    // 10.8 Verify Tag Creation, Note Tagging, Filtering, Renaming, and Soft-Deletion
    const createTagResult = await createTag({ userId: userA.id, name: 'Algorithms', pool });
    assert.ok(createTagResult.tag, 'Tag creation must succeed');
    const tagAlgo = createTagResult.tag;
    createdTagIds.push(tagAlgo.id);

    // Duplicate active tag name must conflict
    const dupTagResult = await createTag({ userId: userA.id, name: ' algorithms ', pool });
    assert.strictEqual(dupTagResult.conflict, true, 'Duplicate active tag name must result in conflict');

    // Create note with tags: Algorithms and LeetCode
    const taggedNote = await createNote({
      userId: userA.id,
      title: 'Binary Search Notes',
      contentJson: docA,
      contentText: textA,
      pinned: true,
      tags: ['Algorithms', 'LeetCode'],
      pool,
    });
    createdNoteIds.push(taggedNote.id);
    assert.strictEqual(taggedNote.tags.length, 2, 'Note must have 2 tags attached');

    // Check tags created
    const leetCodeTag = taggedNote.tags.find((t) => t.name.toLowerCase() === 'leetcode');
    assert.ok(leetCodeTag, 'LeetCode tag must be created and linked');
    createdTagIds.push(leetCodeTag.id);

    // Verify tag listing returns noteCount = 1 for both tags
    const tagsList = await findTagsByUserId({ userId: userA.id, pool });
    const algoInList = tagsList.find((t) => t.id === tagAlgo.id);
    assert.ok(algoInList, 'Algorithms tag must appear in user tags list');
    assert.strictEqual(algoInList.noteCount, 1, 'Algorithms note count must be 1');

    // Verify note filtering by tagId
    const notesByTagId = await findNotesByUserId({ userId: userA.id, tagId: tagAlgo.id, pool });
    assert.strictEqual(notesByTagId.rawItems.length, 1);
    assert.strictEqual(notesByTagId.rawItems[0].id, taggedNote.id);

    // Verify note filtering by tag name
    const notesByTagName = await findNotesByUserId({ userId: userA.id, tag: 'leetcode', pool });
    assert.strictEqual(notesByTagName.rawItems.length, 1);
    assert.strictEqual(notesByTagName.rawItems[0].id, taggedNote.id);

    // Rename tag
    const renameTagRes = await updateTag({ id: tagAlgo.id, userId: userA.id, name: 'Data Structures & Algorithms', pool });
    assert.strictEqual(renameTagRes.tag.name, 'Data Structures & Algorithms');

    // Soft delete tag -> notes must remain active and intact
    await deleteTag({ id: tagAlgo.id, userId: userA.id, pool });
    const directTagAfterDel = await findTagByIdAndUserId({ id: tagAlgo.id, userId: userA.id, pool });
    assert.strictEqual(directTagAfterDel, null, 'Soft-deleted tag must not be returned by findTagByIdAndUserId');

    const taggedNoteAfterTagDel = await findNoteByIdAndUserId({ id: taggedNote.id, userId: userA.id, pool });
    assert.ok(taggedNoteAfterTagDel, 'Note must remain active after tag deletion');
    assert.strictEqual(
      taggedNoteAfterTagDel.tags.some((t) => t.id === tagAlgo.id),
      false,
      'Deleted tag must be unlinked from note'
    );
    console.log('[Integration Check] Verified tag creation, uniqueness, note association, filter, rename, and soft-delete unassignment in PostgreSQL.');

    // 10.9. Tasks/Inbox Integration Check: create task -> list task -> complete task -> verify completed_at/status -> reopen task -> edit task -> soft-delete task -> verify exclusion from active task list
    const createdTask = await createTask({
      userId: userA.id,
      title: 'Practice Dijkstra algorithm',
      details: 'Review edge cases with negative cycles',
      priority: 'high',
      dueDate: '2026-11-20',
      pool,
    });
    createdTaskIds.push(createdTask.id);
    assert.strictEqual(createdTask.title, 'Practice Dijkstra algorithm');
    assert.strictEqual(createdTask.status, 'pending');
    assert.strictEqual(createdTask.priority, 'high');
    assert.strictEqual(createdTask.dueDate, '2026-11-20');
    assert.strictEqual(createdTask.completedAt, null);

    // List task
    const taskList = await findTasksByUserId({ userId: userA.id, pool });
    assert.ok(taskList.tasks.some((t) => t.id === createdTask.id));

    // Complete task
    const completedTask = await setTaskStatus({ id: createdTask.id, userId: userA.id, status: 'completed', pool });
    assert.strictEqual(completedTask.task.status, 'completed');
    assert.ok(completedTask.task.completedAt, 'completedAt must be set upon completion');

    // Reopen task
    const reopenedTask = await setTaskStatus({ id: createdTask.id, userId: userA.id, status: 'pending', pool });
    assert.strictEqual(reopenedTask.task.status, 'pending');
    assert.strictEqual(reopenedTask.task.completedAt, null, 'completedAt must be cleared upon reopening');

    // Edit task
    const updatedTask = await updateTask({
      id: createdTask.id,
      userId: userA.id,
      title: 'Practice Dijkstra and Bellman-Ford',
      priority: 'medium',
      dueDate: '2026-11-25',
      pool,
    });
    assert.strictEqual(updatedTask.task.title, 'Practice Dijkstra and Bellman-Ford');
    assert.strictEqual(updatedTask.task.priority, 'medium');
    assert.strictEqual(updatedTask.task.dueDate, '2026-11-25');

    // Soft-delete task
    const softDelResult = await softDeleteTask({ id: createdTask.id, userId: userA.id, pool });
    assert.strictEqual(softDelResult.deleted, true);

    // Verify exclusion from active task list and lookup
    const listAfterDelete = await findTasksByUserId({ userId: userA.id, pool });
    assert.strictEqual(listAfterDelete.tasks.some((t) => t.id === createdTask.id), false, 'Soft-deleted task must not appear in active task list');
    const singleAfterDelete = await findTaskByIdAndUserId({ id: createdTask.id, userId: userA.id, pool });
    assert.strictEqual(singleAfterDelete, null, 'Soft-deleted task must return null from findTaskByIdAndUserId');
    console.log('[Integration Check] Verified task lifecycle: create -> list -> complete -> reopen -> edit -> soft-delete -> exclusion.');

    // 10.10. Question Bank Integration Check:
    // create MCQ -> list/filter -> practice incorrect -> update status to learning -> edit question -> soft-delete -> verify exclusion from active list
    const createdQuestion = await createQuestion({
      userId: userA.id,
      type: 'MCQ',
      question: 'What is the worst-case time complexity of merge sort?',
      options: ['O(N)', 'O(N log N)', 'O(N^2)', 'O(log N)'],
      correctOptionIndex: 1,
      topic: 'Algorithms',
      difficulty: 'medium',
      status: 'unlearned',
      pool,
    });
    createdQuestionIds.push(createdQuestion.id);
    assert.strictEqual(createdQuestion.type, 'MCQ');
    assert.strictEqual(createdQuestion.question, 'What is the worst-case time complexity of merge sort?');
    assert.deepEqual(createdQuestion.options, ['O(N)', 'O(N log N)', 'O(N^2)', 'O(log N)']);
    assert.strictEqual(createdQuestion.correctOptionIndex, 1);
    assert.strictEqual(createdQuestion.status, 'unlearned');
    assert.strictEqual(createdQuestion.lastPracticedAt, null);

    // List and filter by type=MCQ
    const qList = await findQuestionsByUserId({ userId: userA.id, type: 'MCQ', pool });
    assert.ok(qList.questions.some((q) => q.id === createdQuestion.id));

    // Practice incorrect
    const practiceResult = await recordPractice({
      id: createdQuestion.id,
      userId: userA.id,
      result: 'incorrect',
      pool,
    });
    assert.ok(practiceResult.question.lastPracticedAt, 'lastPracticedAt must be updated after practice');
    assert.strictEqual(practiceResult.question.status, 'unlearned', 'Mastery status must remain unchanged by practice');

    // Update status to learning
    const statusResult = await updateQuestionStatus({
      id: createdQuestion.id,
      userId: userA.id,
      status: 'learning',
      pool,
    });
    assert.strictEqual(statusResult.question.status, 'learning');

    // Edit question
    const editResult = await updateQuestion({
      id: createdQuestion.id,
      userId: userA.id,
      question: 'What is the worst-case time complexity of standard Merge Sort on arrays?',
      difficulty: 'hard',
      pool,
    });
    assert.strictEqual(
      editResult.question.question,
      'What is the worst-case time complexity of standard Merge Sort on arrays?'
    );
    assert.strictEqual(editResult.question.difficulty, 'hard');

    // Soft-delete question
    const softDelQ = await softDeleteQuestion({ id: createdQuestion.id, userId: userA.id, pool });
    assert.strictEqual(softDelQ.deleted, true);

    // Verify exclusion from active question list and direct lookup
    const qListAfterDel = await findQuestionsByUserId({ userId: userA.id, pool });
    assert.strictEqual(
      qListAfterDel.questions.some((q) => q.id === createdQuestion.id),
      false,
      'Soft-deleted question must not appear in active questions list'
    );
    const directQAfterDel = await findQuestionByIdAndUserId({ id: createdQuestion.id, userId: userA.id, pool });
    assert.strictEqual(directQAfterDel, null, 'Soft-deleted question must return null from findQuestionByIdAndUserId');
    console.log('[Integration Check] Verified question lifecycle: create MCQ -> list/filter -> practice incorrect -> update status to learning -> edit question -> soft-delete -> verify exclusion.');

    // 10.11 Test Document lifecycle (create -> list/filter -> favorite -> edit -> unfavorite -> soft-delete -> verify exclusion)
    const createdDoc = await createDocument({
      userId: userA.id,
      title: 'PostgreSQL Internals Guide',
      url: 'https://example.com/postgres-internals',
      description: 'Deep dive into WAL and MVCC',
      category: 'documentation',
      topic: 'database',
      favorite: false,
      pool,
    });
    createdDocumentIds.push(createdDoc.id);
    assert.strictEqual(createdDoc.title, 'PostgreSQL Internals Guide');
    assert.strictEqual(createdDoc.category, 'documentation');
    assert.strictEqual(createdDoc.favorite, false);

    // List and verify presence
    const docList = await findDocumentsByUserId({ userId: userA.id, pool });
    assert.ok(docList.documents.some((d) => d.id === createdDoc.id));

    // Favorite document
    const favDoc = await setDocumentFavorite({
      id: createdDoc.id,
      userId: userA.id,
      favorite: true,
      pool,
    });
    assert.strictEqual(favDoc.favorite, true);

    // Edit document
    const editDoc = await updateDocument({
      id: createdDoc.id,
      userId: userA.id,
      title: 'PostgreSQL Internals 2nd Edition',
      category: 'article',
      pool,
    });
    assert.strictEqual(editDoc.title, 'PostgreSQL Internals 2nd Edition');
    assert.strictEqual(editDoc.category, 'article');

    // Unfavorite document
    const unfavDoc = await setDocumentFavorite({
      id: createdDoc.id,
      userId: userA.id,
      favorite: false,
      pool,
    });
    assert.strictEqual(unfavDoc.favorite, false);

    // Soft-delete document
    const softDelDoc = await softDeleteDocument({ id: createdDoc.id, userId: userA.id, pool });
    assert.strictEqual(softDelDoc, true);

    // Verify exclusion from active list and direct lookup
    const docListAfterDel = await findDocumentsByUserId({ userId: userA.id, pool });
    assert.strictEqual(
      docListAfterDel.documents.some((d) => d.id === createdDoc.id),
      false,
      'Soft-deleted document must not appear in active documents list'
    );
    const directDocAfterDel = await findDocumentByIdAndUserId({ id: createdDoc.id, userId: userA.id, pool });
    assert.strictEqual(directDocAfterDel, null, 'Soft-deleted document must return null from findDocumentByIdAndUserId');
    console.log('[Integration Check] Verified document lifecycle: create -> list/filter -> favorite -> edit -> unfavorite -> soft-delete -> verify exclusion.');

    // 10.12 Test Revision Item lifecycle (create -> mark revised -> verify revised_at -> reopen -> verify revised_at cleared -> edit -> soft-delete -> verify exclusion)
    const createdRevItem = await createRevisionItem({
      userId: userA.id,
      title: 'B-Tree Index Balancing',
      details: 'Splitting and merging nodes on insertion/deletion',
      subject: 'Databases',
      pool,
    });
    createdRevisionItemIds.push(createdRevItem.id);
    assert.strictEqual(createdRevItem.title, 'B-Tree Index Balancing');
    assert.strictEqual(createdRevItem.status, 'pending');
    assert.strictEqual(createdRevItem.revisedAt, null);

    // Mark revised
    const revisedItem = await setRevisionItemStatus({
      id: createdRevItem.id,
      userId: userA.id,
      status: 'revised',
      pool,
    });
    assert.strictEqual(revisedItem.status, 'revised');
    assert.ok(revisedItem.revisedAt, 'revisedAt must be set on status=revised');

    // Reopen
    const reopenedItem = await setRevisionItemStatus({
      id: createdRevItem.id,
      userId: userA.id,
      status: 'pending',
      pool,
    });
    assert.strictEqual(reopenedItem.status, 'pending');
    assert.strictEqual(reopenedItem.revisedAt, null, 'revisedAt must be null on reopen');

    // Edit
    const editedRevItem = await updateRevisionItem({
      id: createdRevItem.id,
      userId: userA.id,
      title: 'B+ Tree Index Balancing',
      subject: 'Advanced Databases',
      pool,
    });
    assert.strictEqual(editedRevItem.title, 'B+ Tree Index Balancing');
    assert.strictEqual(editedRevItem.subject, 'Advanced Databases');

    // Soft delete
    const softDelRev = await softDeleteRevisionItem({ id: createdRevItem.id, userId: userA.id, pool });
    assert.strictEqual(softDelRev, true);

    // Verify exclusion
    const revListAfterDel = await findRevisionItemsByUserId({ userId: userA.id, pool });
    assert.strictEqual(
      revListAfterDel.revisionItems.some((r) => r.id === createdRevItem.id),
      false,
      'Soft-deleted revision item must not appear in active list'
    );
    const directRevAfterDel = await findRevisionItemByIdAndUserId({ id: createdRevItem.id, userId: userA.id, pool });
    assert.strictEqual(directRevAfterDel, null, 'Soft-deleted revision item must return null');
    console.log('[Integration Check] Verified revision item lifecycle: create -> mark revised -> verify revised_at -> reopen -> verify revised_at cleared -> edit -> soft-delete -> verify exclusion.');

    // 10.13 Test Doubt lifecycle (create -> resolve with resolution -> verify resolved_at -> reopen -> verify resolved_at cleared and resolution preserved -> soft-delete -> verify exclusion)
    const createdDoubt = await createDoubt({
      userId: userA.id,
      question: 'Why does TCP TIME_WAIT state last 2MSL?',
      details: 'To ensure delayed duplicate segments expire in the network.',
      subject: 'Networking',
      pool,
    });
    createdDoubtIds.push(createdDoubt.id);
    assert.strictEqual(createdDoubt.question, 'Why does TCP TIME_WAIT state last 2MSL?');
    assert.strictEqual(createdDoubt.status, 'open');
    assert.strictEqual(createdDoubt.resolvedAt, null);

    // Resolve with resolution
    const resolvedDoubt = await setDoubtStatus({
      id: createdDoubt.id,
      userId: userA.id,
      status: 'resolved',
      resolution: 'Allows old duplicates to die out and gives time for final ACK retransmission.',
      pool,
    });
    assert.strictEqual(resolvedDoubt.status, 'resolved');
    assert.ok(resolvedDoubt.resolvedAt, 'resolvedAt must be set on status=resolved');
    assert.strictEqual(
      resolvedDoubt.resolution,
      'Allows old duplicates to die out and gives time for final ACK retransmission.'
    );

    // Reopen (preserves resolution notes while clearing resolvedAt)
    const reopenedDoubt = await setDoubtStatus({
      id: createdDoubt.id,
      userId: userA.id,
      status: 'open',
      pool,
    });
    assert.strictEqual(reopenedDoubt.status, 'open');
    assert.strictEqual(reopenedDoubt.resolvedAt, null, 'resolvedAt must be cleared on reopen');
    assert.strictEqual(
      reopenedDoubt.resolution,
      'Allows old duplicates to die out and gives time for final ACK retransmission.',
      'Existing resolution must be preserved upon reopen'
    );

    // Edit doubt
    const editedDoubt = await updateDoubt({
      id: createdDoubt.id,
      userId: userA.id,
      subject: 'Advanced Networking Protocols',
      pool,
    });
    assert.strictEqual(editedDoubt.subject, 'Advanced Networking Protocols');

    // Soft delete
    const softDelDoubt = await softDeleteDoubt({ id: createdDoubt.id, userId: userA.id, pool });
    assert.strictEqual(softDelDoubt, true);

    // Verify exclusion
    const doubtListAfterDel = await findDoubtsByUserId({ userId: userA.id, pool });
    assert.strictEqual(
      doubtListAfterDel.doubts.some((d) => d.id === createdDoubt.id),
      false,
      'Soft-deleted doubt must not appear in active list'
    );
    const directDoubtAfterDel = await findDoubtByIdAndUserId({ id: createdDoubt.id, userId: userA.id, pool });
    assert.strictEqual(directDoubtAfterDel, null, 'Soft-deleted doubt must return null');
    console.log('[Integration Check] Verified doubt lifecycle: create -> resolve with resolution -> verify resolved_at -> reopen -> verify resolved_at cleared and resolution preserved -> soft-delete -> verify exclusion.');

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

    console.log('\n[Integration Check SUCCESS] All PostgreSQL integration assertions passed.');
  } finally {
    // 12. Clean up exact temporary records created by this check
    console.log('[Integration Check] Cleaning up temporary records...');
    if (createdNoteIds.length > 0) {
      await pool.query('DELETE FROM note_tags WHERE note_id = ANY($1)', [createdNoteIds]);
      await pool.query('DELETE FROM notes WHERE id = ANY($1)', [createdNoteIds]);
    }
    if (createdTagIds.length > 0) {
      await pool.query('DELETE FROM note_tags WHERE tag_id = ANY($1)', [createdTagIds]);
      await pool.query('DELETE FROM tags WHERE id = ANY($1)', [createdTagIds]);
    }
    if (createdCollectionIds.length > 0) {
      await pool.query('DELETE FROM collections WHERE id = ANY($1)', [createdCollectionIds]);
    }
    if (createdTaskIds.length > 0) {
      await pool.query('DELETE FROM tasks WHERE id = ANY($1)', [createdTaskIds]);
    }
    if (createdQuestionIds.length > 0) {
      await pool.query('DELETE FROM questions WHERE id = ANY($1)', [createdQuestionIds]);
    }
    if (createdDocumentIds.length > 0) {
      await pool.query('DELETE FROM documents WHERE id = ANY($1)', [createdDocumentIds]);
    }
    if (createdRevisionItemIds.length > 0) {
      await pool.query('DELETE FROM revision_items WHERE id = ANY($1)', [createdRevisionItemIds]);
    }
    if (createdDoubtIds.length > 0) {
      await pool.query('DELETE FROM doubts WHERE id = ANY($1)', [createdDoubtIds]);
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
