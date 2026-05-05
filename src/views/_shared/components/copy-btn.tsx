import { getHostReact } from '@coongro/plugin-sdk';

import { copyToClipboard } from '../lib/clipboard.js';

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
