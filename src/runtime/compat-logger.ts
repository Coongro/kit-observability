/**
 * Adapter sobre el logger que da el plugin loader del API.
 *
 * Por qué existe: el tipo `ModuleAPI.logger` declara la interfaz `Logger` de
 * `@coongro/core-logging` (que tiene `info/warn/error/debug/fatal`), pero el
 * API real (`apps/api/src/plugins/plugin-runtime.service.ts`) inyecta un
 * logger estilo NestJS (`log/warn/error/debug`) — sin `info`.
 *
 * Llamar `logger.info(...)` directo crash el activate del plugin con
 * "logger.info is not a function". Este adapter cubre el gap mapeando
 * `info → log` cuando hace falta, y queda listo para sacar cuando el core
 * unifique la firma (probablemente como parte de COONG-128 o un follow-up).
 *
 * Mientras tanto, todo el código del plugin que loguea desde el activate
 * (bootstrap, registerPartitions) usa esta interfaz mínima.
 */

export interface CompatLogger {
  info: (msg: string, meta?: Record<string, unknown>) => void;
  warn: (msg: string, meta?: Record<string, unknown>) => void;
  error: (msg: string, meta?: Record<string, unknown>) => void;
  debug: (msg: string, meta?: Record<string, unknown>) => void;
}

interface MaybeRawLogger {
  info?: unknown;
  log?: unknown;
  warn?: unknown;
  error?: unknown;
  debug?: unknown;
}

type LoggerCall = (msg: string, meta?: Record<string, unknown>) => void;

function pickCallable(...candidates: unknown[]): LoggerCall {
  for (const c of candidates) {
    if (typeof c === 'function') {
      return c as LoggerCall;
    }
  }
  // Fallback last resort: noop. Nunca debería pasar (al menos `error` o `warn`
  // siempre está presente), pero evita crashear el plugin por logging.
  return () => {};
}

export function adaptLogger(raw: unknown): CompatLogger {
  const r = (raw ?? {}) as MaybeRawLogger;
  return {
    info: pickCallable(r.info, r.log),
    warn: pickCallable(r.warn),
    error: pickCallable(r.error),
    debug: pickCallable(r.debug),
  };
}
