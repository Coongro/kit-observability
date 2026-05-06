import type { HttpEndpointContext } from '@coongro/module-core';

import { listRecentTraces } from '../repositories/spans.js';
import { getRuntimeState } from '../runtime/state.js';

/**
 * GET /plugins/kit-observability/traces/recent?limit=20
 *
 * Devuelve los últimos N traces para el "selector" inicial de la vista
 * Trace — el operador entra al menú sin un trace_id específico y pica
 * uno de la lista en lugar de pegar a mano.
 *
 * Lee de observability.log_spans via el pool systemDatabase (cross-tenant).
 */
export async function listRecentTracesEndpoint(context: HttpEndpointContext): Promise<unknown> {
  const limitRaw = context.query['limit'];
  const limit = typeof limitRaw === 'string' && limitRaw.length > 0 ? Number(limitRaw) : undefined;

  const state = getRuntimeState();
  return listRecentTraces(state.systemDb.raw, limit);
}
