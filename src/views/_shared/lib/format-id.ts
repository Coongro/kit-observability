// Helpers para mostrar IDs largos (UUIDs, fingerprints, span IDs) en
// celdas y chips densos. Centralizados para que el formato sea
// consistente: si en algún momento decidimos cambiar el separador o el
// número de chars visibles, se cambia en un solo lugar.

/**
 * Acorta un identificador a `prefix…suffix` cuando supera el largo total.
 * Devuelve el ID intacto si ya es corto.
 *
 * Default: 8 chars al inicio + … + 4 chars al final, con threshold 12.
 * Diseñado para UUIDs (`xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`) — los
 * primeros 8 son discriminantes; los últimos 4 ayudan a verificar.
 */
export function shortenId(id: string, prefix = 8, suffix = 4, threshold = 12): string {
  if (id.length <= threshold) return id;
  return `${id.slice(0, prefix)}…${id.slice(-suffix)}`;
}
