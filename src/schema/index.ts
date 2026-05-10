/**
 * Schemas Drizzle del plugin kit-observability.
 *
 * Por qué TODO el DDL va por raw SQL en activate() en vez de drizzle-kit + el
 * migration runner de Coongro:
 *
 *   El migration runner del core es tenant-aware: aplica cada migración con
 *   `search_path` al schema del tenant (`tenant_<uuid>`). Pero el schema
 *   `observability` de este plugin es GLOBAL (cross-tenant) — no encaja en
 *   ese modelo. Hoy NO existe infraestructura en Coongro para "migraciones
 *   de plugin a schema global", entonces este plugin la reinventa mínima
 *   acá: raw SQL idempotente + tabla propia `observability.schema_version`
 *   para tracking de versión (ver `bootstrap/schema-version.ts`).
 *
 *   Drizzle tampoco soporta `PARTITION BY` en su DSL, lo que dejaría las
 *   tablas particionadas afuera del migration runner igual.
 *
 * Estas definiciones sirven SOLO para queries Drizzle con tipos (insert,
 * select). El DDL real vive en `bootstrap/ddl.ts`. Drifts groseros (columna
 * faltante, tipo incompatible) los detecta el round-trip insert/select de
 * los integration tests; drifts sutiles (nullability, defaults) hoy NO se
 * detectan automáticamente — un seguimiento posible es snapshot de
 * `pg_attribute` vs Drizzle inference.
 */

export { observabilitySchema, OBSERVABILITY_SCHEMA_NAME } from './observability-schema.js';
export {
  logEntries,
  type LogEntryRow,
  type NewLogEntryRow,
  LOG_ENTRIES_TABLE,
} from './log-entries.js';
export { logSpans, type LogSpanRow, type NewLogSpanRow, LOG_SPANS_TABLE } from './log-spans.js';
export {
  logIssues,
  type LogIssueRow,
  type NewLogIssueRow,
  LOG_ISSUES_TABLE,
  ISSUE_STATUS,
  type IssueStatus,
} from './log-issues.js';
export {
  auditEvents,
  type AuditEventRow,
  type NewAuditEventRow,
  AUDIT_EVENTS_TABLE,
} from './audit-events.js';
