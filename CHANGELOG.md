# @coongro/kit-observability

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
