import { existsSync } from 'node:fs';
import * as path from 'node:path';
import { defineConfig } from 'vitest/config';

/**
 * Config para tests de integración — requiere Postgres corriendo (provisto
 * por `pnpm coongro start` localmente, o por el service de Postgres en CI).
 *
 * Connection string: env `OBSERVABILITY_TEST_DB_URL` (sin default a la dev DB
 * para evitar borrar el schema observability del usuario sin querer).
 */

/**
 * Alias de un `@coongro/*` al dist del monorepo, SOLO si ese path existe. En el
 * repo standalone (CI) el path no existe y el paquete se resuelve desde
 * node_modules (instalado desde Verdaccio). Ver COONG-206.
 */
function monorepoAlias(baseDir: string, pkg: string, relDistPath: string): Record<string, string> {
  const abs = path.resolve(baseDir, relDistPath);
  return existsSync(abs) ? { [pkg]: abs } : {};
}

export default defineConfig({
  // Override explícito de postcss para no requerir autoprefixer en CI.
  css: {
    postcss: { plugins: [] },
  },
  resolve: {
    // Vitest no lee tsconfig paths automáticamente. En el monorepo se mapean los
    // workspace packages a sus dist builds; en standalone se resuelven desde
    // node_modules (ver monorepoAlias).
    alias: {
      ...monorepoAlias(
        __dirname,
        '@coongro/core-logging',
        '../../packages/core-logging/dist/index.js'
      ),
      ...monorepoAlias(
        __dirname,
        '@coongro/database-core',
        '../../packages/database-core/dist/index.js'
      ),
      ...monorepoAlias(
        __dirname,
        '@coongro/module-core/types/index.js',
        '../../packages/module-core/dist/types/index.js'
      ),
      ...monorepoAlias(
        __dirname,
        '@coongro/module-core',
        '../../packages/module-core/dist/index.js'
      ),
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
