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
