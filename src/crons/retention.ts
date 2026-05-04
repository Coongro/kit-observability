import { getRuntimeState } from '../runtime/state.js';
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
  const { systemDb, config } = getRuntimeState();
  const { raw } = systemDb;

  const deleted: Record<string, number> = {};

  if (config.retentionDaysDebug !== null) {
    const rows = await raw.unsafe<{ count: string }[]>(
      `DELETE FROM ${ENTRIES} WHERE level <= 20 AND timestamp < NOW() - ($1 || ' days')::interval RETURNING 1`,
      [String(config.retentionDaysDebug)]
    );
    deleted['entries.debug'] = rows.length;
  }

  if (config.retentionDaysWarn !== null) {
    const rows = await raw.unsafe<{ count: string }[]>(
      `DELETE FROM ${ENTRIES} WHERE level = 30 AND timestamp < NOW() - ($1 || ' days')::interval RETURNING 1`,
      [String(config.retentionDaysWarn)]
    );
    deleted['entries.warn'] = rows.length;
  }

  if (config.retentionDaysError !== null) {
    const rows = await raw.unsafe<{ count: string }[]>(
      `DELETE FROM ${ENTRIES} WHERE level >= 40 AND timestamp < NOW() - ($1 || ' days')::interval RETURNING 1`,
      [String(config.retentionDaysError)]
    );
    deleted['entries.error'] = rows.length;
  }

  if (config.retentionDaysSpans !== null) {
    const rows = await raw.unsafe<{ count: string }[]>(
      `DELETE FROM ${SPANS} WHERE start_time < NOW() - ($1 || ' days')::interval RETURNING 1`,
      [String(config.retentionDaysSpans)]
    );
    deleted['spans'] = rows.length;
  }

  logger.info('retention completed', { deleted });
}
