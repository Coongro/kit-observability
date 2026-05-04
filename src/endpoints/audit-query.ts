import type { HttpEndpointContext } from '@coongro/module-core';

import { parseLimit, parseOptionalDate, parseOptionalString } from '../http/parse-filters.js';
import { getRuntimeState } from '../runtime/state.js';

/**
 * GET /plugins/kit-observability/audit
 *
 * Query params: tenant_id, actor_id, action, entity_type, entity_id, from (ISO),
 * to (ISO), limit.
 *
 * Devuelve eventos de `audit_events` ordenados por timestamp DESC.
 * Default limit 100, máximo 1000 (clamp en `AuditLog.query`).
 */
export async function queryAuditEndpoint(context: HttpEndpointContext): Promise<unknown> {
  const { auditLog } = getRuntimeState();
  const { query } = context;

  const rows = await auditLog.query({
    tenantId: parseOptionalString(query['tenant_id']),
    actorId: parseOptionalString(query['actor_id']),
    action: parseOptionalString(query['action']),
    entityType: parseOptionalString(query['entity_type']),
    entityId: parseOptionalString(query['entity_id']),
    from: parseOptionalDate(query['from']),
    to: parseOptionalDate(query['to']),
    limit: parseLimit(query['limit'], 1000, 100),
  });

  return { rows };
}
