import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/e2e/**/*.test.ts'],
    globals: true,
    hookTimeout: 60000,
    testTimeout: 60000,
  },
  resolve: {
    alias: {
      '@private-signal-swarm/types': path.resolve(__dirname, 'packages/types/src'),
      '@private-signal-swarm/confidential-core': path.resolve(
        __dirname,
        'packages/confidential-core/src'
      ),
    },
  },
});
