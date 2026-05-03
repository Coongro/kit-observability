import { defineConfig } from 'vitest/config';

/**
 * Config para tests unitarios — sin DB. Rápido, corre en pre-commit.
 * Tests integration (con DB) usan `vitest.integration.config.ts`.
 */
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    exclude: ['src/**/*.integration.test.ts', 'node_modules/**'],
    environment: 'node',
    globals: false,
    testTimeout: 5000,
  },
});
