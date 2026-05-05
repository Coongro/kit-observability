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
 * Query params: level, source, tenant_id, request_id, from (ISO), to (ISO),
 * q, limit, offset.
 */
export async function queryLogsEndpoint(context: HttpEndpointContext): Promise<unknown> {
  const { query } = context;
  const level = parseOptionalInt(query['level']);

  if (level !== undefined && (level < 0 || !Number.isFinite(level))) {
    return badRequest('level must be a non-negative integer');
  }

  return queryLogsService({
    level,
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
