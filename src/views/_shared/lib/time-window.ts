// Helpers de ventanas de tiempo para correlacionar eventos relacionados
// (ej: el header DRIFT DETECTED + sus 7 detail lines salen del mismo
// audit pass, dentro de pocos segundos). Pasar al Stream `from`/`to`
// alrededor del `last_seen` del issue captura todos los logs del pase
// completo en un solo filtro.

const DEFAULT_MARGIN_MS = 2 * 60 * 1000;

export interface TimeWindow {
  from: string;
  to: string;
}

/**
 * Devuelve `{from, to}` ISO con un margen alrededor del timestamp dado.
 *
 *   computeWindow('2026-05-07T01:20:59Z', 60_000)
 *   → { from: '2026-05-07T01:19:59Z', to: '2026-05-07T01:21:59Z' }
 *
 * `null` cuando el timestamp no parsea — el caller decide si pasa el
 * filtro o no (mejor que tirar excepción y romper el navigator).
 */
export function computeWindow(
  iso: string | null | undefined,
  marginMs: number = DEFAULT_MARGIN_MS
): TimeWindow | null {
  if (typeof iso !== 'string') return null;
  const center = Date.parse(iso);
  if (!Number.isFinite(center)) return null;
  const margin = Math.max(0, marginMs);
  return {
    from: new Date(center - margin).toISOString(),
    to: new Date(center + margin).toISOString(),
  };
}
