// Banda gold-soft con input grande para "seguir un request_id" — la pieza
// más distintiva del Stream view. El prototype la trata como hero filter
// porque pegar un request_id y ver toda la cadena es el caso de uso clave
// al debuggear.
//
// Vive en su propio archivo para que el view raíz quede más legible y
// para poder extraerla a `_shared/components/` si Auditoría/Trace
// terminan necesitando la misma forma (pegar un trace_id, por ejemplo).

import { getHostReact } from '@coongro/plugin-sdk';

import { ObsIcon } from '../_shared/components/icons.js';

const React = getHostReact();
const h = React.createElement;
const { useEffect, useState } = React;

export interface RequestIdBandProps {
  /** Valor actual del filtro. null = sin filtro. */
  value: string | null;
  onChange: (next: string | null) => void;
}

export function RequestIdBand({ value, onChange }: RequestIdBandProps) {
  const [draft, setDraft] = useState(value ?? '');

  // Sincroniza con cambios externos (ej: click en un request_id de la tabla
  // setea el filtro desde afuera). Sin esto, el input quedaría con el
  // valor manual aunque el filtro real haya cambiado.
  useEffect(() => {
    setDraft(value ?? '');
  }, [value]);

  const apply = () => {
    const trimmed = draft.trim();
    onChange(trimmed.length > 0 ? trimmed : null);
  };

  return h(
    'div',
    {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '12px 22px',
        background: 'var(--gold-soft)',
        borderBottom: '0.5px solid var(--neutral-300)',
      },
    },
    h(
      'div',
      {
        style: {
          width: 22,
          height: 22,
          borderRadius: 4,
          background: 'var(--neutral-950)',
          color: 'var(--gold)',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          fontWeight: 700,
        },
      },
      '1'
    ),
    h('div', { className: 't-eyebrow', style: { color: 'var(--gold-deep)' } }, 'SEGUIR REQUEST_ID'),
    h('input', {
      value: draft,
      onChange: (e: { target: { value: string } }) => setDraft(e.target.value),
      onKeyDown: (e: { key: string }) => {
        if (e.key === 'Enter') apply();
      },
      onBlur: apply,
      placeholder: 'pegá un request_id (ej: req_01JR2K7T9V8Q) y vé la cadena completa…',
      style: {
        flex: 1,
        height: 30,
        padding: '0 12px',
        background: 'var(--white)',
        border: '0.5px solid var(--gold-deep)',
        borderRadius: 6,
        fontFamily: 'var(--font-mono)',
        fontSize: 12,
        color: 'var(--neutral-950)',
        outline: 'none',
      },
    }),
    value
      ? h(
          'button',
          {
            onClick: () => onChange(null),
            className: 'btn btn-ghost btn-sm',
            style: { padding: '4px 10px' },
          },
          h(ObsIcon, { name: 'close', size: 12 }),
          h('span', null, 'limpiar')
        )
      : null
  );
}
