# @coongro/kit-observability

## 0.7.0

### Minor Changes

- bf76ad6: feat: master kill-switch `OBSERVABILITY_DISABLED=1` para apagar el plugin entero por env var

  Cuando `OBSERVABILITY_DISABLED=1`, `activate()` retorna temprano y el plugin no registra nada que toque la DB (bootstrap, DBSink/SpanSink, audit recorder); los crons `maintenance`/`retention` quedan no-op limpio. Palanca operacional reset-proof y 100% por variable de entorno contra el drenaje de compute de la DB (no necesita la DB arriba ni toggle por-tenant). Sin la var, comportamiento normal (COONG-226).

## 0.6.0

### Minor Changes

- 498d004: feat(COONG-202): DBSink persiste solo WARN+ por default (observability cost-aware)

  El DBSink se creaba sin `minLevel` → default DEBUG → persistía TODO a
  `log_entries`, incluidos los ~93% de spans INFO del otel-bridge (un log por cada
  middleware/handler/query). Medido: ~12 filas a la DB por request, millones de
  filas y varios GB de ruido.

  Ahora `minLevel` es configurable vía `OBSERVABILITY_DB_MIN_LEVEL` (default
  **WARN**). Con WARN, core-logging filtra INFO/DEBUG antes del sink y solo se
  persisten spans escalados a WARN por duración (requests lentos) + warnings +
  errores — la señal real del dashboard. Bajable a `info`/`debug` para debugging.

  Verificado en vivo: 50 requests normales pasaron de +619 filas a **+0**, mientras
  los errores se siguen persistiendo. La auditoría no se ve afectada (va por
  `audit_events`). Cambio de comportamiento por default (de DEBUG a WARN) → minor.

### Patch Changes

- ab676df: fix(COONG-204): la retención de particiones usa el máximo de los thresholds, no el mínimo

  `register.ts` calculaba la retención de particiones de `log_entries` con
  `Math.min(debug, warn, error)` y se la pasaba a pg_partman, que dropea la
  **partición entera** (todos los niveles de ese día). Con `DEBUG=2/WARN=14/ERROR=30`
  eso dropeaba las particiones a los 2 días, **borrando los ERROR que debían vivir 30**.

  Ahora usa `Math.max`: pg_partman sólo dropea cuando expiró el nivel que más tiempo
  se conserva, y el DELETE fino de `retention.ts` hace la limpieza por-nivel dentro de
  las particiones vivas. Verificado con un test de integración nuevo (un ERROR de hace
  5 días sobrevive al ciclo retention + maintenance con thresholds dispares).

- adaa442: fix(COONG-206): el alias de @coongro/\* en los vitest configs ahora es condicional

  Los configs aliaseaban `@coongro/core-logging` (y los demás `@coongro/*`) al dist
  del monorepo (`../../packages/...`). En el repo standalone del plugin —como corre
  el CI— ese path no existe y `config.test.ts` rompía con `ERR_MODULE_NOT_FOUND`.
  Como `release.yml` commitea el bump con husky activo, el pre-commit corría los
  tests en CI, fallaban, y el release no versionaba ni publicaba.

  Ahora el alias solo se aplica si el path del monorepo existe (`existsSync`); en
  standalone se resuelve desde node_modules (instalado desde Verdaccio). Aplicado a
  vitest.config.ts y vitest.integration.config.ts.

## 0.5.0

### Minor Changes

- e7c3f3b: Frontend redesign + audit-view UX (COONG-118 + COONG-146 plugin side):
  - Schema v3: audit_events.request_id column for cross-table correlation
    with log_entries.request_id and log_spans.trace_id. Migration v2→v3
    idempotent.
  - AuditLog.record/query thread requestId through; /audit endpoint accepts
    ?request_id= filter.
  - activate() registers AuditLog as the global audit recorder via
    setAuditRecorder() — apps/api can call recordAudit() without a hard
    dependency on this plugin.
  - Stream / Issues / Trace views ported with shared component foundation
    (PageHeader, ResultsBar, StickyTh, FilterChip variants, dropdowns,
    cross-view navigation helpers).
  - Audit view UX: target column wraps multi-line (no truncation),
    meta column +N is now an interactive expand/collapse, action chip
    colors classified by verb substring (covers tenant.created,
    plugin.installed, cron.handler_failed, etc.), target chip colors by
    the verb embedded in entityId (calendar.events.create → green), tenant
    column shows resolved tenant name, actor cell shows tenant name as
    context, hover icons cross-link to Stream and Trace by request_id
    (Trace button only visible when requestId is OTel hex format).

## 0.4.0

### Minor Changes

- 9a34149: Audit API: nueva clase `AuditLog` con `record(entry)` (fire-and-forget con error logging) y `query(filters)` (filtros multidimensionales por tenant/actor/action/entity/fechas/limit). Tabla `audit_events` propia (no particionada, retención indefinida) con bootstrap migration v1→v2 idempotente. Endpoint `GET /audit` con validación estricta de fechas. `patchIssueStatus` registra eventos audit automáticamente. Documentación completa de la divergencia con el spec original (audit_events vs log_entries con category/immutable) en Plugin-Kit-Observability.html.

## 0.3.0

### Minor Changes

- 8a59993: Add retention cron that deletes old log entries by level bucket (debug/info, warn, error/fatal) and old spans, with per-level configurable thresholds via env vars.

## 0.2.0

### Minor Changes

- de74607: feat(COONG-139): MVP backend del plugin de observability — `runtime: 'eager'` + bootstrap idempotente del schema `observability` + 3 tablas (`log_entries` y `log_spans` particionadas por día via pg_partman, `log_issues` agregada por fingerprint), `SinkBase<T>` con buffer/batch/flush-sync/fail-safe/health, fingerprinting estilo Sentry con normalización (UUIDs/IPs/hex/números), aggregator atómico via `INSERT ... ON CONFLICT`, `DBSink` registrado en el registry global de `@coongro/core-logging`, scheduledTask `maintenance` cada hora corriendo `partman.run_maintenance_proc()`, y mini-tracker `schema_version` listo para evoluciones futuras del schema.
