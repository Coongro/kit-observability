/**
 * Normaliza un mensaje de log reemplazando partes dinámicas con placeholders
 * para que mensajes "del mismo error" colapsen al mismo fingerprint.
 *
 * El orden de los reemplazos importa — UUIDs primero (sino sus dígitos los
 * captura `<num>`), después IPs (antes que numbers genéricos), después hex,
 * después números.
 */
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const IP_RE = /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g;
const HEX_RE = /\b0x[0-9a-f]+\b/gi;
// Sin word boundaries — queremos que `200ms`, `500rem`, `1000px` colapsen al
// mismo placeholder. Trade-off: también matchea dígitos dentro de identifiers
// como `abc1def`, lo cual en logs normalmente también es deseable (colapsa
// versions, ids, etc). UUIDs / IPs / hex se procesan antes así que no
// quedan parcialmente comidos.
const NUM_RE = /\d+/g;

export function normalizeMessage(message: string): string {
  return message
    .replace(UUID_RE, '<uuid>')
    .replace(IP_RE, '<ip>')
    .replace(HEX_RE, '<hex>')
    .replace(NUM_RE, '<num>');
}
