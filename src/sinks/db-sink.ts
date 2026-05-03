import type { LogEntry, LogSink } from '@coongro/core-logging';
import { LogLevel } from '@coongro/core-logging';
import type { Sql } from 'postgres';

import {
  preAggregate,
  recordIssues,
  type RawAggregatorInput,
} from '../fingerprinting/aggregator.js';
import { computeFingerprint } from '../fingerprinting/compute-fingerprint.js';
import { LOG_ENTRIES_TABLE } from '../schema/log-entries.js';
import { OBSERVABILITY_SCHEMA_NAME } from '../schema/observability-schema.js';

import { SinkBase, type SinkBaseOptions } from './sink-base.js';

const ENTRIES_TABLE = `"${OBSERVABILITY_SCHEMA_NAME}"."${LOG_ENTRIES_TABLE}"`;

const SINK_ID = '@coongro/kit-observability:db';

// Shape 8-4-4-4-12 hex. Match relaxed (no version/variant bits chequeados)
// porque Postgres acepta cualquier UUID con este shape, y los tests/scripts
// sintéticos suelen usar patrones tipo `11111111-2222-3333-4444-555555555555`
// que no respetan version/variant pero son válidos para la columna `uuid`.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Sink que persiste log entries a PostgreSQL.
 *
 * Implementa LogSink (write/close) y se registra en el registry global de
 * `@coongro/core-logging` via `addSink()` desde `activate()` del plugin.
 * Pino vive dentro de core-logging — los plugins solo implementan LogSink.
 *
 * Comportamiento:
 *   - Recibe entries con level ya filtrado por core-logging (via `minLevel`).
 *   - Para entries con `level >= ERROR` flushea sincrónicamente.
 *   - Para entries con `level >= WARN` las suma al aggregator de log_issues.
 *   - tenant_id en el entry context se valida como UUID antes de pasar al
 *     INSERT — un valor no-UUID convertía todo el batch en error de Postgres
 *     y mandaba 50 entries válidos al failsafe.
 */
export interface DBSinkOptions extends Omit<SinkBaseOptions, 'id'> {
  raw: Sql;
  /** Override del `minLevel` por defecto (DEBUG). Útil para reducir volumen. */
  minLevel?: LogLevel;
}

export class DBSink extends SinkBase<LogEntry> implements LogSink {
  readonly id = SINK_ID;
  readonly minLevel: LogLevel;

  private readonly raw: Sql;

  constructor(opts: DBSinkOptions) {
    super({
      id: SINK_ID,
      batchSize: opts.batchSize,
      batchIntervalMs: opts.batchIntervalMs,
      failsafe: opts.failsafe,
    });
    this.raw = opts.raw;
    this.minLevel = opts.minLevel ?? LogLevel.DEBUG;
  }

  /**
   * Punto de entrada del LogSink. Solo encola — el procesamiento real ocurre
   * en `flushBatch()`. write() debe ser sync rápido (contrato del registry).
   */
  write(entry: Readonly<LogEntry>): void {
    this.enqueue(entry);
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
      // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison
      .filter((e) => e.row.level >= LogLevel.WARN)
      .map(
        (e): RawAggregatorInput => ({
          fingerprint: e.row.fingerprint,
          tenantId: e.row.tenant_id,
          level: e.row.level,
          source: e.row.source,
          sampleMessage: e.entry.message,
          sampleTopFrame: e.topFrame,
        })
      );

    if (aggregatorInputs.length > 0) {
      await recordIssues(this.raw, preAggregate(aggregatorInputs));
    }
  }

  private async bulkInsertEntries(enriched: EnrichedEntry[]): Promise<void> {
    if (enriched.length === 0) return;

    const FIELDS_PER_ROW = 11;
    const placeholders = enriched
      .map((_, i) => {
        const o = i * FIELDS_PER_ROW;
        return `($${o + 1}::timestamptz, $${o + 2}::uuid, $${o + 3}, $${o + 4}::int, $${o + 5}, $${o + 6}, $${o + 7}::jsonb, $${o + 8}::jsonb, $${o + 9}::jsonb, $${o + 10}::jsonb, $${o + 11})`;
      })
      .join(', ');

    const params: (string | number | null)[] = [];
    for (const e of enriched) {
      params.push(
        e.row.timestamp,
        e.row.tenant_id,
        e.row.request_id,
        e.row.level,
        e.row.source,
        e.row.message,
        jsonOrNull(e.row.context),
        jsonOrNull(e.row.metadata),
        jsonOrNull(e.row.error),
        jsonOrNull(e.row.call_site),
        e.row.fingerprint
      );
    }

    await this.raw.unsafe(
      `INSERT INTO ${ENTRIES_TABLE}
         (timestamp, tenant_id, request_id, level, source, message, context, metadata, error, call_site, fingerprint)
       VALUES ${placeholders}`,
      params
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
  const tenantId = extractUuidField(entry.context, 'tenantId');
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

function jsonOrNull(value: Record<string, unknown> | null): string | null {
  return value !== null ? JSON.stringify(value) : null;
}

function extractStringField(obj: Record<string, unknown> | undefined, key: string): string | null {
  if (obj === undefined) return null;
  const v = obj[key];
  return typeof v === 'string' && v.length > 0 ? v : null;
}

/**
 * Extrae un campo solo si es un UUID válido. Los entries con tenantId no-UUID
 * (ej: 'system') hacían fallar el INSERT entero del batch porque la columna
 * `tenant_id` es uuid. Un solo entry inválido envenenaba hasta 50 entries
 * válidos al fail-safe. Filtrar acá los degrada a tenant_id=NULL en vez.
 */
function extractUuidField(obj: Record<string, unknown> | undefined, key: string): string | null {
  const raw = extractStringField(obj, key);
  if (raw === null) return null;
  return UUID_RE.test(raw) ? raw : null;
}

function extractTopFrame(entry: LogEntry): string | null {
  // Preferimos el callSite (formato estructurado del facade) si está.
  if (entry.callSite !== undefined && entry.callSite !== null) {
    const cs = entry.callSite as { file?: unknown; line?: unknown; function?: unknown };
    if (typeof cs.file === 'string' && typeof cs.line === 'number') {
      const fn = typeof cs.function === 'string' ? cs.function : '<anonymous>';
      return `${fn} (${cs.file}:${cs.line})`;
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
