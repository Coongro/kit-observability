/**
 * Helpers de parseo de query params para endpoints del plugin.
 * Centralizados para evitar duplicación entre logs-query, issues-update, etc.
 */

export function parseLimit(raw: string | undefined, max = 500, def = 100): number {
  const n = parseInt(raw ?? '', 10);
  if (isNaN(n) || n < 1) return def;
  return Math.min(n, max);
}

export function parseOffset(raw: string | undefined): number {
  const n = parseInt(raw ?? '', 10);
  return isNaN(n) || n < 0 ? 0 : n;
}

export function parseOptionalInt(raw: string | undefined): number | undefined {
  if (raw === undefined || raw === '') return undefined;
  const n = parseInt(raw, 10);
  return isNaN(n) ? undefined : n;
}

export function parseOptionalString(raw: string | undefined): string | undefined {
  return raw && raw.trim().length > 0 ? raw.trim() : undefined;
}

export function parseOptionalIso(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const d = new Date(raw);
  return isNaN(d.getTime()) ? undefined : raw;
}

export function parseOptionalDate(raw: string | undefined): Date | undefined {
  if (!raw) return undefined;
  const d = new Date(raw);
  return isNaN(d.getTime()) ? undefined : d;
}

/**
 * Parsea un query param que puede venir como CSV (`open,resolved`) o un
 * único valor (`open`), validando contra el set de valores permitidos.
 *
 * Devuelve:
 *   - `undefined` si el param viene vacío/no presente (sin filtro).
 *   - `'invalid'` si alguno de los valores no está en `validValues`.
 *   - Array de valores tipados si todos son válidos.
 *
 * El endpoint debe convertir el `'invalid'` en `400 Bad Request` para que
 * un typo (ej: `?status=opn`) falle ruidosamente en lugar de filtrar todo
 * silenciosamente. Mismo principio que `parseOptionalDate` en audit-query.
 */
export function parseEnumList<T extends string>(
  raw: string | undefined,
  validValues: ReadonlySet<T>
): T[] | undefined | 'invalid' {
  if (raw === undefined || raw.trim() === '') return undefined;
  const parts = raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (parts.length === 0) return undefined;

  const result: T[] = [];
  for (const part of parts) {
    if (!validValues.has(part as T)) return 'invalid';
    result.push(part as T);
  }
  return result;
}
