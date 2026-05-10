// Extrae un token de búsqueda significativo del mensaje de un log/issue
// para usarlo como `q` (full-text ILIKE) al navegar de Issues→Stream.
//
// Heurística:
//   1. Si el mensaje arranca con `[Tag] ...`, devolvemos exactamente
//      `[Tag]` — convención común en el codebase para identificar el
//      módulo emisor (`[TenantStateAudit]`, `[ModuleLifecycle]`, etc.).
//      Esto agrupa header + sub-mensajes que comparten el tag.
//   2. Si no hay bracket prefix, devolvemos los primeros tokens
//      significativos hasta el primer signo de puntuación o newline,
//      capeado a 24 chars. Útil para mensajes tipo "DRIFT DETECTED in 7
//      tenants" → "DRIFT DETECTED in 7".
//   3. Si el mensaje viene vacío/whitespace, devolvemos null.
//
// Nota: este token es solo un punto de partida — el usuario puede
// borrarlo o reemplazarlo en el search box del Stream. Lo importante es
// que el primer landing tenga un filtro razonable.

const MAX_FALLBACK_LENGTH = 24;
/** Caracteres que cortan el fallback. Excluye `[` `]` para no romper bracket prefixes. */
const FALLBACK_TERMINATOR = /[.,;:\n\r]/;

const BRACKET_PREFIX = /^\s*(\[[^\]\n]+\])/;

export function extractSearchToken(message: string | null | undefined): string | null {
  if (typeof message !== 'string') return null;
  const trimmed = message.trim();
  if (trimmed.length === 0) return null;

  const bracketMatch = BRACKET_PREFIX.exec(trimmed);
  if (bracketMatch !== null) return bracketMatch[1];

  return fallbackHead(trimmed);
}

function fallbackHead(text: string): string | null {
  const cutIdx = text.search(FALLBACK_TERMINATOR);
  const head = cutIdx === -1 ? text : text.slice(0, cutIdx);
  const trimmed = head.trim();
  if (trimmed.length === 0) return null;
  return trimmed.length > MAX_FALLBACK_LENGTH
    ? trimmed.slice(0, MAX_FALLBACK_LENGTH).trim()
    : trimmed;
}
