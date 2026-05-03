import { removeSinksByPrefix } from '@coongro/core-logging';
import { clearRuntimeState } from './state.js';

const SINK_ID_PREFIX = '@coongro/kit-observability:';

/**
 * deactivate() del plugin. Llamado por el plugin loader cuando el plugin se
 * desinstala o cuando el cache lo desaloja (caso eager: nunca debería pasar
 * en producción, pero hot-reload sí lo hace).
 *
 * removeSinksByPrefix invoca close() en cada sink → drainea cola → cierra
 * failsafe writer. Después limpiamos runtime state para que cualquier
 * acceso posterior (cron pendiente que disparó justo antes) falle fast.
 */
export async function deactivate(): Promise<void> {
  removeSinksByPrefix(SINK_ID_PREFIX);
  clearRuntimeState();
}
