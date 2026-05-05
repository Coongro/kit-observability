import { getHostReact } from '@coongro/plugin-sdk';

import { ObsIcon } from './icons.js';

const React = getHostReact();
const h = React.createElement;
const { useState } = React;

export interface CopyBtnProps {
  /** Valor a copiar. Strings se copian tal cual; objetos via `JSON.stringify(value, null, 2)`. */
  value: unknown;
  label?: string;
  size?: number;
}

const COPY_FEEDBACK_MS = 1200;

/**
 * Botón inline que copia al portapapeles. Muestra un check verde por
 * `COPY_FEEDBACK_MS` después de copiar como feedback visual.
 *
 * Acepta valores no-string para que el caller no tenga que stringify cada
 * vez (ej: copiar un sample JSON entero).
 */
export function CopyBtn({ value, label = 'copiar', size = 12 }: CopyBtnProps) {
  const [done, setDone] = useState(false);

  const onClick = (e: { stopPropagation: () => void }): void => {
    e.stopPropagation();
    const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
    void copyToClipboard(text).then((ok) => {
      if (!ok) return;
      setDone(true);
      setTimeout(() => setDone(false), COPY_FEEDBACK_MS);
    });
  };

  return h(
    'button',
    {
      onClick,
      title: label,
      style: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '2px 5px',
        background: 'transparent',
        border: '0.5px solid transparent',
        borderRadius: 4,
        cursor: 'pointer',
        color: done ? 'var(--teal-dk)' : 'var(--neutral-500)',
        fontSize: 10,
        fontFamily: 'var(--font-sans)',
        opacity: done ? 1 : 0.7,
      },
      onMouseEnter: (e: { currentTarget: HTMLElement }) => {
        e.currentTarget.style.background = 'var(--neutral-200)';
        e.currentTarget.style.opacity = '1';
      },
      onMouseLeave: (e: { currentTarget: HTMLElement }) => {
        e.currentTarget.style.background = 'transparent';
        e.currentTarget.style.opacity = done ? '1' : '0.7';
      },
    },
    h(ObsIcon, { name: done ? 'check' : 'copy', size })
  );
}

/**
 * Copia al portapapeles devolviendo `true`/`false` según éxito real.
 *
 * Estrategia:
 *   1. Async Clipboard API si está disponible y tenemos focus (requiere
 *      origen secure: HTTPS o localhost — falla en `http://app.algo.local`).
 *   2. Fallback `document.execCommand('copy')` con un textarea temporal.
 *      Funciona en orígenes no-secure y en navegadores viejos.
 *
 * El feedback visual del botón depende del retorno: si NINGUNA estrategia
 * funcionó, no mostramos ✓ engañoso.
 */
async function copyToClipboard(text: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Cae al fallback — algunos navegadores tiran NotAllowedError en
      // orígenes inseguros o cuando el documento perdió foco.
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
  } catch {
    ok = false;
  }
  document.body.removeChild(ta);
  return ok;
}
