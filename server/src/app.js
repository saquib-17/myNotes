import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import session from 'express-session';
import healthRoutes from './routes/health.routes.js';
import readyRoutes, { createReadyRouter } from './routes/ready.routes.js';
import authRoutes from './routes/auth.routes.js';
import { getSessionOptions } from './config/session.config.js';
import { getSessionStore } from './auth/sessionStore.js';

// Load environment variables from .env file if present
dotenv.config();

let defaultSessionMiddleware = null;

function getDefaultSessionMiddleware() {
  if (!defaultSessionMiddleware) {
    const store = getSessionStore();
    const sessionOptions = getSessionOptions({ store });
    defaultSessionMiddleware = session(sessionOptions);
  }
  return defaultSessionMiddleware;
}

/**
 * Creates and configures the Express application.
 * Accepts optional dependencies for test isolation.
 *
 * @param {object} [options]
 * @param {() => Promise<boolean>} [options.checkReadiness] - Injected database readiness checker
 * @param {import('express').RequestHandler} [options.sessionMiddleware] - Custom or in-memory session middleware
 * @param {import('express').Router} [options.authRouter] - Injected authentication router
 * @returns {express.Express}
 */
export function createApp({
  checkReadiness,
  sessionMiddleware,
  authRouter,
} = {}) {
  const app = express();

  // Security: Restrict CORS to known client origins rather than permissive wildcards
  const allowedOrigin = process.env.CLIENT_ORIGIN || 'http://localhost:5173';
  app.use(cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (such as same-origin proxy, curl, or mobile apps)
      if (!origin || origin === allowedOrigin) {
        callback(null, true);
      } else {
        const corsError = new Error('Blocked by CORS policy');
        corsError.name = 'Forbidden';
        corsError.status = 403;
        callback(corsError);
      }
    },
    credentials: true,
  }));

  // Request parsing with sensible payload limit
  app.use(express.json({ limit: '100kb' }));

  // Process Health and Database Readiness Endpoints
  // Mounted BEFORE session middleware so health checks never instantiate sessions or cookies
  app.use('/api/health', healthRoutes);
  app.use(
    '/api/ready',
    checkReadiness ? createReadyRouter({ checkReadiness }) : readyRoutes
  );

  // Authentication routes with scoped session middleware
  const resolvedSessionMiddleware =
    sessionMiddleware !== undefined
      ? sessionMiddleware
      : (req, res, next) => getDefaultSessionMiddleware()(req, res, next);

  if (resolvedSessionMiddleware) {
    app.use('/api/auth', resolvedSessionMiddleware, authRouter || authRoutes);
  } else {
    app.use('/api/auth', authRouter || authRoutes);
  }

  // Fallback for unknown API routes - returns structured JSON 404
  app.all('/api/*', (req, res) => {
    res.status(404).json({
      error: 'Not Found',
      message: `API endpoint '${req.method} ${req.originalUrl}' not found`,
    });
  });

  // Centralized error-handling middleware
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    const isProduction = process.env.NODE_ENV === 'production';
    const statusCode = err.status || err.statusCode || 500;

    // Log on server for diagnostics (suppress during automated test runs)
    if (process.env.NODE_ENV !== 'test') {
      console.error(`[Server Error] ${err.name || 'Error'}: ${err.message}`);
    }

    res.status(statusCode).json({
      error: err.name || 'InternalServerError',
      message: isProduction && statusCode === 500
        ? 'An unexpected error occurred on the server.'
        : err.message || 'Internal Server Error',
      ...(isProduction ? {} : { stack: err.stack }),
    });
  });

  return app;
}

const defaultApp = createApp();
export default defaultApp;
