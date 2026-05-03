import { removeSinksByPrefix } from '@coongro/core-logging';

import { getRuntimeStateOrNull, clearRuntimeState } from './state.js';

const SINK_ID_PREFIX = '@coongro/kit-observability:';

/**
 * deactivate() del plugin. Llamado por el plugin loader cuando el plugin se
 * desinstala o cuando el cache lo desaloja (caso eager: nunca debería pasar
 * en producción, pero hot-reload sí lo hace).
 *
 * Flujo:
 *   1. Awaitear el `close()` del DBSink directamente desde el runtime state
 *      (drainea cola + awaitea flushes in-flight + cierra failsafe writer).
 *      Hacer esto explícito ANTES de `removeSinksByPrefix` evita data loss
 *      en el window entre el fire-and-forget del registry y el shutdown del
 *      proceso.
 *   2. removeSinksByPrefix saca el sink del registry. close() ya corrió, así
 *      que el segundo close() del registry (sync via closeSinkSafely) es no-op.
 *   3. clearRuntimeState() — handlers que disparen después (cron pendiente)
 *      tirarán fast en vez de leer estado stale.
 *
 * Trigger para borrar el await explícito: cuando core-logging exponga una
 * variante async de removeSinksByPrefix que efectivamente espere a los
 * close(). Hoy `closeSinkSafely` schedulea el close() pero no lo awaitea.
 */
export async function deactivate(): Promise<void> {
  const state = getRuntimeStateOrNull();
  if (state !== null) {
    await state.dbSink.close();
  }
  removeSinksByPrefix(SINK_ID_PREFIX);
  clearRuntimeState();
}
