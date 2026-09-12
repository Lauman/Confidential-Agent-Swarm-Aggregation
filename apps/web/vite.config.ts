import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Bundle confidential-core from source so tree-shaking drops the
    // Node-only modules (fs-backed keymap) the browser never touches.
    alias: {
      '@private-signal-swarm/confidential-core': path.resolve(
        rootDir,
        '../../packages/confidential-core/src/index.ts'
      ),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api/coordinator': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/coordinator/, ''),
      },
      '/api/resource': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/resource/, ''),
      },
    },
  },
});
