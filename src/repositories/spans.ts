import type { Sql } from 'postgres';

import { OBSERVABILITY_SCHEMA_NAME } from '../schema/index.js';

const MAX_SPANS_PER_TRACE = 1000;
const RECENT_TRACES_DEFAULT_LIMIT = 20;
const RECENT_TRACES_MAX_LIMIT = 100;
const SPANS_TABLE = `${OBSERVABILITY_SCHEMA_NAME}.log_spans`;

export interface SpanRecord {
  span_id: string;
  trace_id: string;
  parent_span_id: string | null;
  name: string;
  kind: string | null;
  start_time: Date;
  end_time: Date | null;
  duration_ns: bigint | null;
  status_code: number | null;
  status_message: string | null;
  service_name: string | null;
  tenant_id: string | null;
  request_id: string | null;
  attributes: unknown;
  resource: unknown;
  events: unknown;
}

export interface TraceQueryResult {
  trace_id: string;
  count: number;
  spans: SpanRecord[];
  /** true cuando el trace supera MAX_SPANS_PER_TRACE y se devuelven solo los primeros */
  truncated: boolean;
}

/**
 * Devuelve todos los spans de un trace ordenados por start_time ASC.
 * Si el trace supera MAX_SPANS_PER_TRACE, se truncan y se setea truncated=true.
 * Devuelve count=0 y spans=[] si el trace_id no existe.
 */
export async function queryTraceById(raw: Sql, traceId: string): Promise<TraceQueryResult> {
  const rows = (await raw.unsafe(
    `SELECT span_id, trace_id, parent_span_id, name, kind,
            start_time, end_time, duration_ns, status_code, status_message,
            service_name, tenant_id, request_id, attributes, resource, events
     FROM ${SPANS_TABLE}
     WHERE trace_id = $1
     ORDER BY start_time ASC
     LIMIT $2`,
    [traceId, MAX_SPANS_PER_TRACE + 1]
  )) as SpanRecord[];

  const truncated = rows.length > MAX_SPANS_PER_TRACE;
  const spans = truncated ? rows.slice(0, MAX_SPANS_PER_TRACE) : rows;
  return { trace_id: traceId, count: spans.length, spans, truncated };
}

export interface RecentTraceSummary {
  trace_id: string;
  start_time: Date;
  /** Duración total en nanosegundos (max(end_time) - min(start_time)). */
  duration_ns: number;
  /** Cantidad de spans en el trace. */
  span_count: number;
  /** Cantidad de spans con status_code === 2 (ERROR de OTel). */
  error_count: number;
  /** Service del span root (o el primero por start_time si no hay root claro). */
  service_name: string | null;
  tenant_id: string | null;
  /** Nombre del span root, para que el operador reconozca el trace. */
  root_name: string | null;
}

export interface ListRecentTracesResult {
  traces: RecentTraceSummary[];
}

/**
 * Devuelve los últimos `limit` traces ordenados por start_time DESC. Sirve
 * como "selector" inicial de la vista Trace cuando el operador entra sin
 * un trace_id específico — pega de una lista en vez de tener que buscar
 * el id en otra herramienta.
 *
 * Implementación: agregación por trace_id sobre log_spans. Tomamos el
 * span más viejo de cada trace para el service/root_name, MIN/MAX para
 * los bounds y COUNT para los totales. Performance: con índice por
 * (start_time DESC) + LIMIT por trace_id, es O(N) sobre los últimos N
 * traces — viable hasta varios millones de spans.
 */
export async function listRecentTraces(
  raw: Sql,
  limit: number = RECENT_TRACES_DEFAULT_LIMIT
): Promise<ListRecentTracesResult> {
  const safeLimit = Math.max(1, Math.min(RECENT_TRACES_MAX_LIMIT, Math.floor(limit)));

  const rows = (await raw.unsafe(
    `WITH agg AS (
       SELECT trace_id,
              MIN(start_time) AS start_time,
              MAX(COALESCE(end_time, start_time)) AS end_time,
              COUNT(*)::int AS span_count,
              COUNT(*) FILTER (WHERE status_code = 2)::int AS error_count
         FROM ${SPANS_TABLE}
         GROUP BY trace_id
         ORDER BY MIN(start_time) DESC
         LIMIT $1
     ),
     roots AS (
       SELECT DISTINCT ON (s.trace_id)
              s.trace_id, s.name AS root_name, s.service_name, s.tenant_id
         FROM ${SPANS_TABLE} s
         JOIN agg ON agg.trace_id = s.trace_id
        ORDER BY s.trace_id, s.start_time ASC
     )
     SELECT agg.trace_id,
            agg.start_time,
            EXTRACT(EPOCH FROM (agg.end_time - agg.start_time)) * 1000000000 AS duration_ns,
            agg.span_count,
            agg.error_count,
            roots.service_name,
            roots.tenant_id,
            roots.root_name
       FROM agg
       LEFT JOIN roots ON roots.trace_id = agg.trace_id
      ORDER BY agg.start_time DESC`,
    [safeLimit]
  )) as Array<{
    trace_id: string;
    start_time: Date;
    duration_ns: string;
    span_count: number;
    error_count: number;
    service_name: string | null;
    tenant_id: string | null;
    root_name: string | null;
  }>;

  return {
    traces: rows.map((r) => ({
      trace_id: r.trace_id,
      start_time: r.start_time,
      duration_ns: Number(r.duration_ns),
      span_count: r.span_count,
      error_count: r.error_count,
      service_name: r.service_name,
      tenant_id: r.tenant_id,
      root_name: r.root_name,
    })),
  };
}
