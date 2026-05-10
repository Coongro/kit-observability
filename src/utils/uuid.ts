/**
 * Helpers para validar/coercer UUIDs antes de pasar a columnas `uuid` de Postgres.
 *
 * Por qué centralizado: el sink, el AuditLog y futuros consumidores comparten
 * la misma necesidad — un `$N::uuid` falla todo el INSERT si el valor no es
 * UUID. Tener una sola fuente de verdad evita drift entre validaciones (ej: un
 * regex aceptando lo que otro rechaza) y simplifica futuras decisiones (ej:
 * exigir version/variant bits, o aceptar variantes con uppercase).
 *
 * Match relaxed (no chequea version/variant bits) porque Postgres acepta
 * cualquier UUID con shape 8-4-4-4-12 hex y los tests/scripts sintéticos
 * suelen usar patrones tipo `11111111-2222-3333-4444-555555555555` que no
 * respetan version/variant pero son válidos para la columna `uuid`.
 *
 * NOTA: `fingerprinting/normalize-message.ts` mantiene su regex propio porque
 * el caso de uso es distinto (replace global con flag `g`, sin anchors).
 */

export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True solo si `value` es un string con shape de UUID. */
export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

/**
 * Devuelve el valor si es UUID, sino `null`. Útil para coercer entradas
 * arbitrarias (ej: `context.user.id` que es `string | number`) antes de
 * entregarlas a un INSERT con cast `::uuid`.
 */
export function toUuidOrNull(value: unknown): string | null {
  return isUuid(value) ? value : null;
}
