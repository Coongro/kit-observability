import * as path from 'node:path';
import { defineConfig } from 'vitest/config';

/**
 * Config para tests de integración — requiere Postgres corriendo (provisto
 * por `pnpm coongro start` localmente, o por el service de Postgres en CI).
 *
 * Connection string: env `OBSERVABILITY_TEST_DB_URL` (sin default a la dev DB
 * para evitar borrar el schema observability del usuario sin querer).
 */
export default defineConfig({
  // Backend-only — desactivar CSS para no requerir autoprefixer en CI.
  css: false,
  resolve: {
    // Vitest no lee tsconfig paths automáticamente — hay que mapear los
    // workspace packages a sus dist builds para que los integration tests
    // los puedan resolver via bare imports.
    alias: {
      '@coongro/core-logging': path.resolve(__dirname, '../../packages/core-logging/dist/index.js'),
      '@coongro/database-core': path.resolve(__dirname, '../../packages/database-core/dist/index.js'),
      '@coongro/module-core/types/index.js': path.resolve(
        __dirname,
        '../../packages/module-core/dist/types/index.js'
      ),
      '@coongro/module-core': path.resolve(__dirname, '../../packages/module-core/dist/index.js'),
    },
  },
  test: {
    include: ['src/**/*.integration.test.ts'],
    environment: 'node',
    globals: false,
    testTimeout: 30000,
    hookTimeout: 30000,
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true, // tests integración tocan DB compartida — serializar
      },
    },
  },
});
