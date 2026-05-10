/**
 * Configuración del plugin leída de env vars al boot.
 *
 * Centralizada acá para que SinkBase, DBSink y futuros sinks (SpanSink en G2)
 * compartan la misma fuente y los tests puedan inyectar overrides sin tocar
 * `process.env`.
 */

function positiveInt(raw: string | undefined, fallback: number, name: string): number {
  if (raw === undefined || raw === '') return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`[kit-observability] env ${name} must be a positive integer, got "${raw}"`);
  }
  return parsed;
}

function optionalPositiveInt(raw: string | undefined, name: string): number | null {
  if (raw === undefined || raw === '') return null;
  return positiveInt(raw, 0, name);
}

export interface ObservabilityConfig {
  /** Tamaño máximo del buffer del sink antes de flush automático por batch. */
  batchSize: number;
  /** Intervalo en ms entre flushes automáticos del buffer. */
  batchIntervalMs: number;
  /** Directorio donde el fail-safe escribe entries que no pudieron persistir en DB. */
  failsafeDir: string;
  /** Bytes máx por archivo del fail-safe antes de rotar al siguiente. */
  failsafeMaxFileBytes: number;
  /** Cantidad máxima de archivos rotados del fail-safe (los más viejos se borran). */
  failsafeMaxFiles: number;
  /** Premake de pg_partman para log_entries y log_spans. */
  partitionPremake: number;
  /**
   * Retention de log_entries por nivel (días). `null` deshabilita el drop.
   * Se aplica vía DELETE rows (no partition drop) porque las particiones son
   * por tiempo, no por nivel.
   */
  retentionDaysDebug: number | null;
  retentionDaysWarn: number | null;
  retentionDaysError: number | null;
  /** Retention en días para log_spans. `null` deshabilita drop automático. */
  retentionDaysSpans: number | null;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ObservabilityConfig {
  return {
    batchSize: positiveInt(env.OBSERVABILITY_BATCH_SIZE, 50, 'OBSERVABILITY_BATCH_SIZE'),
    batchIntervalMs: positiveInt(
      env.OBSERVABILITY_BATCH_INTERVAL_MS,
      200,
      'OBSERVABILITY_BATCH_INTERVAL_MS'
    ),
    failsafeDir: env.OBSERVABILITY_FAILSAFE_DIR ?? './logs/observability-failsafe',
    failsafeMaxFileBytes: positiveInt(
      env.OBSERVABILITY_FAILSAFE_MAX_FILE_BYTES,
      10 * 1024 * 1024,
      'OBSERVABILITY_FAILSAFE_MAX_FILE_BYTES'
    ),
    failsafeMaxFiles: positiveInt(
      env.OBSERVABILITY_FAILSAFE_MAX_FILES,
      7,
      'OBSERVABILITY_FAILSAFE_MAX_FILES'
    ),
    partitionPremake: positiveInt(
      env.OBSERVABILITY_PARTITION_PREMAKE,
      4,
      'OBSERVABILITY_PARTITION_PREMAKE'
    ),
    retentionDaysDebug: optionalPositiveInt(
      env.OBSERVABILITY_RETENTION_DAYS_DEBUG,
      'OBSERVABILITY_RETENTION_DAYS_DEBUG'
    ),
    retentionDaysWarn: optionalPositiveInt(
      env.OBSERVABILITY_RETENTION_DAYS_WARN,
      'OBSERVABILITY_RETENTION_DAYS_WARN'
    ),
    retentionDaysError: optionalPositiveInt(
      env.OBSERVABILITY_RETENTION_DAYS_ERROR,
      'OBSERVABILITY_RETENTION_DAYS_ERROR'
    ),
    retentionDaysSpans: optionalPositiveInt(
      env.OBSERVABILITY_RETENTION_DAYS_SPANS,
      'OBSERVABILITY_RETENTION_DAYS_SPANS'
    ),
  };
}
