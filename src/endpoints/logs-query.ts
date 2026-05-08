import type { HttpEndpointContext } from '@coongro/module-core';

import {
  parseLimit,
  parseOffset,
  parseOptionalInt,
  parseOptionalIso,
  parseOptionalString,
} from '../http/parse-filters.js';
import { badRequest } from '../http/response.js';
import { queryLogsService } from '../services/logs.service.js';

/**
 * GET /plugins/kit-observability/logs/query
 *
 * Query params: level (single, legacy) o levels (CSV de niveles para
 * filtrar varios), source, tenant_id, request_id, from (ISO), to (ISO),
 * q, limit, offset. Si llegan ambos, `levels` gana.
 */
export async function queryLogsEndpoint(context: HttpEndpointContext): Promise<unknown> {
  const { query } = context;
  const level = parseOptionalInt(query['level']);
  const levelsCsv = parseOptionalString(query['levels']);

  if (level !== undefined && (level < 0 || !Number.isFinite(level))) {
    return badRequest('level must be a non-negative integer');
  }

  // `levels` toma precedencia sobre `level` para no romper callers viejos
  // que usen el contrato single-level. Cualquier item inválido aborta —
  // no querés que `levels=30,abc,40` te devuelva resultados de los dos
  // válidos y te trague el typo en silencio.
  let levels: number[] | undefined;
  if (levelsCsv !== undefined) {
    const parsed = levelsCsv.split(',').map((s) => Number(s.trim()));
    if (parsed.some((n) => !Number.isInteger(n) || n < 0)) {
      return badRequest('levels must be a comma-separated list of non-negative integers');
    }
    levels = parsed;
  } else if (level !== undefined) {
    levels = [level];
  }

  return queryLogsService({
    levels,
    source: parseOptionalString(query['source']),
    tenantId: parseOptionalString(query['tenant_id']),
    requestId: parseOptionalString(query['request_id']),
    from: parseOptionalIso(query['from']),
    to: parseOptionalIso(query['to']),
    q: parseOptionalString(query['q']),
    limit: parseLimit(query['limit']),
    offset: parseOffset(query['offset']),
  });
}
