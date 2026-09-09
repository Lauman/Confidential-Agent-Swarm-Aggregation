import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['../../tests/cre/**/*.test.ts'],
    globals: true,
  },
});