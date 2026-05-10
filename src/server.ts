/**
 * @coongro/kit-observability — Entry point del runtime del plugin.
 *
 * El plugin loader del API importa este archivo (configurado via
 * `manifest.entry = "./dist/server.js"`) y busca los exports `activate` y
 * `deactivate`.
 *
 * Mantener este archivo MINIMAL — solo re-exports. La lógica vive en
 * `runtime/activate.ts` y `runtime/deactivate.ts` para que sean testeables
 * sin pasar por el entry point.
 *
 * Re-exports server-only adicionales (schemas, tipos de rows) van acá para
 * que herramientas de scripting (ej: jobs de migración data) los puedan
 * importar via `@coongro/kit-observability/server`.
 */

export { activate } from './runtime/activate.js';
export { deactivate } from './runtime/deactivate.js';

export {
  observabilitySchema,
  OBSERVABILITY_SCHEMA_NAME,
  logEntries,
  logSpans,
  logIssues,
  auditEvents,
  type LogEntryRow,
  type NewLogEntryRow,
  type LogSpanRow,
  type NewLogSpanRow,
  type LogIssueRow,
  type NewLogIssueRow,
  type IssueStatus,
  ISSUE_STATUS,
  type AuditEventRow,
  type NewAuditEventRow,
  AUDIT_EVENTS_TABLE,
} from './schema/index.js';
export { AuditLog, type AuditEventInput, type AuditEventQuery } from './audit/index.js';
