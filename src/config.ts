/**
 * Configuración del plugin leída de env vars al boot.
 *
 * Centralizada acá para que SinkBase, DBSink y futuros sinks (SpanSink en G2)
 * compartan la misma fuente y los tests puedan inyectar overrides sin tocar
 * `process.env`.
 */

import { LogLevel } from '@coongro/core-logging';

function positiveInt(raw: string | undefined, fallback: number, name: string): number {
  if (raw === undefined || raw === '') return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`[kit-observability] env ${name} must be a positive integer, got "${raw}"`);
  }
  return parsed;
}

/** Mapa nombre→LogLevel para parsear `OBSERVABILITY_DB_MIN_LEVEL`. */
const LOG_LEVEL_BY_NAME: Record<string, LogLevel> = {
  debug: LogLevel.DEBUG,
  info: LogLevel.INFO,
  warn: LogLevel.WARN,
  error: LogLevel.ERROR,
  fatal: LogLevel.FATAL,
};

/**
 * Parsea un nivel de log desde env (case-insensitive). Default `fallback`.
 * Lanza ante un valor desconocido para que un typo en la config no degrade
 * silenciosamente la observabilidad (p. ej. dejar de persistir errores).
 */
function logLevel(raw: string | undefined, fallback: LogLevel, name: string): LogLevel {
  if (raw === undefined || raw === '') return fallback;
  const level = LOG_LEVEL_BY_NAME[raw.trim().toLowerCase()];
  if (level === undefined) {
    throw new Error(
      `[kit-observability] env ${name} must be one of ${Object.keys(LOG_LEVEL_BY_NAME).join(', ')}, got "${raw}"`
    );
  }
  return level;
}

function optionalPositiveInt(raw: string | undefined, name: string): number | null {
  if (raw === undefined || raw === '') return null;
  return positiveInt(raw, 0, name);
}

export interface ObservabilityConfig {
  /**
   * Nivel mínimo que el DBSink persiste en `log_entries` (default WARN).
   *
   * El otel-bridge emite un LogEntry por cada span (middleware/handler/query),
   * casi todos a nivel INFO: ~93% del volumen de la tabla y varios GB de storage
   * que son ruido (un GET de 3 ms no aporta señal). Con WARN, core-logging filtra
   * INFO/DEBUG antes del sink (ver registry `sink.minLevel`) y solo se persisten
   * spans escalados a WARN por duración (requests lentos) + warnings + errores —
   * la señal real del dashboard. Bajable a `info`/`debug` para debugging puntual.
   */
  dbMinLevel: LogLevel;
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

/**
 * Master kill-switch del plugin. Cuando `OBSERVABILITY_DISABLED=1`, `activate()`
 * retorna temprano y el plugin NO registra nada que toque la DB: sin bootstrap,
 * sin sinks (DBSink/SpanSink), sin crons efectivos, sin audit recorder.
 *
 * Pensado como palanca operacional reset-proof y 100% por env var: a diferencia
 * del toggle por-tenant (`PATCH .../plugins/.../status`), NO necesita la DB
 * arriba ni enumerar tenants, y sobrevive reinicios/redeploys. Útil cuando la
 * persistencia de observabilidad está drenando el compute de la DB (Neon free
 * tier) y hay que cortarla del todo sin desinstalar.
 *
 * Se lee directo de env (no vía `loadConfig`) a propósito: un kill-switch no
 * debe depender de que el resto de la config parsee bien — si otra env var
 * estuviera malformada, `loadConfig` lanzaría y el switch no podría leerse.
 */
export function isObservabilityDisabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.OBSERVABILITY_DISABLED === '1';
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ObservabilityConfig {
  return {
    dbMinLevel: logLevel(
      env.OBSERVABILITY_DB_MIN_LEVEL,
      LogLevel.WARN,
      'OBSERVABILITY_DB_MIN_LEVEL'
    ),
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
