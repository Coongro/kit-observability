import type { HttpEndpointContext } from '@coongro/module-core';

import { parseLimit, parseOptionalDate, parseOptionalString } from '../http/parse-filters.js';
import { badRequest } from '../http/response.js';
import { getRuntimeState } from '../runtime/state.js';

/**
 * GET /plugins/kit-observability/audit
 *
 * Query params: tenant_id, actor_id, action, entity_type, entity_id, from (ISO),
 * to (ISO), limit.
 *
 * Devuelve eventos de `audit_events` ordenados por timestamp DESC.
 * Default limit 100, máximo 1000 (clamp en `AuditLog.query`).
 *
 * Trust model: `kit-observability` es uso interno (memoria
 * `kit_observability_internal_only.md`). El `tenant_id` acá es FILTRO de
 * búsqueda, no boundary de seguridad — cualquier caller con JWT puede
 * consultar audit de cualquier tenant, por diseño. Si en algún momento el
 * plugin se instala en tenants de cliente, agregar scoping ANTES del query.
 *
 * Validación: rechaza fechas inválidas con 400 en lugar de ignorarlas en
 * silencio (un typo en `from` ampliaría la búsqueda sin que el caller lo
 * note — ver `logs-query.ts:22-24` para el mismo patrón con `level`).
 */
export async function queryAuditEndpoint(context: HttpEndpointContext): Promise<unknown> {
  const { auditLog } = getRuntimeState();
  const { query } = context;

  const fromRaw = query['from'];
  const toRaw = query['to'];
  const from = parseOptionalDate(fromRaw);
  const to = parseOptionalDate(toRaw);

  if (fromRaw !== undefined && fromRaw !== '' && from === undefined) {
    return badRequest('from must be a valid ISO date');
  }
  if (toRaw !== undefined && toRaw !== '' && to === undefined) {
    return badRequest('to must be a valid ISO date');
  }

  const rows = await auditLog.query({
    tenantId: parseOptionalString(query['tenant_id']),
    actorId: parseOptionalString(query['actor_id']),
    action: parseOptionalString(query['action']),
    entityType: parseOptionalString(query['entity_type']),
    entityId: parseOptionalString(query['entity_id']),
    from,
    to,
    limit: parseLimit(query['limit'], 1000, 100),
  });

  return { rows };
}
