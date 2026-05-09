import type { HttpEndpointContext } from '@coongro/module-core';

import { listRecentSources } from '../repositories/sources.js';
import { getRuntimeState } from '../runtime/state.js';

/**
 * GET /plugins/kit-observability/sources
 *
 * Devuelve `{ rows: [{source, count, last_seen}, ...] }` ordenado por uso
 * reciente. Alimenta el dropdown del filtro SOURCE en las views.
 */
export async function listSourcesEndpoint(_context: HttpEndpointContext): Promise<unknown> {
  const { systemDb } = getRuntimeState();
  const rows = await listRecentSources(systemDb.raw);
  return { rows };
}
