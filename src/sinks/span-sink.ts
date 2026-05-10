import type { Context } from '@opentelemetry/api';
import type { ReadableSpan, Span, SpanProcessor } from '@opentelemetry/sdk-trace-base';
import type { Sql } from 'postgres';

import { OBSERVABILITY_SCHEMA_NAME } from '../schema/index.js';

import { type SinkBaseOptions, SinkBase } from './sink-base.js';

export const SPAN_SINK_ID = '@coongro/kit-observability:span-sink';

const SPANS_TABLE = `${OBSERVABILITY_SCHEMA_NAME}.log_spans`;
const FIELDS_PER_ROW = 16;

// Mapeo manual de SpanKind numérico (OTel) → string sin importar el enum.
// 0=INTERNAL, 1=SERVER, 2=CLIENT, 3=PRODUCER, 4=CONSUMER
function kindToString(kind: number): string {
  switch (kind) {
    case 1:
      return 'SERVER';
    case 2:
      return 'CLIENT';
    case 3:
      return 'PRODUCER';
    case 4:
      return 'CONSUMER';
    default:
      return 'INTERNAL';
  }
}

// OTel HrTime [seconds, nanoseconds] → Date
function hrTimeToDate(hrtime: [number, number]): Date {
  return new Date(hrtime[0] * 1000 + hrtime[1] / 1_000_000);
}

// Duración entre dos HrTime en nanosegundos (número seguro para JS hasta ~292 años)
function hrTimeDurationNs(start: [number, number], end: [number, number]): number {
  return (end[0] - start[0]) * 1_000_000_000 + (end[1] - start[1]);
}

function extractAttr(attrs: Record<string, unknown>, ...keys: string[]): string | null {
  for (const k of keys) {
    const v = attrs[k];
    if (typeof v === 'string' && v.length > 0) return v;
  }
  return null;
}

function jsonOrNull(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  return JSON.stringify(v);
}

interface SpanRow {
  span_id: string;
  trace_id: string;
  parent_span_id: string | null;
  name: string;
  kind: string;
  start_time: string; // ISO 8601
  end_time: string | null;
  duration_ns: number;
  status_code: number;
  status_message: string | null;
  service_name: string;
  tenant_id: string | null;
  request_id: string | null;
  attributes: string | null; // JSON
  resource: string | null; // JSON
  events: string | null; // JSON
}

function spanToRow(span: ReadableSpan): SpanRow {
  const ctx = span.spanContext();
  const attrs = span.attributes as Record<string, unknown>;
  const resourceAttrs = span.resource.attributes as Record<string, unknown>;

  return {
    span_id: ctx.spanId,
    trace_id: ctx.traceId,
    parent_span_id: span.parentSpanContext?.spanId ?? null,
    name: span.name,
    kind: kindToString(span.kind),
    start_time: hrTimeToDate(span.startTime).toISOString(),
    end_time: hrTimeToDate(span.endTime).toISOString(),
    duration_ns: hrTimeDurationNs(span.startTime, span.endTime),
    status_code: span.status.code,
    status_message: span.status.message ?? null,
    service_name: extractAttr(resourceAttrs, 'service.name') ?? 'api',
    tenant_id: extractAttr(attrs, 'tenant.id', 'tenantId'),
    request_id: extractAttr(attrs, 'request.id', 'requestId', 'http.request_id'),
    attributes: Object.keys(attrs).length > 0 ? jsonOrNull(attrs) : null,
    resource: Object.keys(resourceAttrs).length > 0 ? jsonOrNull(resourceAttrs) : null,
    events: span.events.length > 0 ? jsonOrNull(span.events) : null,
  };
}

async function bulkInsertSpans(raw: Sql, rows: SpanRow[]): Promise<void> {
  if (rows.length === 0) return;

  const placeholders = rows
    .map((_, i) => {
      const o = i * FIELDS_PER_ROW;
      return (
        `($${o + 1}, $${o + 2}, $${o + 3}, $${o + 4}, $${o + 5}, ` +
        `$${o + 6}::timestamptz, $${o + 7}::timestamptz, $${o + 8}::bigint, ` +
        `$${o + 9}::int, $${o + 10}, $${o + 11}, $${o + 12}, $${o + 13}, ` +
        `$${o + 14}::jsonb, $${o + 15}::jsonb, $${o + 16}::jsonb)`
      );
    })
    .join(', ');

  const params: (string | number | null)[] = [];
  for (const r of rows) {
    params.push(
      r.span_id,
      r.trace_id,
      r.parent_span_id,
      r.name,
      r.kind,
      r.start_time,
      r.end_time,
      r.duration_ns,
      r.status_code,
      r.status_message,
      r.service_name,
      r.tenant_id,
      r.request_id,
      r.attributes,
      r.resource,
      r.events
    );
  }

  await raw.unsafe(
    `INSERT INTO ${SPANS_TABLE}
       (span_id, trace_id, parent_span_id, name, kind, start_time, end_time,
        duration_ns, status_code, status_message, service_name, tenant_id,
        request_id, attributes, resource, events)
     VALUES ${placeholders}
     ON CONFLICT (span_id, start_time) DO NOTHING`,
    params
  );
}

export interface SpanSinkOptions extends Omit<SinkBaseOptions, 'id'> {
  raw: Sql;
}

/**
 * SpanProcessor de OTel que persiste ReadableSpans en observability.log_spans.
 *
 * Extiende SinkBase<ReadableSpan> — hereda buffer+batch+flush-sync para errores,
 * fail-safe a archivo local y health metrics. Implementa SpanProcessor para
 * registrarse en el SpanProcessorRegistry del API via context.api.addSpanProcessor.
 *
 * Flush sincrónico: spans con status.code === 2 (ERROR) se flushean inmediatamente.
 * Para todos los demás se acumula batch por batchSize o batchIntervalMs.
 *
 * Idempotencia en hot-reload: activate() guarda la instancia activa en
 * RuntimeState y la reutiliza en re-activaciones sin llamar addSpanProcessor
 * de nuevo. deactivate() llama removeSpanProcessor antes de shutdown() para
 * sacar el sink del fan-out OTel antes de drainear la cola.
 */
export class SpanSink extends SinkBase<ReadableSpan> implements SpanProcessor {
  readonly id = SPAN_SINK_ID;
  private readonly raw: Sql;

  constructor(opts: SpanSinkOptions) {
    super({
      id: SPAN_SINK_ID,
      batchSize: opts.batchSize,
      batchIntervalMs: opts.batchIntervalMs,
      failsafe: opts.failsafe,
    });
    this.raw = opts.raw;
  }

  // ── SpanProcessor ──────────────────────────────────────────────────────────

  onStart(_span: Span, _parentContext: Context): void {
    // no-op: procesamos solo spans completados en onEnd
  }

  onEnd(span: ReadableSpan): void {
    this.enqueue(span);
  }

  async forceFlush(): Promise<void> {
    await this.flushNow();
  }

  async shutdown(): Promise<void> {
    await this.close();
  }

  // ── SinkBase ───────────────────────────────────────────────────────────────

  // SpanStatusCode.ERROR = 2 (hardcodeado para evitar dep en @opentelemetry/api)
  protected override shouldFlushSync(span: ReadableSpan): boolean {
    return (span.status.code as number) === 2;
  }

  protected serializeForFailsafe(span: ReadableSpan): string {
    return JSON.stringify(spanToRow(span));
  }

  protected async flushBatch(batch: readonly ReadableSpan[]): Promise<void> {
    await bulkInsertSpans(this.raw, batch.map(spanToRow));
  }
}
