import { defineConfig } from 'vitest/config';

/**
 * Config para tests unitarios — sin DB. Rápido, corre en pre-commit.
 * Tests integration (con DB) usan `vitest.integration.config.ts`.
 */
export default defineConfig({
  // Plugin es backend-only — sin CSS en src/. Desactivar CSS processing
  // evita que Vitest intente cargar postcss.config.cjs (que requiere
  // autoprefixer instalado y falla en CI donde solo están las deps mínimas).
  css: false,
  test: {
    include: ['src/**/*.test.ts'],
    exclude: ['src/**/*.integration.test.ts', 'node_modules/**'],
    environment: 'node',
    globals: false,
    testTimeout: 5000,
  },
});
