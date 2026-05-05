import type { HttpEndpointContext } from '@coongro/module-core';

import { queryTraceById } from '../repositories/spans.js';
import { getRuntimeState } from '../runtime/state.js';

/**
 * GET /plugins/kit-observability/traces?trace_id=<id>
 *
 * Devuelve todos los spans de un trace ordenados por start_time ASC,
 * listos para que el frontend (CW-20) renderice el waterfall.
 *
 * Respuesta:
 *   { trace_id, count, spans[], truncated }
 *
 * Lee de observability.log_spans via el pool systemDatabase (cross-tenant).
 */
export async function getTrace(context: HttpEndpointContext): Promise<unknown> {
  const traceId = context.query['trace_id'];

  if (typeof traceId !== 'string' || traceId.trim().length === 0) {
    return { error: 'trace_id query parameter is required', code: 400 };
  }

  const state = getRuntimeState();
  return queryTraceById(state.systemDb.raw, traceId.trim());
}
