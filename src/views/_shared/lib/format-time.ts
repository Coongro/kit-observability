// Formateo de timestamps consistente entre todas las views del plugin.
// Reusa `@coongro/datetime` para todo lo "absolute time" (Luxon under the
// hood, locale es-AR, output coherente con el resto del producto).
//
// Las únicas piezas que NO delegan al package son:
//   - `relTime` (relativo "hace 5m") — datetime no expone helpers
//     relativos hoy.
//   - `formatDuration` (ns → "150ms") — durations son un dominio aparte
//     de los instantes que cubre datetime.

import { detectBrowserTimezone, formatLocal, formatLocalTime } from '@coongro/datetime';

const HOUR_MS = 60 * 60 * 1000;
const MIN_MS = 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/**
 * Resolución del timezone para los views del plugin.
 *
 * Hoy: TZ del browser (`Intl.DateTimeFormat().resolvedOptions().timeZone`,
 * via helper de `@coongro/datetime`). Internal-tools, así que coincide con
 * la TZ del operador. Cuando se exponga la TZ del tenant en `window.coongro`
 * (p. ej. via `tenants.current.tz`) basta cambiar este getter — los
 * call-sites no se enteran.
 */
function getViewTimezone(): string {
  return detectBrowserTimezone();
}

/**
 * Normaliza el input a Date, evitando lidiar con el tipo branded
 * `UTCTimestamp` que `@coongro/datetime` espera. Los wire types vienen como
 * `string` plano y los timestamps internos como `Date` — esto unifica.
 */
function toDate(input: Date | string): Date {
  return typeof input === 'string' ? new Date(input) : input;
}

/**
 * Tiempo relativo corto, estilo "ahora", "hace 5m", "hace 2h", "hace 3d".
 * Acepta Date o ISO string (los wire types vienen como string).
 */
export function relTime(input: Date | string, now: Date = new Date()): string {
  const diff = now.getTime() - toDate(input).getTime();
  if (diff < 30 * 1000) return 'ahora';
  if (diff < MIN_MS) return `hace ${Math.floor(diff / 1000)}s`;
  if (diff < HOUR_MS) return `hace ${Math.floor(diff / MIN_MS)}m`;
  if (diff < DAY_MS) return `hace ${Math.floor(diff / HOUR_MS)}h`;
  return `hace ${Math.floor(diff / DAY_MS)}d`;
}

/**
 * Tiempo absoluto. Modo corto: HH:mm. Modo largo (`includeDate=true`):
 * dd/MM HH:mm:ss. Locale es-AR. Acepta Date o ISO string.
 *
 * Delega a `@coongro/datetime` para que la representación de hora cruce
 * todas las views del producto consistente (mismo formato que dashboards
 * y otros plugins veterinarios).
 */
export function absTime(input: Date | string, includeDate = false): string {
  const tz = getViewTimezone();
  const date = toDate(input);
  if (!includeDate) {
    return formatLocalTime(date, tz);
  }
  return formatLocal(date, tz, 'dd/MM HH:mm:ss');
}

/**
 * Duración legible desde nanosegundos (forma en que el driver postgres
 * devuelve int8 → string para preservar precisión). Mantiene unidades
 * coherentes: ns < µs < ms < s.
 */
export function formatDuration(durationNs: string | number | null | undefined): string {
  if (durationNs === null || durationNs === undefined) return '—';
  const n = typeof durationNs === 'string' ? Number(durationNs) : durationNs;
  if (!Number.isFinite(n) || n < 0) return '—';
  if (n < 1000) return `${n}ns`;
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}µs`;
  if (n < 1_000_000_000) return `${(n / 1_000_000).toFixed(1)}ms`;
  return `${(n / 1_000_000_000).toFixed(2)}s`;
}
