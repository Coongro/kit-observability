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
 * select). El DDL real vive en `bootstrap/ddl.ts`. Si hay drift entre
 * schema/ y ddl.ts, los tests de integración del bootstrap lo detectan
 * (verifican que las columnas/tipos del CREATE TABLE coincidan con los
 * inferidos por Drizzle).
 */

export { observabilitySchema, OBSERVABILITY_SCHEMA_NAME } from './observability-schema.js';
export {
  logEntries,
  type LogEntryRow,
  type NewLogEntryRow,
  LOG_ENTRIES_TABLE,
} from './log-entries.js';
export {
  logSpans,
  type LogSpanRow,
  type NewLogSpanRow,
  LOG_SPANS_TABLE,
} from './log-spans.js';
export {
  logIssues,
  type LogIssueRow,
  type NewLogIssueRow,
  LOG_ISSUES_TABLE,
  ISSUE_STATUS,
  type IssueStatus,
} from './log-issues.js';
