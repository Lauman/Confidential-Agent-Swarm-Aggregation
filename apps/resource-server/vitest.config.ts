import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    include: ['../../tests/resource-server/**/*.test.ts'],
    globals: true,
  },
  resolve: {
    alias: {
      '@private-signal-swarm/types': path.resolve(__dirname, '../../packages/types/src'),
    },
  },
});