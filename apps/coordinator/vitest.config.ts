import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['../../tests/coordinator/**/*.test.ts'],
    globals: true,
  },
});