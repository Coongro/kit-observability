import type { HttpEndpointContext } from '@coongro/module-core';

import { badRequest, ok } from '../http/response.js';
import { ingestFrontendError } from '../services/logs.service.js';

interface IngestBody {
  message?: unknown;
  level?: unknown;
  stack?: unknown;
  url?: unknown;
  user_agent?: unknown;
  tenant_id?: unknown;
}

/**
 * POST /plugins/kit-observability/logs
 *
 * Ingestion de errores del frontend. Auth: 'none'.
 * Body: { message, level?, stack?, url?, user_agent?, tenant_id? }
 */
export function ingestLog(context: HttpEndpointContext): unknown {
  const body = (context.body ?? {}) as IngestBody;

  if (typeof body.message !== 'string' || body.message.trim().length === 0) {
    return badRequest('body.message is required and must be a non-empty string');
  }

  ingestFrontendError({
    message: body.message.trim(),
    level: typeof body.level === 'number' ? body.level : undefined,
    stack: typeof body.stack === 'string' ? body.stack : undefined,
    url: typeof body.url === 'string' ? body.url : undefined,
    userAgent: typeof body.user_agent === 'string' ? body.user_agent : undefined,
    tenantId: typeof body.tenant_id === 'string' ? body.tenant_id : undefined,
  });

  return ok({ queued: true });
}
