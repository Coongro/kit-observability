import type { SystemDatabase } from '@coongro/database-core';

import type { ObservabilityConfig } from '../config.js';
import type { DBSink } from '../sinks/db-sink.js';

/**
 * Estado runtime del plugin compartido entre `activate()`, `deactivate()` y los
 * handlers de scheduledTasks (que cargan en su propio módulo y necesitan
 * acceder al systemDatabase establecido al activar).
 *
 * Singleton process-scoped — el plugin loader del API garantiza que el módulo
 * se importa UNA sola vez por proceso (no se re-evalúa entre ticks de cron).
 *
 * NO exportar este state directo a consumidores; usar getRuntimeState() para
 * que cualquier acceso post-deactivate falle fast en vez de devolver basura.
 */
interface RuntimeState {
  systemDb: SystemDatabase;
  config: ObservabilityConfig;
  dbSink: DBSink;
}

let current: RuntimeState | null = null;

export function setRuntimeState(state: RuntimeState): void {
  current = state;
}

export function getRuntimeState(): RuntimeState {
  if (current === null) {
    throw new Error(
      '[kit-observability] runtime state not set — handler invoked before activate() or after deactivate()'
    );
  }
  return current;
}

/**
 * Variante non-throwing para usos donde el caller necesita decidir qué hacer
 * si el plugin no fue activado todavía (ej: deactivate() corriendo en un
 * proceso donde activate() falló al inicio — todavía queremos limpiar lo
 * que haya sin tirar otro error encima).
 */
export function getRuntimeStateOrNull(): RuntimeState | null {
  return current;
}

export function clearRuntimeState(): void {
  current = null;
}
