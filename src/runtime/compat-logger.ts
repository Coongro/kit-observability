/**
 * Adapter sobre el logger que da el plugin loader del API.
 *
 * Por qué existe: el tipo `ModuleAPI.logger` declara la interfaz `Logger` de
 * `@coongro/core-logging` (que tiene `info/warn/error/debug/fatal`), pero el
 * API real (`apps/api/src/plugins/plugin-runtime.service.ts`) inyecta un
 * logger estilo NestJS (`log/warn/error/debug`) — sin `info`. Llamar
 * `logger.info(...)` directo crashea el activate del plugin con
 * "logger.info is not a function".
 *
 * Trigger concreto para borrar este adapter:
 *   - Cuando `apps/api/src/plugins/plugin-runtime.service.ts` exponga
 *     `info()` en el `activationApi.logger` (igualando la firma del tipo
 *     `Logger` de core-logging). Verificar antes de borrar:
 *     `typeof context.api.logger.info === 'function'` en `activate()`.
 *
 * Comportamiento del fallback: para `error` y `warn` (paths críticos de
 * diagnóstico) cae a `console.error`/`console.warn` con prefijo del plugin
 * — perder error logs sería peor que escribir a console. Para `info` y
 * `debug` cae a noop porque son ruido tolerable y un host minimalista
 * puede no proveerlos.
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

const PLUGIN_PREFIX = '[kit-observability]';

const noop: LoggerCall = () => {};

const consoleError: LoggerCall = (msg, meta) => {
  // eslint-disable-next-line no-console
  console.error(`${PLUGIN_PREFIX} (host logger missing .error)`, msg, meta ?? '');
};

const consoleWarn: LoggerCall = (msg, meta) => {
  // eslint-disable-next-line no-console
  console.warn(`${PLUGIN_PREFIX} (host logger missing .warn)`, msg, meta ?? '');
};

export function adaptLogger(raw: unknown): CompatLogger {
  const r = (raw ?? {}) as MaybeRawLogger;
  // bind(r) preserva el `this` del logger host — sin esto, métodos de clase
  // como Logger.info() llaman `this.dispatch()` con `this` incorrecto y lanzan.
  const b = (fn: unknown): LoggerCall | null =>
    typeof fn === 'function' ? ((fn as LoggerCall).bind(r) as LoggerCall) : null;
  return {
    info: b(r.info) ?? b(r.log) ?? noop,
    debug: b(r.debug) ?? noop,
    warn: b(r.warn) ?? consoleWarn,
    error: b(r.error) ?? consoleError,
  };
}
