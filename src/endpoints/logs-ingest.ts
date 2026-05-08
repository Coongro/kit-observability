import { LogLevel } from '@coongro/core-logging';
import type { HttpEndpointContext } from '@coongro/module-core';

import { badRequest, ok, type ApiError } from '../http/response.js';
import { ingestFrontendError } from '../services/logs.service.js';

import { checkRateLimit } from './_lib/rate-limit.js';

interface IngestBody {
  message?: unknown;
  level?: unknown;
  stack?: unknown;
  url?: unknown;
  user_agent?: unknown;
}

// Caps por campo. Trunca en lugar de rechazar para preservar valor forense
// ante errores con stacks o mensajes inesperadamente largos. Equilibrado para
// que un payload completo legítimo entre con holgura, pero un abuso quede
// neutralizado.
const MAX_MESSAGE_BYTES = 4 * 1024;
const MAX_STACK_BYTES = 16 * 1024;
const MAX_URL_BYTES = 2 * 1024;
const MAX_USER_AGENT_BYTES = 2 * 1024;

const RATE_LIMIT = { refillPerMin: 30, burst: 10 } as const;

/**
 * POST /plugins/kit-observability/logs
 *
 * Ingestion de errores del frontend. Auth: 'jwt' — el plugin loader valida JWT
 * y verifica que kit-observability esté instalado en el tenant del usuario,
 * antes de llegar acá.
 *
 * - `tenant_id` y `actor_id` se derivan del JWT (no del body) → previene log
 *   forging cross-tenant.
 * - Levels fuera de [INFO, ERROR] se clampean a ERROR — `fatal` y `debug` no
 *   se aceptan desde el cliente para evitar alert-storm o ruido.
 * - Body con caps de tamaño (truncado, no rechazo) y rate limit por actor.
 */
export function ingestLog(context: HttpEndpointContext): unknown {
  if (!context.user) {
    return badRequest('authenticated user is required');
  }

  const rate = checkRateLimit(`logs-ingest:${context.user.id}`, RATE_LIMIT);
  if (!rate.allowed) {
    return tooManyRequests(rate.retryAfterMs);
  }

  const body = (context.body ?? {}) as IngestBody;
  if (typeof body.message !== 'string' || body.message.trim().length === 0) {
    return badRequest('body.message is required and must be a non-empty string');
  }

  ingestFrontendError({
    message: truncate(body.message.trim(), MAX_MESSAGE_BYTES),
    level: normalizeLevel(body.level),
    stack: typeof body.stack === 'string' ? truncate(body.stack, MAX_STACK_BYTES) : undefined,
    url: typeof body.url === 'string' ? truncate(body.url, MAX_URL_BYTES) : undefined,
    userAgent:
      typeof body.user_agent === 'string'
        ? truncate(body.user_agent, MAX_USER_AGENT_BYTES)
        : undefined,
    tenantId: context.user.tenantId,
    actorId: context.user.id,
  });

  return ok({ queued: true });
}

/**
 * Acepta los 5 niveles del enum LogLevel (10/20/30/40/50). Cualquier otro
 * valor (NaN, fuera de rango, no numérico) cae a ERROR como default razonable.
 * No clampeamos `fatal` ni `debug`: el ingest registra fielmente lo que el
 * cliente reportó. Las decisiones de alerta y filtrado viven en el aggregator
 * y en el sink (minLevel), no acá — clampear en ingest destruye señal que
 * después no se puede reconstruir.
 */
const VALID_LEVELS: ReadonlySet<number> = new Set([
  LogLevel.DEBUG,
  LogLevel.INFO,
  LogLevel.WARN,
  LogLevel.ERROR,
  LogLevel.FATAL,
]);

function normalizeLevel(raw: unknown): number {
  return typeof raw === 'number' && VALID_LEVELS.has(raw) ? raw : LogLevel.ERROR;
}

function truncate(value: string, maxBytes: number): string {
  return value.length > maxBytes ? value.slice(0, maxBytes) : value;
}

function tooManyRequests(retryAfterMs: number): ApiError {
  return {
    error: `rate limit exceeded; retry after ${Math.ceil(retryAfterMs / 1000)}s`,
    code: 429,
  };
}
