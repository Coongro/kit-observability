import path from 'node:path';
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
  // Aliaseamos `@coongro/plugin-sdk` a un stub de runtime. Los views (.tsx)
  // lo importan para `getHostReact()`/`usePlugin()` — en tests unitarios no
  // ejecutamos esos componentes, pero Vite igual transforma el archivo
  // contenedor cuando los tests tocan código del mismo dir, y sin alias
  // tira `Failed to load url @coongro/plugin-sdk`. El stub es minúsculo y
  // no afecta integration tests (que usan otro config).
  resolve: {
    alias: {
      '@coongro/plugin-sdk': path.resolve(__dirname, 'src/test-utils/plugin-sdk.stub.ts'),
      // `config.ts` importa `LogLevel` de core-logging (peerDep resuelta por el
      // host en runtime). En tests unitarios standalone hay que aliasear al dist
      // del monorepo — mismo patrón que vitest.integration.config.ts.
      '@coongro/core-logging': path.resolve(__dirname, '../../packages/core-logging/dist/index.js'),
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
