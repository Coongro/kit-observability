import { AUDIT_EVENTS_TABLE } from '../schema/audit-events.js';
import { LOG_ENTRIES_TABLE } from '../schema/log-entries.js';
import { LOG_ISSUES_TABLE } from '../schema/log-issues.js';
import { LOG_SPANS_TABLE } from '../schema/log-spans.js';
import { OBSERVABILITY_SCHEMA_NAME } from '../schema/observability-schema.js';

/**
 * DDL idempotente del plugin. Generado como strings constantes para testabilidad
 * (los tests pueden snapshottear cada statement) y para que el orden de ejecución
 * quede explícito en `run-bootstrap.ts`.
 *
 * NO usar template strings con interpolación de input externo — todos los nombres
 * son constantes del propio plugin (sin riesgo de SQL injection), pero igual se
 * componen vía constantes para mantener un único punto de cambio.
 */

const SCHEMA = OBSERVABILITY_SCHEMA_NAME;

export const CREATE_SCHEMA_SQL = `CREATE SCHEMA IF NOT EXISTS "${SCHEMA}"`;

/**
 * pgcrypto provee `gen_random_uuid()`. Idempotente — si ya está, no-op.
 * Necesario para los DEFAULTs de las columnas `id`.
 */
export const ENSURE_PGCRYPTO_SQL = `CREATE EXTENSION IF NOT EXISTS pgcrypto`;

export const CREATE_LOG_ENTRIES_SQL = `
CREATE TABLE IF NOT EXISTS "${SCHEMA}"."${LOG_ENTRIES_TABLE}" (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  timestamp timestamptz NOT NULL,
  tenant_id uuid,
  request_id text,
  level integer NOT NULL,
  source text NOT NULL,
  message text NOT NULL,
  context jsonb,
  metadata jsonb,
  error jsonb,
  call_site jsonb,
  fingerprint text,
  PRIMARY KEY (id, timestamp)
) PARTITION BY RANGE (timestamp)
`.trim();

export const CREATE_LOG_ENTRIES_INDEXES_SQL = [
  `CREATE INDEX IF NOT EXISTS idx_log_entries_ts_level_source ON "${SCHEMA}"."${LOG_ENTRIES_TABLE}" (timestamp, level, source)`,
  `CREATE INDEX IF NOT EXISTS idx_log_entries_tenant_ts ON "${SCHEMA}"."${LOG_ENTRIES_TABLE}" (tenant_id, timestamp)`,
  `CREATE INDEX IF NOT EXISTS idx_log_entries_fingerprint_ts ON "${SCHEMA}"."${LOG_ENTRIES_TABLE}" (fingerprint, timestamp)`,
];

export const CREATE_LOG_SPANS_SQL = `
CREATE TABLE IF NOT EXISTS "${SCHEMA}"."${LOG_SPANS_TABLE}" (
  span_id text NOT NULL,
  trace_id text NOT NULL,
  parent_span_id text,
  name text NOT NULL,
  kind text,
  start_time timestamptz NOT NULL,
  end_time timestamptz,
  duration_ns bigint,
  status_code integer,
  status_message text,
  service_name text,
  tenant_id text,
  request_id text,
  attributes jsonb,
  resource jsonb,
  events jsonb,
  PRIMARY KEY (span_id, start_time)
) PARTITION BY RANGE (start_time)
`.trim();

export const CREATE_LOG_SPANS_INDEXES_SQL = [
  `CREATE INDEX IF NOT EXISTS idx_log_spans_trace_start ON "${SCHEMA}"."${LOG_SPANS_TABLE}" (trace_id, start_time)`,
  `CREATE INDEX IF NOT EXISTS idx_log_spans_tenant_start ON "${SCHEMA}"."${LOG_SPANS_TABLE}" (tenant_id, start_time)`,
  `CREATE INDEX IF NOT EXISTS idx_log_spans_service_start ON "${SCHEMA}"."${LOG_SPANS_TABLE}" (service_name, start_time)`,
];

export const CREATE_LOG_ISSUES_SQL = `
CREATE TABLE IF NOT EXISTS "${SCHEMA}"."${LOG_ISSUES_TABLE}" (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  fingerprint text NOT NULL UNIQUE,
  tenant_id uuid,
  level integer NOT NULL,
  source text NOT NULL,
  sample_message text NOT NULL,
  sample_top_frame text,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  occurrence_count bigint NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'open'
)
`.trim();

export const CREATE_LOG_ISSUES_INDEXES_SQL = [
  `CREATE INDEX IF NOT EXISTS idx_log_issues_last_seen ON "${SCHEMA}"."${LOG_ISSUES_TABLE}" (last_seen_at)`,
  `CREATE INDEX IF NOT EXISTS idx_log_issues_tenant_last_seen ON "${SCHEMA}"."${LOG_ISSUES_TABLE}" (tenant_id, last_seen_at)`,
  `CREATE INDEX IF NOT EXISTS idx_log_issues_status_last_seen ON "${SCHEMA}"."${LOG_ISSUES_TABLE}" (status, last_seen_at)`,
];

export const CREATE_AUDIT_EVENTS_SQL = `
CREATE TABLE IF NOT EXISTS "${SCHEMA}"."${AUDIT_EVENTS_TABLE}" (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  timestamp timestamptz NOT NULL DEFAULT now(),
  tenant_id uuid,
  actor_id uuid,
  action text NOT NULL,
  entity_type text,
  entity_id text,
  metadata jsonb,
  request_id text
)
`.trim();

export const CREATE_AUDIT_EVENTS_INDEXES_SQL = [
  `CREATE INDEX IF NOT EXISTS idx_audit_events_ts ON "${SCHEMA}"."${AUDIT_EVENTS_TABLE}" (timestamp)`,
  `CREATE INDEX IF NOT EXISTS idx_audit_events_tenant_ts ON "${SCHEMA}"."${AUDIT_EVENTS_TABLE}" (tenant_id, timestamp)`,
  `CREATE INDEX IF NOT EXISTS idx_audit_events_request_id ON "${SCHEMA}"."${AUDIT_EVENTS_TABLE}" (request_id)`,
];

// Migración v2→v3: agrega request_id a audit_events. Idempotente vía IF NOT
// EXISTS — schemas creados en v3+ ya tienen la columna desde el CREATE TABLE
// de arriba, así que el ALTER es no-op para deploys nuevos.
export const ADD_AUDIT_EVENTS_REQUEST_ID_SQL = `
ALTER TABLE "${SCHEMA}"."${AUDIT_EVENTS_TABLE}"
  ADD COLUMN IF NOT EXISTS request_id text
`.trim();

export const ADD_AUDIT_EVENTS_REQUEST_ID_INDEX_SQL = `CREATE INDEX IF NOT EXISTS idx_audit_events_request_id ON "${SCHEMA}"."${AUDIT_EVENTS_TABLE}" (request_id)`;
