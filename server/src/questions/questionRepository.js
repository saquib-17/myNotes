import { getPool } from '../db/pool.js';

export const QUESTION_LIMITS = {
  MAX_QUESTION_LENGTH: 2000,
  MAX_ANSWER_LENGTH: 5000,
  MAX_EXPLANATION_LENGTH: 5000,
  MAX_TOPIC_LENGTH: 80,
  MIN_MCQ_OPTIONS: 2,
  MAX_MCQ_OPTIONS: 6,
  MAX_MCQ_OPTION_LENGTH: 300,
  ALLOWED_TYPES: ['SHORT_ANSWER', 'MCQ', 'CODING'],
  ALLOWED_DIFFICULTIES: ['easy', 'medium', 'hard'],
  ALLOWED_STATUSES: ['unlearned', 'learning', 'mastered'],
  ALLOWED_PRACTICE_RESULTS: ['correct', 'incorrect'],
};

/**
 * Escapes characters that carry special meaning inside SQL LIKE/ILIKE patterns.
 */
function escapeLikeWildcards(str) {
  return str.replace(/([%_\\])/g, '\\$1');
}

/**
 * Validates and normalizes question text.
 */
export function validateAndNormalizeQuestionText(question) {
  if (typeof question !== 'string') {
    const err = new Error('Field "question" must be a string.');
    err.status = 400;
    throw err;
  }
  const trimmed = question.trim();
  if (trimmed.length === 0) {
    const err = new Error('Question text cannot be empty.');
    err.status = 400;
    throw err;
  }
  if (trimmed.length > QUESTION_LIMITS.MAX_QUESTION_LENGTH) {
    const err = new Error(
      `Question text cannot exceed ${QUESTION_LIMITS.MAX_QUESTION_LENGTH} characters.`
    );
    err.status = 400;
    throw err;
  }
  return trimmed;
}

/**
 * Validates and normalizes answer text.
 */
export function validateAndNormalizeAnswer(answer) {
  if (answer === undefined || answer === null) {
    return null;
  }
  if (typeof answer !== 'string') {
    const err = new Error('Field "answer" must be a string.');
    err.status = 400;
    throw err;
  }
  const trimmed = answer.trim();
  if (trimmed.length === 0) {
    return null;
  }
  if (trimmed.length > QUESTION_LIMITS.MAX_ANSWER_LENGTH) {
    const err = new Error(
      `Answer cannot exceed ${QUESTION_LIMITS.MAX_ANSWER_LENGTH} characters.`
    );
    err.status = 400;
    throw err;
  }
  return trimmed;
}

/**
 * Validates and normalizes explanation text.
 */
export function validateAndNormalizeExplanation(explanation) {
  if (explanation === undefined || explanation === null) {
    return null;
  }
  if (typeof explanation !== 'string') {
    const err = new Error('Field "explanation" must be a string.');
    err.status = 400;
    throw err;
  }
  const trimmed = explanation.trim();
  if (trimmed.length === 0) {
    return null;
  }
  if (trimmed.length > QUESTION_LIMITS.MAX_EXPLANATION_LENGTH) {
    const err = new Error(
      `Explanation cannot exceed ${QUESTION_LIMITS.MAX_EXPLANATION_LENGTH} characters.`
    );
    err.status = 400;
    throw err;
  }
  return trimmed;
}

/**
 * Validates and normalizes topic label.
 */
export function validateAndNormalizeTopic(topic) {
  if (topic === undefined || topic === null) {
    return null;
  }
  if (typeof topic !== 'string') {
    const err = new Error('Field "topic" must be a string.');
    err.status = 400;
    throw err;
  }
  const trimmed = topic.trim();
  if (trimmed.length === 0) {
    return null;
  }
  if (trimmed.length > QUESTION_LIMITS.MAX_TOPIC_LENGTH) {
    const err = new Error(
      `Topic cannot exceed ${QUESTION_LIMITS.MAX_TOPIC_LENGTH} characters.`
    );
    err.status = 400;
    throw err;
  }
  return trimmed;
}

/**
 * Validates question type.
 */
export function validateQuestionType(type) {
  if (typeof type !== 'string') {
    const err = new Error(
      `Field "type" is required and must be one of: ${QUESTION_LIMITS.ALLOWED_TYPES.join(', ')}.`
    );
    err.status = 400;
    throw err;
  }
  const upper = type.toUpperCase().trim();
  if (!QUESTION_LIMITS.ALLOWED_TYPES.includes(upper)) {
    const err = new Error(
      `Question type "${type}" is invalid. Allowed types: ${QUESTION_LIMITS.ALLOWED_TYPES.join(', ')}.`
    );
    err.status = 400;
    throw err;
  }
  return upper;
}

/**
 * Validates question difficulty.
 */
export function validateQuestionDifficulty(difficulty) {
  if (difficulty === undefined || difficulty === null) {
    return 'medium';
  }
  if (typeof difficulty !== 'string') {
    const err = new Error('Field "difficulty" must be a string.');
    err.status = 400;
    throw err;
  }
  const lower = difficulty.toLowerCase().trim();
  if (!QUESTION_LIMITS.ALLOWED_DIFFICULTIES.includes(lower)) {
    const err = new Error(
      `Difficulty "${difficulty}" is invalid. Allowed: ${QUESTION_LIMITS.ALLOWED_DIFFICULTIES.join(', ')}.`
    );
    err.status = 400;
    throw err;
  }
  return lower;
}

/**
 * Validates mastery status.
 */
export function validateQuestionStatus(status) {
  if (status === undefined || status === null) {
    return 'unlearned';
  }
  if (typeof status !== 'string') {
    const err = new Error('Field "status" must be a string.');
    err.status = 400;
    throw err;
  }
  const lower = status.toLowerCase().trim();
  if (!QUESTION_LIMITS.ALLOWED_STATUSES.includes(lower)) {
    const err = new Error(
      `Status "${status}" is invalid. Allowed: ${QUESTION_LIMITS.ALLOWED_STATUSES.join(', ')}.`
    );
    err.status = 400;
    throw err;
  }
  return lower;
}

/**
 * Validates MCQ options array and correct_option_index.
 */
export function validateMcqOptionsAndCorrectIndex(options, correctOptionIndex) {
  if (!Array.isArray(options)) {
    const err = new Error('MCQ questions require an "options" array.');
    err.status = 400;
    throw err;
  }

  if (
    options.length < QUESTION_LIMITS.MIN_MCQ_OPTIONS ||
    options.length > QUESTION_LIMITS.MAX_MCQ_OPTIONS
  ) {
    const err = new Error(
      `MCQ questions must have between ${QUESTION_LIMITS.MIN_MCQ_OPTIONS} and ${QUESTION_LIMITS.MAX_MCQ_OPTIONS} options.`
    );
    err.status = 400;
    throw err;
  }

  const normalizedOptions = [];
  for (let i = 0; i < options.length; i++) {
    const opt = options[i];
    if (typeof opt !== 'string' || opt.trim().length === 0) {
      const err = new Error(`MCQ option at index ${i} cannot be empty.`);
      err.status = 400;
      throw err;
    }
    const trimmed = opt.trim();
    if (trimmed.length > QUESTION_LIMITS.MAX_MCQ_OPTION_LENGTH) {
      const err = new Error(
        `MCQ option at index ${i} cannot exceed ${QUESTION_LIMITS.MAX_MCQ_OPTION_LENGTH} characters.`
      );
      err.status = 400;
      throw err;
    }
    normalizedOptions.push(trimmed);
  }

  if (
    correctOptionIndex === undefined ||
    correctOptionIndex === null ||
    typeof correctOptionIndex !== 'number' ||
    !Number.isInteger(correctOptionIndex) ||
    correctOptionIndex < 0 ||
    correctOptionIndex >= normalizedOptions.length
  ) {
    const err = new Error(
      `MCQ "correctOptionIndex" must be an integer between 0 and ${normalizedOptions.length - 1}.`
    );
    err.status = 400;
    throw err;
  }

  return {
    options: normalizedOptions,
    correctOptionIndex,
  };
}

function mapQuestionRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    type: row.type,
    question: row.question,
    answer: row.answer,
    explanation: row.explanation,
    difficulty: row.difficulty,
    options: row.options,
    correctOptionIndex: row.correct_option_index,
    status: row.status,
    topic: row.topic,
    lastPracticedAt: row.last_practiced_at ? row.last_practiced_at.toISOString() : null,
    createdAt: row.created_at ? row.created_at.toISOString() : null,
    updatedAt: row.updated_at ? row.updated_at.toISOString() : null,
  };
}

/**
 * Creates a new question owned by the user.
 */
export async function createQuestion({
  userId,
  type,
  question,
  answer = null,
  explanation = null,
  topic = null,
  difficulty = 'medium',
  status = 'unlearned',
  options = null,
  correctOptionIndex = null,
  pool = getPool(),
}) {
  const normalizedType = validateQuestionType(type);
  const normalizedQuestion = validateAndNormalizeQuestionText(question);
  const normalizedAnswer = validateAndNormalizeAnswer(answer);
  const normalizedExplanation = validateAndNormalizeExplanation(explanation);
  const normalizedTopic = validateAndNormalizeTopic(topic);
  const normalizedDifficulty = validateQuestionDifficulty(difficulty);
  const normalizedStatus = validateQuestionStatus(status);

  let finalOptions = null;
  let finalCorrectOptionIndex = null;

  if (normalizedType === 'MCQ') {
    const mcqValidation = validateMcqOptionsAndCorrectIndex(options, correctOptionIndex);
    finalOptions = JSON.stringify(mcqValidation.options);
    finalCorrectOptionIndex = mcqValidation.correctOptionIndex;
  }

  const query = `
    INSERT INTO questions (
      user_id,
      type,
      question,
      answer,
      explanation,
      topic,
      difficulty,
      status,
      options,
      correct_option_index
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10)
    RETURNING
      id,
      type,
      question,
      answer,
      explanation,
      difficulty,
      options,
      correct_option_index,
      status,
      topic,
      last_practiced_at,
      created_at,
      updated_at;
  `;

  const values = [
    userId,
    normalizedType,
    normalizedQuestion,
    normalizedAnswer,
    normalizedExplanation,
    normalizedTopic,
    normalizedDifficulty,
    normalizedStatus,
    finalOptions,
    finalCorrectOptionIndex,
  ];

  const result = await pool.query(query, values);
  return mapQuestionRow(result.rows[0]);
}

/**
 * Lists active questions owned by the user with filtering, search, and pagination.
 */
export async function findQuestionsByUserId({
  userId,
  type,
  difficulty,
  status,
  topic,
  q = '',
  limit = 20,
  offset = 0,
  pool = getPool(),
}) {
  const conditions = ['user_id = $1', 'deleted_at IS NULL'];
  const values = [userId];

  if (type && QUESTION_LIMITS.ALLOWED_TYPES.includes(type.toUpperCase())) {
    values.push(type.toUpperCase());
    conditions.push(`type = $${values.length}`);
  }

  if (difficulty && QUESTION_LIMITS.ALLOWED_DIFFICULTIES.includes(difficulty.toLowerCase())) {
    values.push(difficulty.toLowerCase());
    conditions.push(`difficulty = $${values.length}`);
  }

  if (status && QUESTION_LIMITS.ALLOWED_STATUSES.includes(status.toLowerCase())) {
    values.push(status.toLowerCase());
    conditions.push(`status = $${values.length}`);
  }

  if (typeof topic === 'string' && topic.trim().length > 0) {
    values.push(topic.trim().toLowerCase());
    conditions.push(`LOWER(topic) = $${values.length}`);
  }

  if (typeof q === 'string' && q.trim().length > 0) {
    const escaped = escapeLikeWildcards(q.trim());
    values.push(`%${escaped}%`);
    const idx = values.length;
    conditions.push(
      `(question ILIKE $${idx} ESCAPE '\\' OR answer ILIKE $${idx} ESCAPE '\\' OR explanation ILIKE $${idx} ESCAPE '\\' OR topic ILIKE $${idx} ESCAPE '\\')`
    );
  }

  const whereClause = conditions.join(' AND ');

  const countQuery = `SELECT count(*)::int AS total FROM questions WHERE ${whereClause};`;
  const countResult = await pool.query(countQuery, values);
  const total = countResult.rows[0].total;

  const selectValues = [...values, limit + 1, offset];
  const limitParamIdx = selectValues.length - 1;
  const offsetParamIdx = selectValues.length;

  const selectQuery = `
    SELECT
      id,
      type,
      question,
      answer,
      explanation,
      difficulty,
      options,
      correct_option_index,
      status,
      topic,
      last_practiced_at,
      created_at,
      updated_at
    FROM questions
    WHERE ${whereClause}
    ORDER BY updated_at DESC, id ASC
    LIMIT $${limitParamIdx} OFFSET $${offsetParamIdx};
  `;

  const result = await pool.query(selectQuery, selectValues);
  const hasMore = result.rows.length > limit;
  const rawItems = (hasMore ? result.rows.slice(0, limit) : result.rows).map(mapQuestionRow);

  return {
    questions: rawItems,
    items: rawItems,
    rawItems,
    total,
    limit,
    offset,
    hasMore,
  };
}

/**
 * Retrieves a single active question by ID.
 */
export async function findQuestionByIdAndUserId({ id, userId, pool = getPool() }) {
  const query = `
    SELECT
      id,
      type,
      question,
      answer,
      explanation,
      difficulty,
      options,
      correct_option_index,
      status,
      topic,
      last_practiced_at,
      created_at,
      updated_at
    FROM questions
    WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL;
  `;

  const result = await pool.query(query, [id, userId]);
  if (result.rowCount === 0) {
    return null;
  }
  return mapQuestionRow(result.rows[0]);
}

/**
 * Updates an owned, active question.
 * Handles switching question types cleanly.
 */
export async function updateQuestion({
  id,
  userId,
  type,
  question,
  answer,
  explanation,
  topic,
  difficulty,
  status,
  options,
  correctOptionIndex,
  pool = getPool(),
}) {
  // First fetch existing question to inspect current type
  const existing = await findQuestionByIdAndUserId({ id, userId, pool });
  if (!existing) {
    return { notFound: true };
  }

  const effectiveType = type !== undefined ? validateQuestionType(type) : existing.type;
  const setClauses = ['updated_at = now()'];
  const values = [id, userId];

  if (type !== undefined) {
    values.push(effectiveType);
    setClauses.push(`type = $${values.length}`);
  }

  if (question !== undefined) {
    const normalizedQuestion = validateAndNormalizeQuestionText(question);
    values.push(normalizedQuestion);
    setClauses.push(`question = $${values.length}`);
  }

  if (answer !== undefined) {
    const normalizedAnswer = validateAndNormalizeAnswer(answer);
    values.push(normalizedAnswer);
    setClauses.push(`answer = $${values.length}`);
  }

  if (explanation !== undefined) {
    const normalizedExplanation = validateAndNormalizeExplanation(explanation);
    values.push(normalizedExplanation);
    setClauses.push(`explanation = $${values.length}`);
  }

  if (topic !== undefined) {
    const normalizedTopic = validateAndNormalizeTopic(topic);
    values.push(normalizedTopic);
    setClauses.push(`topic = $${values.length}`);
  }

  if (difficulty !== undefined) {
    const normalizedDifficulty = validateQuestionDifficulty(difficulty);
    values.push(normalizedDifficulty);
    setClauses.push(`difficulty = $${values.length}`);
  }

  if (status !== undefined) {
    const normalizedStatus = validateQuestionStatus(status);
    values.push(normalizedStatus);
    setClauses.push(`status = $${values.length}`);
  }

  // Type-handling for options and correctOptionIndex
  if (effectiveType === 'MCQ') {
    // If transitioning to MCQ or updating MCQ options
    const effectiveOptions = options !== undefined ? options : existing.options;
    const effectiveCorrectIndex =
      correctOptionIndex !== undefined ? correctOptionIndex : existing.correctOptionIndex;

    const mcqValidation = validateMcqOptionsAndCorrectIndex(
      effectiveOptions,
      effectiveCorrectIndex
    );

    values.push(JSON.stringify(mcqValidation.options));
    setClauses.push(`options = $${values.length}::jsonb`);

    values.push(mcqValidation.correctOptionIndex);
    setClauses.push(`correct_option_index = $${values.length}`);
  } else {
    // If changing away from MCQ or is non-MCQ: clear options and correct_option_index
    setClauses.push('options = NULL');
    setClauses.push('correct_option_index = NULL');
  }

  const query = `
    UPDATE questions
    SET ${setClauses.join(', ')}
    WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL
    RETURNING
      id,
      type,
      question,
      answer,
      explanation,
      difficulty,
      options,
      correct_option_index,
      status,
      topic,
      last_practiced_at,
      created_at,
      updated_at;
  `;

  const result = await pool.query(query, values);
  if (result.rowCount === 0) {
    return { notFound: true };
  }
  return { question: mapQuestionRow(result.rows[0]) };
}

/**
 * Updates practice timestamp on a question.
 */
export async function recordPractice({ id, userId, result: practiceResult, pool = getPool() }) {
  if (
    practiceResult !== undefined &&
    practiceResult !== null &&
    !QUESTION_LIMITS.ALLOWED_PRACTICE_RESULTS.includes(practiceResult)
  ) {
    const err = new Error(
      `Practice result must be one of: ${QUESTION_LIMITS.ALLOWED_PRACTICE_RESULTS.join(', ')}.`
    );
    err.status = 400;
    throw err;
  }

  const query = `
    UPDATE questions
    SET
      last_practiced_at = now(),
      updated_at = now()
    WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL
    RETURNING
      id,
      type,
      question,
      answer,
      explanation,
      difficulty,
      options,
      correct_option_index,
      status,
      topic,
      last_practiced_at,
      created_at,
      updated_at;
  `;

  const result = await pool.query(query, [id, userId]);
  if (result.rowCount === 0) {
    return { notFound: true };
  }
  return { question: mapQuestionRow(result.rows[0]) };
}

/**
 * Updates mastery status only.
 */
export async function updateQuestionStatus({ id, userId, status, pool = getPool() }) {
  const normalizedStatus = validateQuestionStatus(status);

  const query = `
    UPDATE questions
    SET
      status = $1,
      updated_at = now()
    WHERE id = $2 AND user_id = $3 AND deleted_at IS NULL
    RETURNING
      id,
      type,
      question,
      answer,
      explanation,
      difficulty,
      options,
      correct_option_index,
      status,
      topic,
      last_practiced_at,
      created_at,
      updated_at;
  `;

  const result = await pool.query(query, [normalizedStatus, id, userId]);
  if (result.rowCount === 0) {
    return { notFound: true };
  }
  return { question: mapQuestionRow(result.rows[0]) };
}

/**
 * Soft deletes an owned question. Never physically deletes data.
 */
export async function softDeleteQuestion({ id, userId, pool = getPool() }) {
  const query = `
    UPDATE questions
    SET
      deleted_at = now(),
      updated_at = now()
    WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL
    RETURNING id;
  `;

  const result = await pool.query(query, [id, userId]);
  if (result.rowCount === 1) {
    return { success: true, deleted: true };
  }
  return { notFound: true };
}

