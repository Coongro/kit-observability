import { existsSync } from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vitest/config';

/**
 * Config para tests unitarios — sin DB. Rápido, corre en pre-commit.
 * Tests integration (con DB) usan `vitest.integration.config.ts`.
 */

/**
 * Alias de un `@coongro/*` al dist del monorepo, SOLO si ese path existe.
 *
 * En el monorepo los packages viven en `packages/` (no en node_modules del
 * plugin, que usa symlinks de Docker), así que el test necesita el alias. Pero
 * en el repo STANDALONE del plugin (como corre el CI) ese path no existe y el
 * paquete se instala desde Verdaccio a node_modules — ahí el alias debe
 * desaparecer para que la resolución normal funcione. Sin esto, el alias rompía
 * los tests en el CI del plugin y bloqueaba el release (COONG-206).
 */
function monorepoAlias(baseDir: string, pkg: string, relDistPath: string): Record<string, string> {
  const abs = path.resolve(baseDir, relDistPath);
  return existsSync(abs) ? { [pkg]: abs } : {};
}
export default defineConfig({
  // Plugin es backend-only. Override explícito de postcss con plugins vacíos
  // para que Vite NO intente cargar `postcss.config.cjs` (que requiere
  // autoprefixer, no instalado en CI). `css: false` no alcanza porque Vite
  // resuelve PostCSS antes de aplicar la flag de css.
  css: {
    postcss: { plugins: [] },
  },
  // Aliaseamos `@coongro/plugin-sdk` a un stub de runtime. Los views (.tsx)
  // lo importan para `getHostReact()`/`usePlugin()` — en tests unitarios no
  // ejecutamos esos componentes, pero Vite igual transforma el archivo
  // contenedor cuando los tests tocan código del mismo dir, y sin alias
  // tira `Failed to load url @coongro/plugin-sdk`. El stub es minúsculo y
  // no afecta integration tests (que usan otro config).
  resolve: {
    alias: {
      '@coongro/plugin-sdk': path.resolve(__dirname, 'src/test-utils/plugin-sdk.stub.ts'),
      // `config.ts` importa `LogLevel` de core-logging. En el monorepo se aliasea
      // al dist; en el repo standalone se resuelve desde node_modules (ver
      // monorepoAlias).
      ...monorepoAlias(
        __dirname,
        '@coongro/core-logging',
        '../../packages/core-logging/dist/index.js'
      ),
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
    exclude: ['src/**/*.integration.test.ts', 'node_modules/**'],
    environment: 'node',
    globals: false,
    testTimeout: 5000,
  },
});
