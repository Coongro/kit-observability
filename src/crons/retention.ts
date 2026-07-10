import type { Sql } from 'postgres';

import { getRuntimeStateOrNull } from '../runtime/state.js';
import { LOG_ENTRIES_TABLE, LOG_SPANS_TABLE, OBSERVABILITY_SCHEMA_NAME } from '../schema/index.js';

/**
 * Ver maintenance.ts — mismo patrón de inline local del tipo para evitar
 * el import profundo de @coongro/module-core que no está exportado en el barrel.
 */
interface ScheduledTaskContext {
  logger: {
    info: (msg: string, meta?: Record<string, unknown>) => void;
    warn?: (msg: string, meta?: Record<string, unknown>) => void;
    error?: (msg: string, meta?: Record<string, unknown>) => void;
  };
}

const ENTRIES = `"${OBSERVABILITY_SCHEMA_NAME}"."${LOG_ENTRIES_TABLE}"`;
const SPANS = `"${OBSERVABILITY_SCHEMA_NAME}"."${LOG_SPANS_TABLE}"`;

/**
 * Corre un DELETE con ventana de retención y devuelve el conteo de filas
 * borradas. `table` y `whereClause` se interpolán en el SQL — ambos deben
 * ser literales del archivo (no input externo) para evitar SQL injection.
 *
 * Usa result.count (command tag de pg) en lugar de RETURNING 1 para no
 * materializar potencialmente millones de filas en memoria del lado Node.
 *
 * El parámetro `$1` recibe los días como string y se cast a interval —
 * postgres.js no soporta passing un Interval nativo, así que el cast en SQL
 * es la forma idiomática.
 *
 * FIXME(COONG-153): agregar batching con LIMIT para acotar la transacción.
 * En la primera ejecución tras habilitar retention con historial acumulado,
 * este DELETE puede borrar millones de filas en una sola transacción → lock
 * prolongado en partitions y replication lag. Patrón: loop + LIMIT 10000.
 */
async function deleteOlderThan(
  raw: Sql,
  table: string,
  whereClause: string,
  days: number
): Promise<number> {
  const result = await raw.unsafe(`DELETE FROM ${table} WHERE ${whereClause}`, [String(days)]);
  return result.count;
}

/**
 * Handler del scheduledTask `retention`. Corre a las 2am para borrar filas
 * antiguas según los thresholds configurados por env var.
 *
 * log_entries está particionado por tiempo, NO por nivel — no se puede hacer
 * partition drop por nivel. La retention se aplica con DELETE por rango de
 * nivel + ventana de tiempo. Tres buckets:
 *   - debug/info  (level ≤ 20): OBSERVABILITY_RETENTION_DAYS_DEBUG
 *   - warn        (level = 30): OBSERVABILITY_RETENTION_DAYS_WARN
 *   - error/fatal (level ≥ 40): OBSERVABILITY_RETENTION_DAYS_ERROR
 *
 * log_spans usa una sola ventana de tiempo:
 *   - OBSERVABILITY_RETENTION_DAYS_SPANS
 *
 * Valores null = sin retención (las filas no se borran). Útil en staging donde
 * no hay presión de disco y se quiere conservar todo el historial para debugging.
 */
export async function runRetention({ logger }: ScheduledTaskContext): Promise<void> {
  // No-op limpio si el plugin no está activo (OBSERVABILITY_DISABLED=1 o aún sin
  // activar): sin runtime state no hay nada que purgar. Evita el throw de
  // getRuntimeState() que el cron loader registraría como error.
  const state = getRuntimeStateOrNull();
  if (state === null) {
    logger.info('retention omitido — plugin inactivo');
    return;
  }
  const { systemDb, config } = state;
  const { raw } = systemDb;
  const ageWindow = "timestamp < NOW() - ($1 || ' days')::interval";
  const deleted: Record<string, number> = {};

  if (config.retentionDaysDebug !== null) {
    deleted['entries.debug'] = await deleteOlderThan(
      raw,
      ENTRIES,
      `level <= 20 AND ${ageWindow}`,
      config.retentionDaysDebug
    );
  }

  if (config.retentionDaysWarn !== null) {
    deleted['entries.warn'] = await deleteOlderThan(
      raw,
      ENTRIES,
      `level = 30 AND ${ageWindow}`,
      config.retentionDaysWarn
    );
  }

  if (config.retentionDaysError !== null) {
    deleted['entries.error'] = await deleteOlderThan(
      raw,
      ENTRIES,
      `level >= 40 AND ${ageWindow}`,
      config.retentionDaysError
    );
  }

  if (config.retentionDaysSpans !== null) {
    deleted['spans'] = await deleteOlderThan(
      raw,
      SPANS,
      "start_time < NOW() - ($1 || ' days')::interval",
      config.retentionDaysSpans
    );
  }

  logger.info('retention completed', { deleted });
}
