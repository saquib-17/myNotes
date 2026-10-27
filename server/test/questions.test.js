import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import session from 'express-session';
import { createApp } from '../src/app.js';
import { createAuthRouter } from '../src/routes/auth.routes.js';
import { createQuestionsRouter } from '../src/routes/questions.routes.js';
import {
  QUESTION_LIMITS,
  validateAndNormalizeQuestionText,
  validateAndNormalizeAnswer,
  validateAndNormalizeExplanation,
  validateAndNormalizeTopic,
  validateQuestionType,
  validateQuestionDifficulty,
  validateQuestionStatus,
  validateMcqOptionsAndCorrectIndex,
} from '../src/questions/questionRepository.js';

describe('Question Bank REST API & Repository Tests (Isolated Seams)', () => {
  let mockUsers;
  let mockQuestions;
  let app;
  let mockQuestionRepo;

  const USER_A_ID = '11111111-1111-4111-8111-111111111111';
  const USER_B_ID = '22222222-2222-4222-8222-222222222222';

  beforeEach(() => {
    mockUsers = new Map([
      [USER_A_ID, { id: USER_A_ID, email: 'usera@example.com' }],
      [USER_B_ID, { id: USER_B_ID, email: 'userb@example.com' }],
    ]);
    mockQuestions = new Map();

    let questionIdCounter = 1;

    mockQuestionRepo = {
      QUESTION_LIMITS,
      validateAndNormalizeQuestionText,
      validateAndNormalizeAnswer,
      validateAndNormalizeExplanation,
      validateAndNormalizeTopic,
      validateQuestionType,
      validateQuestionDifficulty,
      validateQuestionStatus,
      validateMcqOptionsAndCorrectIndex,

      async createQuestion({
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
          const mcqVal = validateMcqOptionsAndCorrectIndex(options, correctOptionIndex);
          finalOptions = mcqVal.options;
          finalCorrectOptionIndex = mcqVal.correctOptionIndex;
        }

        const id = `00000000-0000-4000-8000-${String(questionIdCounter++).padStart(12, '0')}`;
        const now = new Date();
        const record = {
          id,
          userId,
          type: normalizedType,
          question: normalizedQuestion,
          answer: normalizedAnswer,
          explanation: normalizedExplanation,
          topic: normalizedTopic,
          difficulty: normalizedDifficulty,
          status: normalizedStatus,
          options: finalOptions,
          correctOptionIndex: finalCorrectOptionIndex,
          lastPracticedAt: null,
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
        };

        mockQuestions.set(id, record);
        return {
          id: record.id,
          type: record.type,
          question: record.question,
          answer: record.answer,
          explanation: record.explanation,
          topic: record.topic,
          difficulty: record.difficulty,
          status: record.status,
          options: record.options,
          correctOptionIndex: record.correctOptionIndex,
          lastPracticedAt: null,
          createdAt: record.createdAt.toISOString(),
          updatedAt: record.updatedAt.toISOString(),
        };
      },

      async findQuestionsByUserId({
        userId,
        type,
        difficulty,
        status,
        topic,
        q = '',
        limit = 20,
        offset = 0,
      }) {
        let list = Array.from(mockQuestions.values()).filter(
          (qItem) => qItem.userId === userId && qItem.deletedAt === null
        );

        if (type) {
          list = list.filter((item) => item.type === type.toUpperCase());
        }
        if (difficulty) {
          list = list.filter((item) => item.difficulty === difficulty.toLowerCase());
        }
        if (status) {
          list = list.filter((item) => item.status === status.toLowerCase());
        }
        if (topic) {
          list = list.filter(
            (item) => item.topic && item.topic.toLowerCase() === topic.toLowerCase()
          );
        }
        if (q && q.trim()) {
          const lowerQ = q.trim().toLowerCase();
          list = list.filter(
            (item) =>
              item.question.toLowerCase().includes(lowerQ) ||
              (item.answer && item.answer.toLowerCase().includes(lowerQ)) ||
              (item.explanation && item.explanation.toLowerCase().includes(lowerQ)) ||
              (item.topic && item.topic.toLowerCase().includes(lowerQ))
          );
        }

        // Default sort: updated_at DESC, id ASC
        list.sort((a, b) => {
          const timeA = new Date(a.updatedAt).getTime();
          const timeB = new Date(b.updatedAt).getTime();
          if (timeA !== timeB) return timeB - timeA;
          return a.id.localeCompare(b.id);
        });

        const total = list.length;
        const page = list.slice(offset, offset + limit);
        const hasMore = offset + limit < total;

        const formatted = page.map((item) => ({
          id: item.id,
          type: item.type,
          question: item.question,
          answer: item.answer,
          explanation: item.explanation,
          topic: item.topic,
          difficulty: item.difficulty,
          status: item.status,
          options: item.options,
          correctOptionIndex: item.correctOptionIndex,
          lastPracticedAt: item.lastPracticedAt ? item.lastPracticedAt.toISOString() : null,
          createdAt: item.createdAt.toISOString(),
          updatedAt: item.updatedAt.toISOString(),
        }));

        return {
          questions: formatted,
          items: formatted,
          rawItems: formatted,
          total,
          limit,
          offset,
          hasMore,
        };
      },

      async findQuestionByIdAndUserId({ id, userId }) {
        const item = mockQuestions.get(id);
        if (!item || item.userId !== userId || item.deletedAt !== null) {
          return null;
        }
        return {
          id: item.id,
          type: item.type,
          question: item.question,
          answer: item.answer,
          explanation: item.explanation,
          topic: item.topic,
          difficulty: item.difficulty,
          status: item.status,
          options: item.options,
          correctOptionIndex: item.correctOptionIndex,
          lastPracticedAt: item.lastPracticedAt ? item.lastPracticedAt.toISOString() : null,
          createdAt: item.createdAt.toISOString(),
          updatedAt: item.updatedAt.toISOString(),
        };
      },

      async updateQuestion({
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
      }) {
        const item = mockQuestions.get(id);
        if (!item || item.userId !== userId || item.deletedAt !== null) {
          return { notFound: true };
        }

        const effectiveType = type !== undefined ? validateQuestionType(type) : item.type;
        const now = new Date();

        if (type !== undefined) item.type = effectiveType;
        if (question !== undefined) item.question = validateAndNormalizeQuestionText(question);
        if (answer !== undefined) item.answer = validateAndNormalizeAnswer(answer);
        if (explanation !== undefined) {
          item.explanation = validateAndNormalizeExplanation(explanation);
        }
        if (topic !== undefined) item.topic = validateAndNormalizeTopic(topic);
        if (difficulty !== undefined) item.difficulty = validateQuestionDifficulty(difficulty);
        if (status !== undefined) item.status = validateQuestionStatus(status);

        if (effectiveType === 'MCQ') {
          const effOptions = options !== undefined ? options : item.options;
          const effCorrect =
            correctOptionIndex !== undefined ? correctOptionIndex : item.correctOptionIndex;
          const mcqVal = validateMcqOptionsAndCorrectIndex(effOptions, effCorrect);
          item.options = mcqVal.options;
          item.correctOptionIndex = mcqVal.correctOptionIndex;
        } else {
          item.options = null;
          item.correctOptionIndex = null;
        }

        item.updatedAt = now;

        return {
          question: {
            id: item.id,
            type: item.type,
            question: item.question,
            answer: item.answer,
            explanation: item.explanation,
            topic: item.topic,
            difficulty: item.difficulty,
            status: item.status,
            options: item.options,
            correctOptionIndex: item.correctOptionIndex,
            lastPracticedAt: item.lastPracticedAt ? item.lastPracticedAt.toISOString() : null,
            createdAt: item.createdAt.toISOString(),
            updatedAt: item.updatedAt.toISOString(),
          },
        };
      },

      async recordPractice({ id, userId, result: practiceResult }) {
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

        const item = mockQuestions.get(id);
        if (!item || item.userId !== userId || item.deletedAt !== null) {
          return { notFound: true };
        }
        const now = new Date();
        item.lastPracticedAt = now;
        item.updatedAt = now;
        return {
          question: {
            id: item.id,
            type: item.type,
            question: item.question,
            answer: item.answer,
            explanation: item.explanation,
            topic: item.topic,
            difficulty: item.difficulty,
            status: item.status,
            options: item.options,
            correctOptionIndex: item.correctOptionIndex,
            lastPracticedAt: item.lastPracticedAt.toISOString(),
            createdAt: item.createdAt.toISOString(),
            updatedAt: item.updatedAt.toISOString(),
          },
        };
      },

      async updateQuestionStatus({ id, userId, status }) {
        const item = mockQuestions.get(id);
        if (!item || item.userId !== userId || item.deletedAt !== null) {
          return { notFound: true };
        }
        const normalizedStatus = validateQuestionStatus(status);
        const now = new Date();
        item.status = normalizedStatus;
        item.updatedAt = now;
        return {
          question: {
            id: item.id,
            type: item.type,
            question: item.question,
            answer: item.answer,
            explanation: item.explanation,
            topic: item.topic,
            difficulty: item.difficulty,
            status: item.status,
            options: item.options,
            correctOptionIndex: item.correctOptionIndex,
            lastPracticedAt: item.lastPracticedAt ? item.lastPracticedAt.toISOString() : null,
            createdAt: item.createdAt.toISOString(),
            updatedAt: item.updatedAt.toISOString(),
          },
        };
      },

      async softDeleteQuestion({ id, userId }) {
        const item = mockQuestions.get(id);
        if (!item || item.userId !== userId || item.deletedAt !== null) {
          return { notFound: true };
        }
        item.deletedAt = new Date();
        item.updatedAt = new Date();
        return { success: true, deleted: true };
      },
    };

    const mockAuthRepo = {
      async findUserById(id) {
        return mockUsers.get(id) || null;
      },
      async findUserByEmail(email) {
        for (const user of mockUsers.values()) {
          if (user.email === email) return user;
        }
        return null;
      },
    };

    const testSessionMiddleware = session({
      secret: 'questions-test-session-secret-at-least-32-chars-long',
      resave: false,
      saveUninitialized: false,
      cookie: { secure: false },
    });

    const mockRequireAuth = (req, res, next) => {
      const authHeader = req.headers['x-test-user-id'];
      const userId = (req.session && req.session.userId) || authHeader;
      if (!userId || !mockUsers.has(userId)) {
        return res.status(401).json({
          error: 'Unauthorized',
          message: 'Authentication required to access this resource.',
        });
      }
      req.user = mockUsers.get(userId);
      next();
    };

    const authRouter = createAuthRouter({
      authRepository: mockAuthRepo,
      requireAuthMiddleware: mockRequireAuth,
    });

    const questionsRouter = createQuestionsRouter({
      questionRepository: mockQuestionRepo,
      requireAuthMiddleware: mockRequireAuth,
    });

    app = createApp({
      sessionMiddleware: testSessionMiddleware,
      authRouter,
      questionsRouter,
    });
  });

  async function getCsrfAndCookie(agent) {
    const res = await agent.get('/api/auth/csrf');
    return {
      csrfToken: res.body.csrfToken,
      cookie: res.headers['set-cookie'],
    };
  }

  // 1. Repository Validators
  describe('Repository Validation Helpers', () => {
    it('validates question text constraints', () => {
      assert.throws(() => validateAndNormalizeQuestionText(''), /cannot be empty/);
      assert.throws(() => validateAndNormalizeQuestionText('   '), /cannot be empty/);
      assert.throws(() => validateAndNormalizeQuestionText('a'.repeat(2001)), /cannot exceed 2000/);
      assert.equal(
        validateAndNormalizeQuestionText('  What is a deadlock?  '),
        'What is a deadlock?'
      );
    });

    it('validates answer constraints', () => {
      assert.equal(validateAndNormalizeAnswer(null), null);
      assert.equal(validateAndNormalizeAnswer(undefined), null);
      assert.equal(validateAndNormalizeAnswer(''), null);
      assert.equal(validateAndNormalizeAnswer('   '), null);
      assert.throws(() => validateAndNormalizeAnswer('a'.repeat(5001)), /cannot exceed 5000/);
      assert.equal(
        validateAndNormalizeAnswer('  Mutual exclusion, hold and wait  '),
        'Mutual exclusion, hold and wait'
      );
    });

    it('validates explanation constraints', () => {
      assert.equal(validateAndNormalizeExplanation(null), null);
      assert.equal(validateAndNormalizeExplanation(''), null);
      assert.throws(() => validateAndNormalizeExplanation('a'.repeat(5001)), /cannot exceed 5000/);
      assert.equal(
        validateAndNormalizeExplanation('  Detailed explanation  '),
        'Detailed explanation'
      );
    });

    it('validates topic constraints', () => {
      assert.equal(validateAndNormalizeTopic(null), null);
      assert.equal(validateAndNormalizeTopic(''), null);
      assert.throws(() => validateAndNormalizeTopic('a'.repeat(81)), /cannot exceed 80/);
      assert.equal(validateAndNormalizeTopic('  Operating Systems  '), 'Operating Systems');
    });

    it('validates type constraints', () => {
      assert.equal(validateQuestionType('SHORT_ANSWER'), 'SHORT_ANSWER');
      assert.equal(validateQuestionType('mcq'), 'MCQ');
      assert.equal(validateQuestionType('coding'), 'CODING');
      assert.throws(() => validateQuestionType('ESSAY'), /invalid/i);
    });

    it('validates difficulty constraints', () => {
      assert.equal(validateQuestionDifficulty(undefined), 'medium');
      assert.equal(validateQuestionDifficulty(null), 'medium');
      assert.equal(validateQuestionDifficulty('easy'), 'easy');
      assert.equal(validateQuestionDifficulty('HARD'), 'hard');
      assert.throws(() => validateQuestionDifficulty('extreme'), /invalid/i);
    });

    it('validates status constraints', () => {
      assert.equal(validateQuestionStatus(undefined), 'unlearned');
      assert.equal(validateQuestionStatus(null), 'unlearned');
      assert.equal(validateQuestionStatus('learning'), 'learning');
      assert.equal(validateQuestionStatus('MASTERED'), 'mastered');
      assert.throws(() => validateQuestionStatus('expert'), /invalid/i);
    });

    it('validates MCQ options and correct option index constraints', () => {
      assert.throws(() => validateMcqOptionsAndCorrectIndex('not an array', 0), /options/i);
      assert.throws(() => validateMcqOptionsAndCorrectIndex(['One'], 0), /between 2 and 6/i);
      assert.throws(
        () => validateMcqOptionsAndCorrectIndex(['1', '2', '3', '4', '5', '6', '7'], 0),
        /between 2 and 6/i
      );
      assert.throws(
        () => validateMcqOptionsAndCorrectIndex(['Valid', '   '], 0),
        /cannot be empty/i
      );
      assert.throws(
        () => validateMcqOptionsAndCorrectIndex(['Valid', 'a'.repeat(301)], 0),
        /cannot exceed 300/i
      );
      assert.throws(() => validateMcqOptionsAndCorrectIndex(['A', 'B'], -1), /correctOptionIndex/i);
      assert.throws(() => validateMcqOptionsAndCorrectIndex(['A', 'B'], 2), /correctOptionIndex/i);
      assert.throws(
        () => validateMcqOptionsAndCorrectIndex(['A', 'B'], 1.5),
        /correctOptionIndex/i
      );

      const valid = validateMcqOptionsAndCorrectIndex(['  Alpha ', 'Beta  ', 'Gamma'], 1);
      assert.deepEqual(valid.options, ['Alpha', 'Beta', 'Gamma']);
      assert.equal(valid.correctOptionIndex, 1);
    });
  });

  // 2. Authentication Enforcement
  describe('Authentication Enforcement', () => {
    it('rejects unauthenticated requests to all endpoints with 401', async () => {
      const getRes = await request(app).get('/api/questions');
      assert.equal(getRes.status, 401);

      const postRes = await request(app).post('/api/questions').send({
        type: 'SHORT_ANSWER',
        question: 'What is polymorphism?',
      });
      assert.equal(postRes.status, 401);

      const getOneRes = await request(app).get(
        '/api/questions/11111111-1111-4111-8111-111111111111'
      );
      assert.equal(getOneRes.status, 401);

      const patchRes = await request(app)
        .patch('/api/questions/11111111-1111-4111-8111-111111111111')
        .send({ question: 'Updated' });
      assert.equal(patchRes.status, 401);

      const practiceRes = await request(app).post(
        '/api/questions/11111111-1111-4111-8111-111111111111/practice'
      );
      assert.equal(practiceRes.status, 401);

      const statusRes = await request(app)
        .patch('/api/questions/11111111-1111-4111-8111-111111111111/status')
        .send({ status: 'learning' });
      assert.equal(statusRes.status, 401);

      const deleteRes = await request(app).delete(
        '/api/questions/11111111-1111-4111-8111-111111111111'
      );
      assert.equal(deleteRes.status, 401);
    });
  });

  // 3. CSRF Protection
  describe('CSRF Protection on Mutations', () => {
    it('rejects mutations when CSRF token is missing or invalid', async () => {
      const agent = request.agent(app);
      const fakeUuid = '00000000-0000-4000-8000-000000000001';

      const postRes = await agent
        .post('/api/questions')
        .set('x-test-user-id', USER_A_ID)
        .send({ type: 'SHORT_ANSWER', question: 'No CSRF' });
      assert.equal(postRes.status, 403);

      const patchRes = await agent
        .patch(`/api/questions/${fakeUuid}`)
        .set('x-test-user-id', USER_A_ID)
        .set('x-csrf-token', 'invalid-token')
        .send({ question: 'Updated' });
      assert.equal(patchRes.status, 403);

      const practiceRes = await agent
        .post(`/api/questions/${fakeUuid}/practice`)
        .set('x-test-user-id', USER_A_ID)
        .set('x-csrf-token', 'invalid-token');
      assert.equal(practiceRes.status, 403);

      const statusRes = await agent
        .patch(`/api/questions/${fakeUuid}/status`)
        .set('x-test-user-id', USER_A_ID)
        .set('x-csrf-token', 'invalid-token')
        .send({ status: 'mastered' });
      assert.equal(statusRes.status, 403);

      const deleteRes = await agent
        .delete(`/api/questions/${fakeUuid}`)
        .set('x-test-user-id', USER_A_ID)
        .set('x-csrf-token', 'invalid-token');
      assert.equal(deleteRes.status, 403);
    });
  });

  // 4. Creation of Each Question Type
  describe('POST /api/questions', () => {
    it('creates a SHORT_ANSWER question with topic and difficulty', async () => {
      const agent = request.agent(app);
      const { csrfToken } = await getCsrfAndCookie(agent);

      const res = await agent
        .post('/api/questions')
        .set('x-test-user-id', USER_A_ID)
        .set('x-csrf-token', csrfToken)
        .send({
          type: 'SHORT_ANSWER',
          question: 'What is virtual memory?',
          answer: 'An OS memory management technique providing illusion of large memory.',
          explanation: 'Uses paging and swapping.',
          topic: 'Operating Systems',
          difficulty: 'medium',
        });

      assert.equal(res.status, 201);
      assert.ok(res.body.id);
      assert.equal(res.body.type, 'SHORT_ANSWER');
      assert.equal(res.body.question, 'What is virtual memory?');
      assert.equal(res.body.topic, 'Operating Systems');
      assert.equal(res.body.difficulty, 'medium');
      assert.equal(res.body.status, 'unlearned');
      assert.equal(res.body.options, null);
    });

    it('creates an MCQ question with options and correctOptionIndex', async () => {
      const agent = request.agent(app);
      const { csrfToken } = await getCsrfAndCookie(agent);

      const res = await agent
        .post('/api/questions')
        .set('x-test-user-id', USER_A_ID)
        .set('x-csrf-token', csrfToken)
        .send({
          type: 'MCQ',
          question: 'Which data structure uses LIFO order?',
          options: ['Queue', 'Stack', 'Linked List', 'Binary Tree'],
          correctOptionIndex: 1,
          topic: 'Data Structures',
          difficulty: 'easy',
        });

      assert.equal(res.status, 201);
      assert.equal(res.body.type, 'MCQ');
      assert.deepEqual(res.body.options, ['Queue', 'Stack', 'Linked List', 'Binary Tree']);
      assert.equal(res.body.correctOptionIndex, 1);
    });

    it('creates a CODING question with solution answer and explanation', async () => {
      const agent = request.agent(app);
      const { csrfToken } = await getCsrfAndCookie(agent);

      const res = await agent
        .post('/api/questions')
        .set('x-test-user-id', USER_A_ID)
        .set('x-csrf-token', csrfToken)
        .send({
          type: 'CODING',
          question: 'Reverse a singly linked list in-place.',
          answer: 'curr = head; prev = null; while (curr) { next = curr.next; curr.next = prev; prev = curr; curr = next; }',
          explanation: 'O(N) time and O(1) space complexity.',
          topic: 'Linked Lists',
          difficulty: 'medium',
        });

      assert.equal(res.status, 201);
      assert.equal(res.body.type, 'CODING');
      assert.ok(res.body.answer.includes('while (curr)'));
    });

    it('rejects unknown fields in payload', async () => {
      const agent = request.agent(app);
      const { csrfToken } = await getCsrfAndCookie(agent);

      const res = await agent
        .post('/api/questions')
        .set('x-test-user-id', USER_A_ID)
        .set('x-csrf-token', csrfToken)
        .send({
          type: 'SHORT_ANSWER',
          question: 'Valid text',
          unknownProperty: 123,
        });

      assert.equal(res.status, 400);
      assert.match(res.body.message, /Unknown or unpermitted field/);
    });

    it('rejects MCQ without options or valid correctOptionIndex', async () => {
      const agent = request.agent(app);
      const { csrfToken } = await getCsrfAndCookie(agent);

      const res = await agent
        .post('/api/questions')
        .set('x-test-user-id', USER_A_ID)
        .set('x-csrf-token', csrfToken)
        .send({
          type: 'MCQ',
          question: 'Incomplete MCQ',
        });

      assert.equal(res.status, 400);
      assert.match(res.body.message, /options/i);
    });
  });

  // 5. Listing, Filters, and Search
  describe('GET /api/questions', () => {
    it('lists questions with status, difficulty, type, and search filters', async () => {
      const agent = request.agent(app);
      const { csrfToken } = await getCsrfAndCookie(agent);

      // Create several questions
      await agent.post('/api/questions').set('x-test-user-id', USER_A_ID).set('x-csrf-token', csrfToken).send({
        type: 'SHORT_ANSWER',
        question: 'Explain ACID properties in databases.',
        topic: 'SQL & Databases',
        difficulty: 'hard',
        status: 'unlearned',
      });
      await agent.post('/api/questions').set('x-test-user-id', USER_A_ID).set('x-csrf-token', csrfToken).send({
        type: 'MCQ',
        question: 'What is the time complexity of quicksort average case?',
        options: ['O(N)', 'O(N log N)', 'O(N^2)', 'O(1)'],
        correctOptionIndex: 1,
        topic: 'Algorithms',
        difficulty: 'medium',
        status: 'learning',
      });
      await agent.post('/api/questions').set('x-test-user-id', USER_A_ID).set('x-csrf-token', csrfToken).send({
        type: 'CODING',
        question: 'Find the two sum in an array.',
        topic: 'Arrays',
        difficulty: 'easy',
        status: 'mastered',
      });

      // List all
      const listRes = await agent.get('/api/questions').set('x-test-user-id', USER_A_ID);
      assert.equal(listRes.status, 200);
      assert.equal(listRes.body.total, 3);
      assert.equal(listRes.body.questions.length, 3);

      // Filter by type=MCQ
      const mcqRes = await agent.get('/api/questions?type=MCQ').set('x-test-user-id', USER_A_ID);
      assert.equal(mcqRes.body.total, 1);
      assert.equal(mcqRes.body.questions[0].type, 'MCQ');

      // Filter by difficulty=hard
      const diffRes = await agent.get('/api/questions?difficulty=hard').set('x-test-user-id', USER_A_ID);
      assert.equal(diffRes.body.total, 1);
      assert.equal(diffRes.body.questions[0].difficulty, 'hard');

      // Filter by status=mastered
      const statusRes = await agent.get('/api/questions?status=mastered').set('x-test-user-id', USER_A_ID);
      assert.equal(statusRes.body.total, 1);
      assert.equal(statusRes.body.questions[0].status, 'mastered');

      // Search with q
      const searchRes = await agent.get('/api/questions?q=ACID').set('x-test-user-id', USER_A_ID);
      assert.equal(searchRes.body.total, 1);
      assert.ok(searchRes.body.questions[0].question.includes('ACID'));
    });

    it('rejects invalid query parameters', async () => {
      const agent = request.agent(app);
      const res = await agent.get('/api/questions?type=INVALID').set('x-test-user-id', USER_A_ID);
      assert.equal(res.status, 400);
    });
  });

  // 6. Practice, Status Update, Type Switching, and Soft Delete
  describe('Question Operations, Practice & Type Switching', () => {
    it('executes practice, updates status, handles type-change cleanup, and soft deletes', async () => {
      const agent = request.agent(app);
      const { csrfToken } = await getCsrfAndCookie(agent);

      // 1. Create MCQ for User A
      const createRes = await agent
        .post('/api/questions')
        .set('x-test-user-id', USER_A_ID)
        .set('x-csrf-token', csrfToken)
        .send({
          type: 'MCQ',
          question: 'Binary search array requirement?',
          options: ['Unsorted', 'Sorted', 'Reversed', 'None'],
          correctOptionIndex: 1,
        });

      const qId = createRes.body.id;

      // 2. User B cannot see User A's question
      const userBGet = await agent.get(`/api/questions/${qId}`).set('x-test-user-id', USER_B_ID);
      assert.equal(userBGet.status, 404);

      // 3. User B cannot practice User A's question
      const userBPractice = await agent
        .post(`/api/questions/${qId}/practice`)
        .set('x-test-user-id', USER_B_ID)
        .set('x-csrf-token', csrfToken);
      assert.equal(userBPractice.status, 404);

      // 4. Practice question with result: 'incorrect'
      const practiceRes = await agent
        .post(`/api/questions/${qId}/practice`)
        .set('x-test-user-id', USER_A_ID)
        .set('x-csrf-token', csrfToken)
        .send({ result: 'incorrect' });
      assert.equal(practiceRes.status, 200);
      assert.ok(practiceRes.body.lastPracticedAt);
      // Status remains unchanged by practice
      assert.equal(practiceRes.body.status, 'unlearned');

      // 5. Update mastery status via status endpoint
      const statusRes = await agent
        .patch(`/api/questions/${qId}/status`)
        .set('x-test-user-id', USER_A_ID)
        .set('x-csrf-token', csrfToken)
        .send({ status: 'learning' });
      assert.equal(statusRes.status, 200);
      assert.equal(statusRes.body.status, 'learning');

      // 6. Type switching: Change from MCQ to SHORT_ANSWER -> options and correctOptionIndex cleared
      const patchRes = await agent
        .patch(`/api/questions/${qId}`)
        .set('x-test-user-id', USER_A_ID)
        .set('x-csrf-token', csrfToken)
        .send({
          type: 'SHORT_ANSWER',
          answer: 'Array must be monotonically sorted.',
        });
      assert.equal(patchRes.status, 200);
      assert.equal(patchRes.body.type, 'SHORT_ANSWER');
      assert.equal(patchRes.body.options, null);
      assert.equal(patchRes.body.correctOptionIndex, null);
      assert.equal(patchRes.body.answer, 'Array must be monotonically sorted.');

      // 7. Soft delete question
      const deleteRes = await agent
        .delete(`/api/questions/${qId}`)
        .set('x-test-user-id', USER_A_ID)
        .set('x-csrf-token', csrfToken);
      assert.equal(deleteRes.status, 204);

      // 8. Subsequent GET returns 404
      const getDeleted = await agent.get(`/api/questions/${qId}`).set('x-test-user-id', USER_A_ID);
      assert.equal(getDeleted.status, 404);

      // 9. Excluded from active list
      const listAfterDel = await agent.get('/api/questions').set('x-test-user-id', USER_A_ID);
      assert.equal(listAfterDel.body.total, 0);
    });
  });
});

