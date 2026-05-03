import type { Sql } from 'postgres';
import type { LogEntry, LogSink } from '@coongro/core-logging';
import { LogLevel } from '@coongro/core-logging';
import { OBSERVABILITY_SCHEMA_NAME } from '../schema/observability-schema.js';
import { LOG_ENTRIES_TABLE } from '../schema/log-entries.js';
import { computeFingerprint } from '../fingerprinting/compute-fingerprint.js';
import {
  preAggregate,
  recordIssues,
  type AggregatorInput,
} from '../fingerprinting/aggregator.js';
import { SinkBase, type SinkBaseOptions } from './sink-base.js';

const ENTRIES_TABLE = `"${OBSERVABILITY_SCHEMA_NAME}"."${LOG_ENTRIES_TABLE}"`;

const SINK_ID = '@coongro/kit-observability:db';

/**
 * Sink que persiste log entries a PostgreSQL.
 *
 * Notas:
 *   - Implementa LogSink (write/close) y se registra en el registry global de
 *     `@coongro/core-logging` via `addSink()` desde `activate()` del plugin.
 *   - La spec original mencionaba `pino-abstract-transport`, pero esa
 *     decisión quedó obsoleta cuando COONG-128 introdujo el registry de sinks
 *     en core-logging — Pino vive dentro de core-logging, los sinks de
 *     plugins solo implementan `LogSink`.
 *   - Recibe entries con level ya filtrado por core-logging (via `minLevel`).
 *   - Para entries con `level >= ERROR` flushea sincrónicamente.
 *   - Para entries con `level >= WARN` las suma al aggregator de log_issues.
 */
export interface DBSinkOptions {
  raw: Sql;
  /** Override del `minLevel` por defecto (DEBUG). Útil para reducir volumen. */
  minLevel?: LogLevel;
}

export class DBSink extends SinkBase<LogEntry> implements LogSink {
  readonly id = SINK_ID;
  readonly minLevel: LogLevel;

  private readonly raw: Sql;

  constructor(opts: DBSinkOptions, base: Omit<SinkBaseOptions, 'id'>) {
    super({ ...base, id: SINK_ID });
    this.raw = opts.raw;
    this.minLevel = opts.minLevel ?? LogLevel.DEBUG;
  }

  /**
   * Punto de entrada del LogSink. Solo encola — el procesamiento real ocurre
   * en `flushBatch()`. write() debe ser sync rápido (contrato del registry).
   */
  write(entry: Readonly<LogEntry>): void {
    this.enqueue(entry as LogEntry);
  }

  protected override shouldFlushSync(entry: LogEntry): boolean {
    return entry.level >= LogLevel.ERROR;
  }

  protected serializeForFailsafe(entry: LogEntry): string {
    return JSON.stringify(entry);
  }

  protected async flushBatch(batch: readonly LogEntry[]): Promise<void> {
    const enriched = batch.map(enrichEntry);
    await this.bulkInsertEntries(enriched);

    const aggregatorInputs = enriched
      .filter((e) => e.row.level >= LogLevel.WARN)
      .map((e): Omit<AggregatorInput, 'count'> => ({
        fingerprint: e.row.fingerprint,
        tenantId: e.row.tenant_id,
        level: e.row.level,
        source: e.row.source,
        sampleMessage: e.entry.message,
        sampleTopFrame: e.topFrame,
      }));

    if (aggregatorInputs.length > 0) {
      await recordIssues(this.raw, preAggregate(aggregatorInputs));
    }
  }

  private async bulkInsertEntries(enriched: EnrichedEntry[]): Promise<void> {
    if (enriched.length === 0) return;

    const rows = enriched.map((e) => e.row);
    await this.raw.unsafe(
      `INSERT INTO ${ENTRIES_TABLE}
         (timestamp, tenant_id, request_id, level, source, message, context, metadata, error, call_site, fingerprint)
       SELECT
         (v.timestamp)::timestamptz,
         NULLIF(v.tenant_id, '')::uuid,
         NULLIF(v.request_id, ''),
         v.level::int,
         v.source,
         v.message,
         v.context,
         v.metadata,
         v.error,
         v.call_site,
         v.fingerprint
       FROM jsonb_to_recordset($1::jsonb) AS v(
         timestamp text, tenant_id text, request_id text, level int,
         source text, message text, context jsonb, metadata jsonb,
         error jsonb, call_site jsonb, fingerprint text
       )`,
      [JSON.stringify(rows)]
    );
  }
}

interface EnrichedRow {
  timestamp: string;
  tenant_id: string | null;
  request_id: string | null;
  level: number;
  source: string;
  message: string;
  context: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  error: Record<string, unknown> | null;
  call_site: Record<string, unknown> | null;
  fingerprint: string;
}

interface EnrichedEntry {
  entry: LogEntry;
  row: EnrichedRow;
  topFrame: string | null;
}

function enrichEntry(entry: LogEntry): EnrichedEntry {
  const tenantId = extractStringField(entry.context, 'tenantId');
  const requestId = extractStringField(entry.context, 'requestId');
  const source = entry.name ?? 'app';
  const topFrame = extractTopFrame(entry);
  const fingerprint = computeFingerprint({
    level: entry.level,
    source,
    message: entry.message,
    topFrame,
  });

  return {
    entry,
    topFrame,
    row: {
      timestamp: entry.timestamp,
      tenant_id: tenantId,
      request_id: requestId,
      level: entry.level,
      source,
      message: entry.message,
      context: (entry.context as Record<string, unknown>) ?? null,
      metadata: entry.metadata ?? null,
      error: (entry.error as unknown as Record<string, unknown>) ?? null,
      call_site: (entry.callSite as unknown as Record<string, unknown>) ?? null,
      fingerprint,
    },
  };
}

function extractStringField(
  obj: Record<string, unknown> | undefined,
  key: string
): string | null {
  if (obj === undefined) return null;
  const v = obj[key];
  return typeof v === 'string' && v.length > 0 ? v : null;
}

function extractTopFrame(entry: LogEntry): string | null {
  // Preferimos el callSite (formato estructurado del facade) si está.
  if (entry.callSite !== undefined) {
    const cs = entry.callSite as { file?: string; line?: number; function?: string };
    if (typeof cs.file === 'string' && typeof cs.line === 'number') {
      return `${cs.function ?? '<anonymous>'} (${cs.file}:${cs.line})`;
    }
  }
  // Sino, primera línea no-vacía del stack del error serializado.
  const stack = entry.error?.stack;
  if (typeof stack === 'string') {
    const firstFrame = stack
      .split('\n')
      .map((l) => l.trim())
      .find((l) => l.startsWith('at '));
    if (firstFrame !== undefined) return firstFrame;
  }
  return null;
}
