import { bigint, index, integer, jsonb, primaryKey, text, timestamp } from 'drizzle-orm/pg-core';

import { observabilitySchema } from './observability-schema.js';

export const LOG_SPANS_TABLE = 'log_spans';

/**
 * Tabla de spans de OpenTelemetry. PARTITION BY RANGE(start_time) — DDL real
 * en activate() (mismo patrón que log_entries).
 *
 * Las columnas modelan el shape estándar de OTel; la lógica que llena estas
 * filas vive en el SpanSink (COONG-143/G2). G1 declara la tabla para que el
 * bootstrap deje la infraestructura entera lista.
 *
 * PK = (span_id, start_time): span_id es único globalmente en OTel pero la
 * partición por start_time obliga a incluirla en la PK.
 */
export const logSpans = observabilitySchema.table(
  LOG_SPANS_TABLE,
  {
    spanId: text('span_id').notNull(),
    traceId: text('trace_id').notNull(),
    parentSpanId: text('parent_span_id'),
    name: text('name').notNull(),
    kind: text('kind'),
    startTime: timestamp('start_time', { withTimezone: true, mode: 'date' }).notNull(),
    endTime: timestamp('end_time', { withTimezone: true, mode: 'date' }),
    durationNs: bigint('duration_ns', { mode: 'bigint' }),
    statusCode: integer('status_code'),
    statusMessage: text('status_message'),
    serviceName: text('service_name'),
    tenantId: text('tenant_id'),
    requestId: text('request_id'),
    attributes: jsonb('attributes'),
    resource: jsonb('resource'),
    events: jsonb('events'),
  },
  (t) => [
    primaryKey({ columns: [t.spanId, t.startTime] }),
    index('idx_log_spans_trace_start').on(t.traceId, t.startTime),
    index('idx_log_spans_tenant_start').on(t.tenantId, t.startTime),
    index('idx_log_spans_service_start').on(t.serviceName, t.startTime),
  ]
);

export type LogSpanRow = typeof logSpans.$inferSelect;
export type NewLogSpanRow = typeof logSpans.$inferInsert;
