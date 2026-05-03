import { defineConfig } from 'vitest/config';

/**
 * Config para tests unitarios — sin DB. Rápido, corre en pre-commit.
 * Tests integration (con DB) usan `vitest.integration.config.ts`.
 */
export default defineConfig({
  // Plugin es backend-only. Override explícito de postcss con plugins vacíos
  // para que Vite NO intente cargar `postcss.config.cjs` (que requiere
  // autoprefixer, no instalado en CI). `css: false` no alcanza porque Vite
  // resuelve PostCSS antes de aplicar la flag de css.
  css: {
    postcss: { plugins: [] },
  },
  test: {
    include: ['src/**/*.test.ts'],
    exclude: ['src/**/*.integration.test.ts', 'node_modules/**'],
    environment: 'node',
    globals: false,
    testTimeout: 5000,
  },
});
