import { Router } from 'express';
import { requireAuth as defaultRequireAuth } from '../auth/requireAuth.js';
import { requireCsrf, setNoCacheHeaders } from '../auth/csrf.js';
import * as defaultQuestionRepo from '../questions/questionRepository.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUuid(id) {
  return typeof id === 'string' && UUID_REGEX.test(id);
}

/**
 * Creates the questions router with configurable dependencies for isolated testing.
 *
 * @param {object} [options]
 * @param {typeof defaultQuestionRepo} [options.questionRepository]
 * @param {import('express').RequestHandler} [options.requireAuthMiddleware]
 * @returns {Router}
 */
export function createQuestionsRouter({
  questionRepository = defaultQuestionRepo,
  requireAuthMiddleware = defaultRequireAuth,
} = {}) {
  const router = Router();

  // Apply strict Cache-Control: no-store and authentication to every questions endpoint
  router.use((req, res, next) => {
    setNoCacheHeaders(res);
    next();
  });
  router.use(requireAuthMiddleware);

  /**
   * GET /api/questions
   * Lists active, non-deleted questions owned by the authenticated user.
   */
  router.get('/', async (req, res, next) => {
    try {
      const { type, difficulty, status, topic, q, limit = '20', offset = '0' } = req.query;

      if (type !== undefined) {
        if (
          typeof type !== 'string' ||
          !defaultQuestionRepo.QUESTION_LIMITS.ALLOWED_TYPES.includes(type.toUpperCase())
        ) {
          return res.status(400).json({
            error: 'BadRequest',
            message: `Query parameter "type" must be one of: ${defaultQuestionRepo.QUESTION_LIMITS.ALLOWED_TYPES.join(', ')}.`,
          });
        }
      }

      if (difficulty !== undefined) {
        if (
          typeof difficulty !== 'string' ||
          !defaultQuestionRepo.QUESTION_LIMITS.ALLOWED_DIFFICULTIES.includes(difficulty.toLowerCase())
        ) {
          return res.status(400).json({
            error: 'BadRequest',
            message: `Query parameter "difficulty" must be one of: ${defaultQuestionRepo.QUESTION_LIMITS.ALLOWED_DIFFICULTIES.join(', ')}.`,
          });
        }
      }

      if (status !== undefined) {
        if (
          typeof status !== 'string' ||
          !defaultQuestionRepo.QUESTION_LIMITS.ALLOWED_STATUSES.includes(status.toLowerCase())
        ) {
          return res.status(400).json({
            error: 'BadRequest',
            message: `Query parameter "status" must be one of: ${defaultQuestionRepo.QUESTION_LIMITS.ALLOWED_STATUSES.join(', ')}.`,
          });
        }
      }

      if (typeof limit !== 'string' || !/^\d+$/.test(limit)) {
        return res.status(400).json({
          error: 'BadRequest',
          message: 'Query parameter "limit" must be a positive integer.',
        });
      }
      const parsedLimit = parseInt(limit, 10);
      if (parsedLimit < 1 || parsedLimit > 100) {
        return res.status(400).json({
          error: 'BadRequest',
          message: 'Query parameter "limit" must be between 1 and 100.',
        });
      }

      if (typeof offset !== 'string' || !/^\d+$/.test(offset)) {
        return res.status(400).json({
          error: 'BadRequest',
          message: 'Query parameter "offset" must be a non-negative integer.',
        });
      }
      const parsedOffset = parseInt(offset, 10);

      const result = await questionRepository.findQuestionsByUserId({
        userId: req.user.id,
        type,
        difficulty,
        status,
        topic,
        q,
        limit: parsedLimit,
        offset: parsedOffset,
      });

      return res.status(200).json({
        questions: result.questions || result.rawItems || [],
        items: result.items || result.rawItems || [],
        total: result.total,
        limit: result.limit,
        offset: result.offset,
        hasMore: result.hasMore,
      });
    } catch (err) {
      return next(err);
    }
  });

  /**
   * POST /api/questions
   * Creates a new question owned by the authenticated user.
   */
  router.post('/', requireCsrf, async (req, res, next) => {
    try {
      if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
        return res.status(400).json({
          error: 'BadRequest',
          message: 'Request body must be a JSON object.',
        });
      }

      const allowedKeys = new Set([
        'type',
        'question',
        'answer',
        'explanation',
        'difficulty',
        'status',
        'topic',
        'options',
        'correctOptionIndex',
      ]);

      for (const key of Object.keys(req.body)) {
        if (!allowedKeys.has(key)) {
          return res.status(400).json({
            error: 'BadRequest',
            message: `Unknown or unpermitted field in request body: "${key}".`,
          });
        }
      }

      const {
        type,
        question,
        answer,
        explanation,
        difficulty,
        status,
        topic,
        options,
        correctOptionIndex,
      } = req.body;

      if (type === undefined) {
        return res.status(400).json({
          error: 'BadRequest',
          message: 'Field "type" is required.',
        });
      }

      if (question === undefined) {
        return res.status(400).json({
          error: 'BadRequest',
          message: 'Field "question" is required.',
        });
      }

      try {
        const created = await questionRepository.createQuestion({
          userId: req.user.id,
          type,
          question,
          answer,
          explanation,
          topic,
          difficulty,
          status,
          options,
          correctOptionIndex,
        });

        return res.status(201).json(created);
      } catch (validationErr) {
        return res.status(validationErr.status || 400).json({
          error: 'BadRequest',
          message: validationErr.message,
        });
      }
    } catch (err) {
      return next(err);
    }
  });

  /**
   * GET /api/questions/:id
   * Retrieves an owned, active question.
   */
  router.get('/:id', async (req, res, next) => {
    try {
      const { id } = req.params;

      if (!isValidUuid(id)) {
        return res.status(400).json({
          error: 'BadRequest',
          message: 'Invalid question ID format.',
        });
      }

      const question = await questionRepository.findQuestionByIdAndUserId({
        id,
        userId: req.user.id,
      });

      if (!question) {
        return res.status(404).json({
          error: 'NotFound',
          message: 'Question not found.',
        });
      }

      return res.status(200).json(question);
    } catch (err) {
      return next(err);
    }
  });

  /**
   * PATCH /api/questions/:id
   * Updates an owned, active question.
   */
  router.patch('/:id', requireCsrf, async (req, res, next) => {
    try {
      const { id } = req.params;

      if (!isValidUuid(id)) {
        return res.status(400).json({
          error: 'BadRequest',
          message: 'Invalid question ID format.',
        });
      }

      if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
        return res.status(400).json({
          error: 'BadRequest',
          message: 'Request body must be a JSON object.',
        });
      }

      const allowedKeys = new Set([
        'type',
        'question',
        'answer',
        'explanation',
        'difficulty',
        'status',
        'topic',
        'options',
        'correctOptionIndex',
      ]);

      const bodyKeys = Object.keys(req.body);
      if (bodyKeys.length === 0) {
        return res.status(400).json({
          error: 'BadRequest',
          message: 'Request body must not be empty.',
        });
      }

      for (const key of bodyKeys) {
        if (!allowedKeys.has(key)) {
          return res.status(400).json({
            error: 'BadRequest',
            message: `Unknown or unpermitted field in request body: "${key}".`,
          });
        }
      }

      const {
        type,
        question,
        answer,
        explanation,
        difficulty,
        status,
        topic,
        options,
        correctOptionIndex,
      } = req.body;

      try {
        const result = await questionRepository.updateQuestion({
          id,
          userId: req.user.id,
          type,
          question,
          answer,
          explanation,
          difficulty,
          status,
          topic,
          options,
          correctOptionIndex,
        });

        if (result.notFound) {
          return res.status(404).json({
            error: 'NotFound',
            message: 'Question not found.',
          });
        }

        return res.status(200).json(result.question);
      } catch (validationErr) {
        return res.status(validationErr.status || 400).json({
          error: 'BadRequest',
          message: validationErr.message,
        });
      }
    } catch (err) {
      return next(err);
    }
  });

  /**
   * POST /api/questions/:id/practice
   * Records a practice event for an owned question.
   */
  router.post('/:id/practice', requireCsrf, async (req, res, next) => {
    try {
      const { id } = req.params;

      if (!isValidUuid(id)) {
        return res.status(400).json({
          error: 'BadRequest',
          message: 'Invalid question ID format.',
        });
      }

      let result = null;
      if (req.body && typeof req.body === 'object' && !Array.isArray(req.body)) {
        if (req.body.result !== undefined) {
          result = req.body.result;
        }
      }

      try {
        const outcome = await questionRepository.recordPractice({
          id,
          userId: req.user.id,
          result,
        });

        if (outcome.notFound) {
          return res.status(404).json({
            error: 'NotFound',
            message: 'Question not found.',
          });
        }

        return res.status(200).json(outcome.question);
      } catch (validationErr) {
        return res.status(validationErr.status || 400).json({
          error: 'BadRequest',
          message: validationErr.message,
        });
      }
    } catch (err) {
      return next(err);
    }
  });

  /**
   * PATCH /api/questions/:id/status
   * Updates the mastery status of an owned question.
   */
  router.patch('/:id/status', requireCsrf, async (req, res, next) => {
    try {
      const { id } = req.params;

      if (!isValidUuid(id)) {
        return res.status(400).json({
          error: 'BadRequest',
          message: 'Invalid question ID format.',
        });
      }

      if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
        return res.status(400).json({
          error: 'BadRequest',
          message: 'Request body must be a JSON object.',
        });
      }

      const { status } = req.body;
      if (status === undefined) {
        return res.status(400).json({
          error: 'BadRequest',
          message: 'Field "status" is required.',
        });
      }

      for (const key of Object.keys(req.body)) {
        if (key !== 'status') {
          return res.status(400).json({
            error: 'BadRequest',
            message: `Unknown or unpermitted field in request body: "${key}".`,
          });
        }
      }

      try {
        const outcome = await questionRepository.updateQuestionStatus({
          id,
          userId: req.user.id,
          status,
        });

        if (outcome.notFound) {
          return res.status(404).json({
            error: 'NotFound',
            message: 'Question not found.',
          });
        }

        return res.status(200).json(outcome.question);
      } catch (validationErr) {
        return res.status(validationErr.status || 400).json({
          error: 'BadRequest',
          message: validationErr.message,
        });
      }
    } catch (err) {
      return next(err);
    }
  });

  /**
   * DELETE /api/questions/:id
   * Soft-deletes an owned question.
   */
  router.delete('/:id', requireCsrf, async (req, res, next) => {
    try {
      const { id } = req.params;

      if (!isValidUuid(id)) {
        return res.status(400).json({
          error: 'BadRequest',
          message: 'Invalid question ID format.',
        });
      }

      const result = await questionRepository.softDeleteQuestion({
        id,
        userId: req.user.id,
      });

      if (result.notFound) {
        return res.status(404).json({
          error: 'NotFound',
          message: 'Question not found.',
        });
      }

      return res.status(204).send();
    } catch (err) {
      return next(err);
    }
  });

  return router;
}

export const questionsRoutes = createQuestionsRouter();
export default questionsRoutes;

