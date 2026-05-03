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
 *
 * El contrato de ModuleExports.deactivate permite `void | Promise<void>`,
 * y removeSinksByPrefix internamente schedulea closes async pero no espera —
 * por ahora deactivate es sync. Si COONG-128 expone una variante async
 * que awaitee los close(), se puede convertir a async sin romper callers.
 */
export function deactivate(): void {
  removeSinksByPrefix(SINK_ID_PREFIX);
  clearRuntimeState();
}
