import type { Sql } from 'postgres';

import { OBSERVABILITY_SCHEMA_NAME } from '../schema/index.js';

const MAX_SPANS_PER_TRACE = 1000;
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
