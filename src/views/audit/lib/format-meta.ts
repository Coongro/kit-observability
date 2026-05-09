// Formatter compartido para valores de `metadata` en la tabla de auditoría.
// Aislado del componente (MetaSummary) para que el JSON-detail panel u otra
// vista pueda formatear con la misma convención sin importar React.

const STRING_TRUNCATE_AT = 28;

/**
 * Convierte un valor arbitrario de metadata a un string corto para
 * mostrar en chip. Mantiene la heurística simple — si necesitás el
 * valor exacto, hay que ir al JSON detail (próxima iteración).
 *
 * Convención:
 *   - null/undefined → 'null'
 *   - array → `[N]` (longitud)
 *   - object plano → `{…}` (placeholder; no expandimos inline para evitar
 *     row gigantes — es un summary, no un viewer)
 *   - string > 28 chars → trunca con elipsis
 *   - boolean/number → toString
 *   - keys que terminan en `_cents` o `_msat` → reservamos para fmt
 *     monetario en el futuro; por ahora pasthrough numérico
 */
export function formatMetaValue(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (Array.isArray(value)) return `[${value.length}]`;
  if (typeof value === 'object') return '{…}';
  if (typeof value === 'string') {
    return value.length > STRING_TRUNCATE_AT ? `${value.slice(0, STRING_TRUNCATE_AT)}…` : value;
  }
  return String(value);
}
