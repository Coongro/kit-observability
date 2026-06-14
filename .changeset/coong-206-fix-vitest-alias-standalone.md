---
'@coongro/kit-observability': patch
---

fix(COONG-206): el alias de @coongro/* en los vitest configs ahora es condicional

Los configs aliaseaban `@coongro/core-logging` (y los demás `@coongro/*`) al dist
del monorepo (`../../packages/...`). En el repo standalone del plugin —como corre
el CI— ese path no existe y `config.test.ts` rompía con `ERR_MODULE_NOT_FOUND`.
Como `release.yml` commitea el bump con husky activo, el pre-commit corría los
tests en CI, fallaban, y el release no versionaba ni publicaba.

Ahora el alias solo se aplica si el path del monorepo existe (`existsSync`); en
standalone se resuelve desde node_modules (instalado desde Verdaccio). Aplicado a
vitest.config.ts y vitest.integration.config.ts.
