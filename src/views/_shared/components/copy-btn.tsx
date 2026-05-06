// Botón inline que copia al portapapeles con feedback visual:
//   - check verde (`done`) tras copiar exitosamente.
//   - cruz roja (`failed`) cuando el browser rechaza el clipboard.
//
// Sin el feedback de fallo, un click sin reacción dejaba al usuario
// pensando que había copiado cuando no.

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
type FeedbackState = 'idle' | 'done' | 'failed';

export function CopyBtn({ value, label = 'copiar', size = 12 }: CopyBtnProps) {
  const [state, setState] = useState<FeedbackState>('idle');

  const onClick = (e: { stopPropagation: () => void }): void => {
    e.stopPropagation();
    const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
    void copyToClipboard(text).then((ok) => {
      setState(ok ? 'done' : 'failed');
      setTimeout(() => setState('idle'), COPY_FEEDBACK_MS);
    });
  };

  const color =
    state === 'done' ? 'var(--teal-dk)' : state === 'failed' ? 'var(--red)' : 'var(--neutral-500)';
  const iconName = state === 'done' ? 'check' : state === 'failed' ? 'close' : 'copy';
  const title = state === 'failed' ? `${label} (falló — el browser rechazó el clipboard)` : label;

  return h(
    'button',
    {
      onClick,
      title,
      style: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '2px 5px',
        background: 'transparent',
        border: '0.5px solid transparent',
        borderRadius: 4,
        cursor: 'pointer',
        color,
        fontSize: 10,
        fontFamily: 'var(--font-sans)',
        opacity: state === 'idle' ? 0.7 : 1,
      },
      onMouseEnter: (e: { currentTarget: HTMLElement }) => {
        e.currentTarget.style.background = 'var(--neutral-200)';
        e.currentTarget.style.opacity = '1';
      },
      onMouseLeave: (e: { currentTarget: HTMLElement }) => {
        e.currentTarget.style.background = 'transparent';
        e.currentTarget.style.opacity = state === 'idle' ? '0.7' : '1';
      },
    },
    h(ObsIcon, { name: iconName, size })
  );
}
