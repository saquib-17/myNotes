import { getPool } from '../db/pool.js';

export const ALLOWED_SEARCH_TYPES = [
  'all',
  'notes',
  'tasks',
  'questions',
  'documents',
  'revision',
  'doubts',
];

/**
 * Escapes characters that carry special meaning inside SQL LIKE/ILIKE patterns (% and _ and \).
 *
 * @param {string} str
 * @returns {string} Escaped string safe for ILIKE $x ESCAPE '\'
 */
export function escapeLikeWildcards(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/([%_\\])/g, '\\$1');
}

/**
 * Extracts a centered excerpt around the first occurrence of query in text.
 * Falls back to leading text if query is not found directly in text.
 *
 * @param {string} text
 * @param {string} query
 * @param {number} [maxLength=160]
 * @returns {string}
 */
export function extractSnippet(text, query, maxLength = 160) {
  if (!text || typeof text !== 'string') return '';
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  if (!query || typeof query !== 'string' || !query.trim()) {
    return clean.length <= maxLength ? clean : clean.slice(0, maxLength).trim() + '…';
  }

  const lowerText = clean.toLowerCase();
  const lowerQuery = query.trim().toLowerCase();
  const matchIndex = lowerText.indexOf(lowerQuery);

  if (matchIndex === -1) {
    return clean.length <= maxLength ? clean : clean.slice(0, maxLength).trim() + '…';
  }

  const half = Math.floor(maxLength / 2);
  let start = Math.max(0, matchIndex - half);
  let end = Math.min(clean.length, start + maxLength);

  if (end - start < maxLength) {
    start = Math.max(0, end - maxLength);
  }

  let excerpt = clean.slice(start, end);
  if (start > 0) {
    excerpt = '…' + excerpt.trimStart();
  }
  if (end < clean.length) {
    excerpt = excerpt.trimEnd() + '…';
  }
  return excerpt;
}

/**
 * Searches notes in active workspace.
 */
export async function searchNotes({
  userId,
  workspaceId,
  pattern,
  rawQuery,
  limit,
  offset,
  pool = getPool(),
}) {
  const countRes = await pool.query(
    `
    SELECT COUNT(*)::int AS count
    FROM notes
    WHERE user_id = $1
      AND workspace_id = $2
      AND deleted_at IS NULL
      AND (title ILIKE $3 ESCAPE '\\' OR content_text ILIKE $3 ESCAPE '\\')
    `,
    [userId, workspaceId, pattern]
  );
  const total = countRes.rows[0]?.count || 0;

  const rowsRes = await pool.query(
    `
    SELECT
      id,
      title,
      content_text,
      pinned,
      updated_at,
      CASE WHEN title ILIKE $3 ESCAPE '\\' THEN 1 ELSE 0 END AS title_match
    FROM notes
    WHERE user_id = $1
      AND workspace_id = $2
      AND deleted_at IS NULL
      AND (title ILIKE $3 ESCAPE '\\' OR content_text ILIKE $3 ESCAPE '\\')
    ORDER BY title_match DESC, pinned DESC, updated_at DESC
    LIMIT $4 OFFSET $5
    `,
    [userId, workspaceId, pattern, limit, offset]
  );

  const results = rowsRes.rows.map((row) => ({
    id: row.id,
    type: 'notes',
    title: row.title || 'Untitled Note',
    subtitle: row.pinned ? 'Pinned Note' : 'Note',
    snippet: extractSnippet(row.content_text, rawQuery),
    url: `/notes/${row.id}`,
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : new Date(row.updated_at).toISOString(),
    badges: row.pinned ? ['Pinned'] : [],
    titleMatch: row.title_match === 1,
  }));

  return { results, total };
}

/**
 * Searches tasks in active workspace.
 */
export async function searchTasks({
  userId,
  workspaceId,
  pattern,
  rawQuery,
  limit,
  offset,
  pool = getPool(),
}) {
  const countRes = await pool.query(
    `
    SELECT COUNT(*)::int AS count
    FROM tasks
    WHERE user_id = $1
      AND workspace_id = $2
      AND deleted_at IS NULL
      AND (title ILIKE $3 ESCAPE '\\' OR details ILIKE $3 ESCAPE '\\')
    `,
    [userId, workspaceId, pattern]
  );
  const total = countRes.rows[0]?.count || 0;

  const rowsRes = await pool.query(
    `
    SELECT
      id,
      title,
      details,
      status,
      priority,
      due_date,
      updated_at,
      CASE WHEN title ILIKE $3 ESCAPE '\\' THEN 1 ELSE 0 END AS title_match
    FROM tasks
    WHERE user_id = $1
      AND workspace_id = $2
      AND deleted_at IS NULL
      AND (title ILIKE $3 ESCAPE '\\' OR details ILIKE $3 ESCAPE '\\')
    ORDER BY title_match DESC, updated_at DESC
    LIMIT $4 OFFSET $5
    `,
    [userId, workspaceId, pattern, limit, offset]
  );

  const results = rowsRes.rows.map((row) => {
    const isCompleted = row.status === 'completed';
    const badges = [
      isCompleted ? 'Completed' : 'Pending',
      row.priority && row.priority !== 'none' ? row.priority.toUpperCase() : null,
    ].filter(Boolean);

    let subtitle = isCompleted ? 'Task • Completed' : 'Task • Pending';
    if (row.due_date) {
      subtitle += ` • Due ${row.due_date}`;
    }

    return {
      id: row.id,
      type: 'tasks',
      title: row.title,
      subtitle,
      snippet: extractSnippet(row.details || (row.due_date ? `Due date: ${row.due_date}` : ''), rawQuery),
      url: '/tasks',
      updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : new Date(row.updated_at).toISOString(),
      badges,
      titleMatch: row.title_match === 1,
    };
  });

  return { results, total };
}

/**
 * Searches questions in active workspace.
 */
export async function searchQuestions({
  userId,
  workspaceId,
  pattern,
  rawQuery,
  limit,
  offset,
  pool = getPool(),
}) {
  const countRes = await pool.query(
    `
    SELECT COUNT(*)::int AS count
    FROM questions
    WHERE user_id = $1
      AND workspace_id = $2
      AND deleted_at IS NULL
      AND (question ILIKE $3 ESCAPE '\\' OR answer ILIKE $3 ESCAPE '\\' OR explanation ILIKE $3 ESCAPE '\\' OR topic ILIKE $3 ESCAPE '\\')
    `,
    [userId, workspaceId, pattern]
  );
  const total = countRes.rows[0]?.count || 0;

  const rowsRes = await pool.query(
    `
    SELECT
      id,
      type,
      question,
      answer,
      explanation,
      topic,
      difficulty,
      status,
      updated_at,
      CASE WHEN question ILIKE $3 ESCAPE '\\' THEN 1 ELSE 0 END AS title_match
    FROM questions
    WHERE user_id = $1
      AND workspace_id = $2
      AND deleted_at IS NULL
      AND (question ILIKE $3 ESCAPE '\\' OR answer ILIKE $3 ESCAPE '\\' OR explanation ILIKE $3 ESCAPE '\\' OR topic ILIKE $3 ESCAPE '\\')
    ORDER BY title_match DESC, updated_at DESC
    LIMIT $4 OFFSET $5
    `,
    [userId, workspaceId, pattern, limit, offset]
  );

  const results = rowsRes.rows.map((row) => {
    const badges = [
      row.type,
      row.status ? row.status.toUpperCase() : null,
      row.topic || null,
    ].filter(Boolean);

    const contextText = [row.explanation, row.answer, row.topic].filter(Boolean).join(' • ');

    return {
      id: row.id,
      type: 'questions',
      title: row.question,
      subtitle: `Question • ${row.type}${row.topic ? ' • ' + row.topic : ''}`,
      snippet: extractSnippet(contextText, rawQuery),
      url: '/questions',
      updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : new Date(row.updated_at).toISOString(),
      badges,
      titleMatch: row.title_match === 1,
    };
  });

  return { results, total };
}

/**
 * Searches documents in active workspace.
 */
export async function searchDocuments({
  userId,
  workspaceId,
  pattern,
  rawQuery,
  limit,
  offset,
  pool = getPool(),
}) {
  const countRes = await pool.query(
    `
    SELECT COUNT(*)::int AS count
    FROM documents
    WHERE user_id = $1
      AND workspace_id = $2
      AND deleted_at IS NULL
      AND (title ILIKE $3 ESCAPE '\\' OR description ILIKE $3 ESCAPE '\\' OR url ILIKE $3 ESCAPE '\\' OR topic ILIKE $3 ESCAPE '\\')
    `,
    [userId, workspaceId, pattern]
  );
  const total = countRes.rows[0]?.count || 0;

  const rowsRes = await pool.query(
    `
    SELECT
      id,
      title,
      description,
      url,
      category,
      topic,
      favorite,
      updated_at,
      CASE WHEN title ILIKE $3 ESCAPE '\\' THEN 1 ELSE 0 END AS title_match
    FROM documents
    WHERE user_id = $1
      AND workspace_id = $2
      AND deleted_at IS NULL
      AND (title ILIKE $3 ESCAPE '\\' OR description ILIKE $3 ESCAPE '\\' OR url ILIKE $3 ESCAPE '\\' OR topic ILIKE $3 ESCAPE '\\')
    ORDER BY title_match DESC, favorite DESC, updated_at DESC
    LIMIT $4 OFFSET $5
    `,
    [userId, workspaceId, pattern, limit, offset]
  );

  const results = rowsRes.rows.map((row) => {
    const badges = [
      row.category,
      row.favorite ? 'Favorite' : null,
    ].filter(Boolean);

    const contextText = [row.description, row.topic, row.url].filter(Boolean).join(' • ');

    return {
      id: row.id,
      type: 'documents',
      title: row.title,
      subtitle: `Document • ${row.category}${row.topic ? ' • ' + row.topic : ''}`,
      snippet: extractSnippet(contextText, rawQuery),
      url: '/documents',
      updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : new Date(row.updated_at).toISOString(),
      badges,
      titleMatch: row.title_match === 1,
    };
  });

  return { results, total };
}

/**
 * Searches revision items in active workspace.
 */
export async function searchRevisionItems({
  userId,
  workspaceId,
  pattern,
  rawQuery,
  limit,
  offset,
  pool = getPool(),
}) {
  const countRes = await pool.query(
    `
    SELECT COUNT(*)::int AS count
    FROM revision_items
    WHERE user_id = $1
      AND workspace_id = $2
      AND deleted_at IS NULL
      AND (title ILIKE $3 ESCAPE '\\' OR details ILIKE $3 ESCAPE '\\' OR subject ILIKE $3 ESCAPE '\\')
    `,
    [userId, workspaceId, pattern]
  );
  const total = countRes.rows[0]?.count || 0;

  const rowsRes = await pool.query(
    `
    SELECT
      id,
      title,
      details,
      subject,
      status,
      revised_at,
      updated_at,
      CASE WHEN title ILIKE $3 ESCAPE '\\' THEN 1 ELSE 0 END AS title_match
    FROM revision_items
    WHERE user_id = $1
      AND workspace_id = $2
      AND deleted_at IS NULL
      AND (title ILIKE $3 ESCAPE '\\' OR details ILIKE $3 ESCAPE '\\' OR subject ILIKE $3 ESCAPE '\\')
    ORDER BY title_match DESC, updated_at DESC
    LIMIT $4 OFFSET $5
    `,
    [userId, workspaceId, pattern, limit, offset]
  );

  const results = rowsRes.rows.map((row) => {
    const isRevised = row.status === 'revised' || Boolean(row.revised_at);
    const badges = [
      isRevised ? 'Revised' : 'Pending',
      row.subject || null,
    ].filter(Boolean);

    const contextText = [row.details, row.subject].filter(Boolean).join(' • ');

    return {
      id: row.id,
      type: 'revision',
      title: row.title,
      subtitle: `Revision • ${row.subject || 'General'}${isRevised ? ' • Revised' : ' • Pending'}`,
      snippet: extractSnippet(contextText, rawQuery),
      url: '/revision',
      updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : new Date(row.updated_at).toISOString(),
      badges,
      titleMatch: row.title_match === 1,
    };
  });

  return { results, total };
}

/**
 * Searches doubts in active workspace.
 */
export async function searchDoubts({
  userId,
  workspaceId,
  pattern,
  rawQuery,
  limit,
  offset,
  pool = getPool(),
}) {
  const countRes = await pool.query(
    `
    SELECT COUNT(*)::int AS count
    FROM doubts
    WHERE user_id = $1
      AND workspace_id = $2
      AND deleted_at IS NULL
      AND (question ILIKE $3 ESCAPE '\\' OR details ILIKE $3 ESCAPE '\\' OR subject ILIKE $3 ESCAPE '\\' OR resolution ILIKE $3 ESCAPE '\\')
    `,
    [userId, workspaceId, pattern]
  );
  const total = countRes.rows[0]?.count || 0;

  const rowsRes = await pool.query(
    `
    SELECT
      id,
      question,
      details,
      subject,
      resolution,
      status,
      resolved_at,
      updated_at,
      CASE WHEN question ILIKE $3 ESCAPE '\\' THEN 1 ELSE 0 END AS title_match
    FROM doubts
    WHERE user_id = $1
      AND workspace_id = $2
      AND deleted_at IS NULL
      AND (question ILIKE $3 ESCAPE '\\' OR details ILIKE $3 ESCAPE '\\' OR subject ILIKE $3 ESCAPE '\\' OR resolution ILIKE $3 ESCAPE '\\')
    ORDER BY title_match DESC, updated_at DESC
    LIMIT $4 OFFSET $5
    `,
    [userId, workspaceId, pattern, limit, offset]
  );

  const results = rowsRes.rows.map((row) => {
    const isResolved = row.status === 'resolved';
    const badges = [
      isResolved ? 'Resolved' : 'Open',
      row.subject || null,
    ].filter(Boolean);

    const contextText = [row.resolution, row.details, row.subject].filter(Boolean).join(' • ');

    return {
      id: row.id,
      type: 'doubts',
      title: row.question,
      subtitle: `Doubt • ${row.subject || 'General'}${isResolved ? ' • Resolved' : ' • Open'}`,
      snippet: extractSnippet(contextText, rawQuery),
      url: '/revision',
      updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : new Date(row.updated_at).toISOString(),
      badges,
      titleMatch: row.title_match === 1,
    };
  });

  return { results, total };
}

/**
 * Performs a global search across notes, tasks, questions, documents, revision items, and doubts.
 *
 * @param {object} params
 * @param {string} params.userId
 * @param {string} params.workspaceId
 * @param {string} params.q
 * @param {string} [params.type='all']
 * @param {number} [params.limit=20]
 * @param {number} [params.offset=0]
 * @param {object} [params.pool]
 * @returns {Promise<object>} Stable search response contract
 */
export async function performGlobalSearch({
  userId,
  workspaceId,
  q,
  type = 'all',
  limit = 20,
  offset = 0,
  pool = getPool(),
}) {
  if (!userId) {
    const err = new Error('userId is required');
    err.status = 401;
    throw err;
  }
  if (!workspaceId) {
    const err = new Error('workspaceId is required');
    err.status = 400;
    throw err;
  }

  const trimmedQuery = (q || '').trim();
  if (!trimmedQuery) {
    const err = new Error('Search query "q" is required and cannot be empty.');
    err.status = 400;
    throw err;
  }
  if (trimmedQuery.length > 200) {
    const err = new Error('Search query cannot exceed 200 characters.');
    err.status = 400;
    throw err;
  }

  const normalizedType = (type || 'all').toLowerCase();
  if (!ALLOWED_SEARCH_TYPES.includes(normalizedType)) {
    const err = new Error(
      `Invalid type filter. Allowed values: ${ALLOWED_SEARCH_TYPES.join(', ')}.`
    );
    err.status = 400;
    throw err;
  }

  const parsedLimit = Math.max(1, Math.min(50, limit));
  const parsedOffset = Math.max(0, offset);
  const pattern = `%${escapeLikeWildcards(trimmedQuery)}%`;

  // Specific single-type search
  if (normalizedType !== 'all') {
    let typeResult;
    switch (normalizedType) {
      case 'notes':
        typeResult = await searchNotes({
          userId,
          workspaceId,
          pattern,
          rawQuery: trimmedQuery,
          limit: parsedLimit,
          offset: parsedOffset,
          pool,
        });
        break;
      case 'tasks':
        typeResult = await searchTasks({
          userId,
          workspaceId,
          pattern,
          rawQuery: trimmedQuery,
          limit: parsedLimit,
          offset: parsedOffset,
          pool,
        });
        break;
      case 'questions':
        typeResult = await searchQuestions({
          userId,
          workspaceId,
          pattern,
          rawQuery: trimmedQuery,
          limit: parsedLimit,
          offset: parsedOffset,
          pool,
        });
        break;
      case 'documents':
        typeResult = await searchDocuments({
          userId,
          workspaceId,
          pattern,
          rawQuery: trimmedQuery,
          limit: parsedLimit,
          offset: parsedOffset,
          pool,
        });
        break;
      case 'revision':
        typeResult = await searchRevisionItems({
          userId,
          workspaceId,
          pattern,
          rawQuery: trimmedQuery,
          limit: parsedLimit,
          offset: parsedOffset,
          pool,
        });
        break;
      case 'doubts':
        typeResult = await searchDoubts({
          userId,
          workspaceId,
          pattern,
          rawQuery: trimmedQuery,
          limit: parsedLimit,
          offset: parsedOffset,
          pool,
        });
        break;
      default:
        typeResult = { results: [], total: 0 };
    }

    // Strip internal helper field titleMatch before returning
    const cleanedResults = typeResult.results.map(({ titleMatch: _titleMatch, ...r }) => r);

    return {
      query: trimmedQuery,
      workspaceId,
      type: normalizedType,
      total: typeResult.total,
      limit: parsedLimit,
      offset: parsedOffset,
      hasMore: parsedOffset + cleanedResults.length < typeResult.total,
      results: cleanedResults,
    };
  }

  // Type === 'all': fetch candidate pools from all 6 categories in parallel
  // To avoid any single category starving the result page, collect up to (parsedOffset + parsedLimit) from each
  const candidateLimit = Math.max(parsedLimit, parsedOffset + parsedLimit);
  const [
    notesRes,
    tasksRes,
    questionsRes,
    documentsRes,
    revisionRes,
    doubtsRes,
  ] = await Promise.all([
    searchNotes({ userId, workspaceId, pattern, rawQuery: trimmedQuery, limit: candidateLimit, offset: 0, pool }),
    searchTasks({ userId, workspaceId, pattern, rawQuery: trimmedQuery, limit: candidateLimit, offset: 0, pool }),
    searchQuestions({ userId, workspaceId, pattern, rawQuery: trimmedQuery, limit: candidateLimit, offset: 0, pool }),
    searchDocuments({ userId, workspaceId, pattern, rawQuery: trimmedQuery, limit: candidateLimit, offset: 0, pool }),
    searchRevisionItems({ userId, workspaceId, pattern, rawQuery: trimmedQuery, limit: candidateLimit, offset: 0, pool }),
    searchDoubts({ userId, workspaceId, pattern, rawQuery: trimmedQuery, limit: candidateLimit, offset: 0, pool }),
  ]);

  const total =
    notesRes.total +
    tasksRes.total +
    questionsRes.total +
    documentsRes.total +
    revisionRes.total +
    doubtsRes.total;

  // Balanced Interleaving:
  // Separate candidate pools into Title Matches vs Content Matches
  // Interleave across categories so that each category with matches gets fair representation
  const categories = [
    notesRes.results,
    tasksRes.results,
    questionsRes.results,
    documentsRes.results,
    revisionRes.results,
    doubtsRes.results,
  ];

  // Interleave categories round-robin while prioritizing title matches over content matches
  const titleMatchesByCategory = categories.map((cat) => cat.filter((item) => item.titleMatch));
  const contentMatchesByCategory = categories.map((cat) => cat.filter((item) => !item.titleMatch));

  function interleave(bucketList) {
    const merged = [];
    let hasMoreInBucket = true;
    let round = 0;
    while (hasMoreInBucket) {
      hasMoreInBucket = false;
      for (const bucket of bucketList) {
        if (round < bucket.length) {
          merged.push(bucket[round]);
          hasMoreInBucket = true;
        }
      }
      round++;
    }
    return merged;
  }

  const mergedTitleMatches = interleave(titleMatchesByCategory);
  const mergedContentMatches = interleave(contentMatchesByCategory);

  const combined = [...mergedTitleMatches, ...mergedContentMatches];
  const sliced = combined.slice(parsedOffset, parsedOffset + parsedLimit);

  const cleanedResults = sliced.map(({ titleMatch: _titleMatch, ...r }) => r);

  return {
    query: trimmedQuery,
    workspaceId,
    type: 'all',
    total,
    limit: parsedLimit,
    offset: parsedOffset,
    hasMore: parsedOffset + cleanedResults.length < total,
    results: cleanedResults,
  };
}
