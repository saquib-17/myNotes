import app from './app.js';
import { closePool } from './db/pool.js';
import { closeSessionStore } from './auth/sessionStore.js';

const PORT = parseInt(process.env.PORT, 10) || 3000;

const server = app.listen(PORT, () => {
  console.log(`[MyNotes API] Server listening on http://localhost:${PORT}`);
  console.log(`[MyNotes API] Health check available at http://localhost:${PORT}/api/health`);
  console.log(`[MyNotes API] Readiness check available at http://localhost:${PORT}/api/ready`);
});

// Appropriate startup and runtime error handling (e.g. port conflicts)
server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`[MyNotes API Startup Error] Port ${PORT} is already in use by another process.`);
    console.error('Please stop the conflicting process or specify a different port via the PORT environment variable.');
    process.exit(1);
  } else {
    console.error('[MyNotes API Startup Error]', error);
    process.exit(1);
  }
});

// Graceful shutdown handling
let isShuttingDown = false;
const handleShutdown = async (signal) => {
  if (isShuttingDown) {
    return;
  }
  isShuttingDown = true;
  console.log(`\n[MyNotes API] Received ${signal}. Closing HTTP server...`);

  server.close(async (err) => {
    if (err) {
      console.error('[MyNotes API] Error while closing HTTP server:', err.message);
    } else {
      console.log('[MyNotes API] HTTP server closed cleanly.');
    }

    try {
      await closeSessionStore();
      await closePool();
    } catch (poolErr) {
      console.error('[MyNotes API] Error during shutdown cleanup:', poolErr.message);
    }

    process.exit(err ? 1 : 0);
  });

  // Force exit if graceful shutdown takes longer than 10 seconds
  setTimeout(() => {
    console.error('[MyNotes API] Graceful shutdown timed out. Forcing exit.');
    process.exit(1);
  }, 10000).unref();
};

process.on('SIGINT', () => handleShutdown('SIGINT'));
process.on('SIGTERM', () => handleShutdown('SIGTERM'));
