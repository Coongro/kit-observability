// Wire types — la forma JSON exacta que el plugin emite vía HTTP, después
// de que Express serializa los tipos del backend (Date → string ISO,
// bigint → string para evitar pérdida de precisión).
//
// Tanto los views (frontend) como los handlers de los endpoints (backend)
// importan estos tipos para que el contrato HTTP esté declarado en un solo
// lugar. Cualquier cambio acá fuerza ajustes en ambos lados → drift visible
// en lugar de silencioso.
//
// Convención: si un campo nuevo se agrega al backend pero NO debe cruzar la
// frontera HTTP (ej: timestamps internos, IDs sensibles), no se agrega acá
// y el handler debe sanitizar antes de devolver.
//
// CASING DRIFT (intencional):
//   - La mayoría de los wire types usan `snake_case` porque vienen de raw
//     SQL (`raw.unsafe<>(...)`) que devuelve los nombres de columna tal
//     cual: `tenant_id`, `request_id`, `sample_message`, etc.
//   - `WireAuditEvent` usa `camelCase` (`tenantId`, `actorId`, `entityType`)
//     porque su query usa Drizzle ORM que aplica el mapping `tenant_id` →
//     `tenantId` automáticamente. NO se normalizó al resto para evitar un
//     transform manual extra en el endpoint y porque el endpoint de audit
//     es legacy (predates el resto de los endpoints).
//   - `WireSinkHealth` / `WirePluginHealth` usan `camelCase` porque NO vienen
//     de SQL: son objetos in-memory de las clases SinkBase serializados al
//     vuelo. No hay columna que mapear, los nombres son los del campo TS.
//   - Si en algún momento se normaliza todo a snake_case, hay que revisar
//     `endpoints/audit-query.ts`, `views/audit/`, `services/health.service.ts`
//     y `views/health/` simultáneamente.

// =============================================================================
// /logs/query — listado de log_entries
// =============================================================================

export interface WireLogEntry {
  id: string;
  timestamp: string;
  tenant_id: string | null;
  request_id: string | null;
  level: number;
  source: string;
  message: string;
  context: unknown;
  metadata: unknown;
  error: unknown;
  fingerprint: string | null;
}

export interface WireQueryLogsResult {
  entries: WireLogEntry[];
  total: number;
  limit: number;
  offset: number;
}

// =============================================================================
// /logs (POST) — ingestion de errores del frontend
// =============================================================================

export interface WireIngestLogResponse {
  queued: boolean;
}

// =============================================================================
// /logs/issues (PATCH) — actualizar status de un issue
// =============================================================================

export type WireIssueStatus = 'open' | 'resolved' | 'muted';

export interface WireUpdateIssueResponse {
  updated: true;
}

// =============================================================================
// /logs/health — métricas de los sinks
// =============================================================================

export interface WireSinkHealth {
  queueLag: number;
  insertFailures: number;
  lastFlushAt: string | null;
  divertedToFailsafe: number;
  permanentlyLost: number;
  failsafeWriteErrors: number;
}

export interface WirePluginHealth {
  dbSink: WireSinkHealth;
  spanSink: WireSinkHealth;
}

// =============================================================================
// /logs/issues (GET) — listado de issues agrupados por fingerprint
// =============================================================================

export type WireIssueLevel = number;

export interface WireLogIssue {
  id: string;
  fingerprint: string;
  tenant_id: string | null;
  level: WireIssueLevel;
  source: string;
  sample_message: string;
  sample_top_frame: string | null;
  first_seen_at: string;
  last_seen_at: string;
  /** int8 serializado como string por el driver postgres. */
  occurrence_count: string;
  status: WireIssueStatus;
  /** Tenants distintos que tuvieron este issue (de log_entries). */
  affected_tenants_count: number;
  /** Sparkline de las últimas 24 horas, exactamente 24 buckets, oldest first. */
  sparkline_24h: number[];
}

export interface WireQueryIssuesResult {
  rows: WireLogIssue[];
  total: number;
  limit: number;
  offset: number;
}

// =============================================================================
// /logs/issues/detail (GET) — detalle de un issue por fingerprint
// =============================================================================

export interface WireSampleLogEntry {
  id: string;
  timestamp: string;
  tenant_id: string | null;
  request_id: string | null;
  level: number;
  source: string;
  message: string;
  context: unknown;
  metadata: unknown;
  error: unknown;
}

export interface WireAffectedTenant {
  tenant_id: string;
  count: number;
  last_seen: string;
}

export interface WireSimilarEvent {
  id: string;
  timestamp: string;
  tenant_id: string | null;
  request_id: string | null;
  level: number;
  message: string;
}

export interface WireIssueDetail {
  /** null si el fingerprint no existe en log_issues. */
  issue: WireLogIssue | null;
  /** Último log_entry para el fingerprint, fuente del stack trace + meta JSON. */
  sample: WireSampleLogEntry | null;
  /** Tenants distintos con count y último timestamp, ordenados por last_seen DESC. */
  affectedTenants: WireAffectedTenant[];
  /** Últimos N log_entries del mismo fingerprint, ordenados timestamp DESC. */
  similarEvents: WireSimilarEvent[];
}

// =============================================================================
// /audit — eventos de auditoría
// =============================================================================

export interface WireAuditEvent {
  id: string;
  timestamp: string;
  tenantId: string | null;
  actorId: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  metadata: unknown;
  /**
   * Correlation id del request HTTP que originó el audit event. Comparte
   * valor con `log_entries.request_id` para joins/filtros cross-tabla.
   * Null cuando el audit ocurrió fuera de un request HTTP (cron, boot,
   * lifecycle hooks).
   */
  requestId: string | null;
}

export interface WireQueryAuditResult {
  rows: WireAuditEvent[];
}

// =============================================================================
// /tenants — listado de tenants activos para los selectores de filtro
// =============================================================================

export interface WireTenantOption {
  id: string;
  name: string;
}

export interface WireListTenantsResult {
  rows: WireTenantOption[];
}

// =============================================================================
// /sources — sources distintos vistos en log_entries (últimos 14 días)
// =============================================================================

export interface WireSourceOption {
  /** El string exacto que aparece en `log_entries.source`. */
  source: string;
  /** Cuántos logs emitieron desde ese source en la ventana. */
  count: number;
  /** Último timestamp en que ese source emitió un log (ISO string). */
  last_seen: string;
}

export interface WireListSourcesResult {
  rows: WireSourceOption[];
}

// =============================================================================
// /traces — spans de un trace para el waterfall
// =============================================================================

export interface WireSpanRecord {
  span_id: string;
  trace_id: string;
  parent_span_id: string | null;
  name: string;
  kind: string | null;
  start_time: string;
  end_time: string | null;
  /** int8 serializado como string para preservar precisión más allá de Number.MAX_SAFE_INTEGER. */
  duration_ns: string | null;
  status_code: number | null;
  status_message: string | null;
  service_name: string | null;
  tenant_id: string | null;
  request_id: string | null;
  attributes: unknown;
  resource: unknown;
  events: unknown;
}

export interface WireTraceQueryResult {
  trace_id: string;
  count: number;
  spans: WireSpanRecord[];
  /** true cuando el trace supera el límite del repositorio y se devuelven solo los primeros. */
  truncated: boolean;
}

export interface WireRecentTrace {
  trace_id: string;
  start_time: string;
  /** Duración total del trace en nanosegundos. */
  duration_ns: number;
  span_count: number;
  error_count: number;
  service_name: string | null;
  tenant_id: string | null;
  root_name: string | null;
}

export interface WireListRecentTracesResult {
  traces: WireRecentTrace[];
}
