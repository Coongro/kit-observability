// Helper para copiar texto al portapapeles con feedback de éxito real.
//
// Vive separado de `CopyBtn` porque varias views lo consumen sin renderear
// un botón (ej: el botón "Permalink" del page-header de Issues, futuras
// acciones de "copiar URL del trace" en Trace view). Ambas estrategias se
// loguean en console.warn ante fallo para que debugging "no copia" no sea
// una caja negra.

/**
 * Copia `text` al portapapeles devolviendo `true`/`false` según éxito real.
 *
 * Estrategia:
 *   1. Async Clipboard API si está disponible (requiere origen secure:
 *      HTTPS o localhost — falla en `http://app.algo.local`).
 *   2. Fallback `document.execCommand('copy')` con un textarea temporal,
 *      que funciona en orígenes no-secure y navegadores viejos.
 *
 * Los callers usan el booleano para mostrar feedback de éxito condicional;
 * NO mostrar ✓ engañoso cuando la copia falló.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (err) {
      // Loggeamos para que un "no me copia el botón" desde un user
      // específico tenga rastro inspectable (NotAllowedError típicamente
      // por origen inseguro o pérdida de foco). Caemos al fallback.
      // eslint-disable-next-line no-console
      console.warn('[kit-observability] clipboard API failed, using execCommand fallback', err);
    }
  }
  return execCommandFallback(text);
}

function execCommandFallback(text: string): boolean {
  if (typeof document === 'undefined') return false;
  const ta = document.createElement('textarea');
  ta.value = text;
  // `readonly` + estilos off-screen para que el textarea no robe foco
  // visible ni dispare scroll en mobile.
  ta.setAttribute('readonly', '');
  ta.style.position = 'fixed';
  ta.style.top = '0';
  ta.style.left = '0';
  ta.style.opacity = '0';
  ta.style.pointerEvents = 'none';
  document.body.appendChild(ta);
  ta.select();
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[kit-observability] execCommand("copy") threw', err);
    ok = false;
  }
  document.body.removeChild(ta);
  return ok;
}
