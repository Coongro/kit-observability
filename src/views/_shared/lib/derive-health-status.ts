// Reglas únicas de severidad de un sink — vivían dispersas en el view de
// Salud y se replicaban en cada card. Centralizarlas acá tiene tres
// beneficios:
//
//   1. Un único lugar donde tocar los thresholds (queue lag, fail-safe).
//   2. El view pinta dots/banner sin reimplementar la lógica.
//   3. Si en algún momento se agrega una alerta server-side o un check
//      programático (CLI `coongro health`), comparte exactamente esta
//      misma definición.
//
// Cualquier "warning" o "error" real se rige por estas funciones — no
// hardcodear status en el view.

import type { SinkHealth } from '../api.js';

export type HealthStatus = 'ok' | 'warn' | 'error';

const QUEUE_LAG_WARN_THRESHOLD = 50;

/**
 * Severidad del queue lag de un sink (entries pendientes de flush).
 *
 *   - error: nunca (lag alto se vacía solo cuando el flush vuelve a andar;
 *     la pérdida real se mide con `divertedToFailsafe`/`permanentlyLost`).
 *   - warn: lag >= QUEUE_LAG_WARN_THRESHOLD — el writer no está siguiendo
 *     el ritmo del producer.
 *   - ok: caso normal.
 */
export function deriveQueueLagStatus(lag: number): HealthStatus {
  return lag >= QUEUE_LAG_WARN_THRESHOLD ? 'warn' : 'ok';
}

/**
 * Severidad combinada del fail-safe de un sink:
 *
 *   - error: hay entries permanentemente perdidas (failsafe no pudo
 *     escribirlas tampoco) o write errors del failsafe writer.
 *   - warn: hubo divert al failsafe (la DB rebotó pero al menos el archivo
 *     local los recibió).
 *   - ok: nada de lo anterior.
 */
export function deriveFailsafeStatus(sink: SinkHealth): HealthStatus {
  if (sink.permanentlyLost > 0 || sink.failsafeWriteErrors > 0) return 'error';
  if (sink.divertedToFailsafe > 0) return 'warn';
  return 'ok';
}

/**
 * Severidad de errores de insert acumulados en el sink.
 *
 *   - error: hay fallos pero ningún flush exitoso desde el último error
 *     (proxy: `lastFlushAt === null` con failures > 0 = arrancó roto).
 *   - warn: hubo errores históricamente pero el sink ya volvió a andar.
 *   - ok: sin errores.
 */
export function deriveInsertErrorsStatus(sink: SinkHealth): HealthStatus {
  if (sink.insertFailures === 0) return 'ok';
  if (sink.lastFlushAt === null) return 'error';
  return 'warn';
}

/**
 * Estado global del plugin. Toma el peor de todas las dimensiones de
 * todos los sinks. `error` > `warn` > `ok`.
 */
export function deriveGlobalStatus(sinks: SinkHealth[]): HealthStatus {
  let worst: HealthStatus = 'ok';
  for (const sink of sinks) {
    worst = worseStatus(worst, deriveQueueLagStatus(sink.queueLag));
    worst = worseStatus(worst, deriveFailsafeStatus(sink));
    worst = worseStatus(worst, deriveInsertErrorsStatus(sink));
    if (worst === 'error') return 'error';
  }
  return worst;
}

/**
 * Razón humana del estado global. Toma el primer hallazgo en orden de
 * severidad para mostrar uno solo en el banner — los detalles ya están en
 * los cards individuales.
 */
export function deriveGlobalReason(sinks: { name: string; health: SinkHealth }[]): string {
  for (const { name, health } of sinks) {
    if (health.permanentlyLost > 0) {
      return `${name}: ${health.permanentlyLost} entries perdidas (failsafe también falló).`;
    }
    if (health.failsafeWriteErrors > 0) {
      return `${name}: ${health.failsafeWriteErrors} errores del failsafe writer.`;
    }
  }
  for (const { name, health } of sinks) {
    if (health.divertedToFailsafe > 0) {
      return `${name}: ${health.divertedToFailsafe} entries derivadas a failsafe (DB rebotó).`;
    }
    if (health.insertFailures > 0) {
      return `${name}: ${health.insertFailures} batches con fallo de insert acumulados.`;
    }
    if (health.queueLag >= QUEUE_LAG_WARN_THRESHOLD) {
      return `${name}: queue lag de ${health.queueLag} entries — el writer no sigue el ritmo.`;
    }
  }
  return 'todos los sinks operando normalmente.';
}

/**
 * Severidad mayor entre dos estados (`error` > `warn` > `ok`). Exportada
 * porque los cards de Salud combinan el estado por-sink en uno solo y
 * reusarla evita re-implementar la prioridad en cada call-site.
 */
export function worseStatus(a: HealthStatus, b: HealthStatus): HealthStatus {
  if (a === 'error' || b === 'error') return 'error';
  if (a === 'warn' || b === 'warn') return 'warn';
  return 'ok';
}
