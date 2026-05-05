# @coongro/kit-observability

## 0.4.0

### Minor Changes

- 9a34149: Audit API: nueva clase `AuditLog` con `record(entry)` (fire-and-forget con error logging) y `query(filters)` (filtros multidimensionales por tenant/actor/action/entity/fechas/limit). Tabla `audit_events` propia (no particionada, retención indefinida) con bootstrap migration v1→v2 idempotente. Endpoint `GET /audit` con validación estricta de fechas. `patchIssueStatus` registra eventos audit automáticamente. Documentación completa de la divergencia con el spec original (audit_events vs log_entries con category/immutable) en Plugin-Kit-Observability.html.

## 0.3.0

### Minor Changes

- 8a59993: Add retention cron that deletes old log entries by level bucket (debug/info, warn, error/fatal) and old spans, with per-level configurable thresholds via env vars.

## 0.2.0

### Minor Changes

- de74607: feat(COONG-139): MVP backend del plugin de observability — `runtime: 'eager'` + bootstrap idempotente del schema `observability` + 3 tablas (`log_entries` y `log_spans` particionadas por día via pg_partman, `log_issues` agregada por fingerprint), `SinkBase<T>` con buffer/batch/flush-sync/fail-safe/health, fingerprinting estilo Sentry con normalización (UUIDs/IPs/hex/números), aggregator atómico via `INSERT ... ON CONFLICT`, `DBSink` registrado en el registry global de `@coongro/core-logging`, scheduledTask `maintenance` cada hora corriendo `partman.run_maintenance_proc()`, y mini-tracker `schema_version` listo para evoluciones futuras del schema.
