import type { HttpEndpointContext } from '@coongro/module-core';

import { collectHealth } from '../services/health.service.js';

/**
 * GET /plugins/kit-observability/logs/health
 *
 * Devuelve métricas en memoria de DBSink y SpanSink: lag, fallos,
 * último flush, entries perdidas en fail-safe.
 */
export function getHealth(_context: HttpEndpointContext): unknown {
  return collectHealth();
}
