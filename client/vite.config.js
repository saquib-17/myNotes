import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Load environment variables prefixed with VITE_
  const env = loadEnv(mode, process.cwd(), '');
  const port = parseInt(env.VITE_PORT, 10) || 5173;
  const proxyTarget = env.VITE_API_PROXY_TARGET || 'http://localhost:3000';

  return {
    plugins: [
      react(),
      tailwindcss(),
    ],
    server: {
      port,
      // Report port conflicts explicitly instead of silently selecting an arbitrary alternative port
      strictPort: true,
      proxy: {
        // Forward /api requests to the Node.js Express backend during development
        '/api': {
          target: proxyTarget,
          changeOrigin: true,
          secure: false,
        },
      },
    },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./src/test/setup.js'],
    },
  };
});

