import type { HttpEndpointContext } from '@coongro/module-core';

import { listActiveTenants } from '../repositories/tenants.js';
import { getRuntimeState } from '../runtime/state.js';

/**
 * GET /plugins/kit-observability/tenants
 *
 * Devuelve `{ rows: [{id, name}, ...] }` para alimentar los selectores de
 * tenant en las views del plugin (Issues, Stream, Auditoría).
 *
 * Cross-tenant por diseño: kit-observability es internal-only y necesita
 * ver tenants ajenos para que el equipo Coongro pueda filtrar logs por
 * tenant arbitrario. Si el plugin se exponiera a tenants de cliente, este
 * endpoint debería remover (filtrar al tenant del JWT) o no exponerse.
 */
export async function listTenantsEndpoint(_context: HttpEndpointContext): Promise<unknown> {
  const { systemDb } = getRuntimeState();
  const rows = await listActiveTenants(systemDb.raw);
  return { rows };
}
