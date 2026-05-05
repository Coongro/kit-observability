import type { HttpEndpointContext } from '@coongro/module-core';

import {
  parseEnumList,
  parseLimit,
  parseOffset,
  parseOptionalInt,
  parseOptionalIso,
  parseOptionalString,
} from '../http/parse-filters.js';
import { badRequest } from '../http/response.js';
import { ISSUE_STATUS, type IssueStatus } from '../schema/index.js';
import { queryIssuesService } from '../services/issues.service.js';

const VALID_STATUSES: ReadonlySet<IssueStatus> = new Set(Object.values(ISSUE_STATUS));

/**
 * GET /plugins/kit-observability/logs/issues
 *
 * Query params: level, status (CSV o repetido), tenant_id, source, q,
 * from (ISO), to (ISO), limit, offset.
 *
 * Devuelve issues ordenados por last_seen_at DESC con sparkline 24h y count
 * de tenants afectados por row. La aggregación por fingerprint la hace el
 * pipeline de ingesta — este endpoint solo consulta.
 */
export async function queryIssuesEndpoint(context: HttpEndpointContext): Promise<unknown> {
  const { query } = context;

  const level = parseOptionalInt(query['level']);
  if (level !== undefined && (level < 0 || !Number.isFinite(level))) {
    return badRequest('level must be a non-negative integer');
  }

  const status = parseEnumList<IssueStatus>(query['status'], VALID_STATUSES);
  if (status === 'invalid') {
    return badRequest(`status must be one of: ${[...VALID_STATUSES].join(', ')}`);
  }

  return queryIssuesService({
    level,
    status,
    tenantId: parseOptionalString(query['tenant_id']),
    source: parseOptionalString(query['source']),
    q: parseOptionalString(query['q']),
    from: parseOptionalIso(query['from']),
    to: parseOptionalIso(query['to']),
    limit: parseLimit(query['limit']),
    offset: parseOffset(query['offset']),
  });
}
