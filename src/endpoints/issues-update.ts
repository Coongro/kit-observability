import type { HttpEndpointContext } from '@coongro/module-core';

import { badRequest, notFound, ok } from '../http/response.js';
import { isValidStatus, patchIssueStatus } from '../services/issues.service.js';

/**
 * PATCH /plugins/kit-observability/logs/issues
 *
 * Query: id=<uuid>
 * Body:  { status: 'open' | 'resolved' | 'muted' }
 *
 * Nota: el sistema httpEndpoints no soporta path params (:id), se usa query param.
 */
export async function updateIssue(context: HttpEndpointContext): Promise<unknown> {
  const id = context.query['id'];
  if (!id) return badRequest('query param "id" is required');

  const body = (context.body ?? {}) as { status?: unknown };
  if (!isValidStatus(body.status)) {
    return badRequest('body.status must be one of: open, resolved, muted');
  }

  const { found } = await patchIssueStatus(id, body.status, {
    tenantId: context.user?.tenantId,
    actorId:
      context.user?.id !== undefined && context.user.id !== null
        ? String(context.user.id)
        : undefined,
  });
  if (!found) return notFound(`Issue ${id} not found`);

  return ok({ updated: true });
}
