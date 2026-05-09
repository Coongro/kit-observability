// Banda hero con input para "pegá un ID y vé X" — generalización del
// request-id-band del Stream. Pensado para ser el filtro principal de
// vistas centradas en una entidad (Stream → request_id, Trace → trace_id).
//
// Tones disponibles: `gold` (Stream — el original) y `teal` (Trace).
// Cada tone elige fondo, borde de input y color del badge numérico de la
// izquierda. Si surge un tercer caso, se agrega al map sin tocar callers.
//
// El input es controlado-con-buffer: `draft` local que se sincroniza con
// `value` externo via useEffect. Apply on Enter / blur. `null` = sin filtro.

import { getHostReact } from '@coongro/plugin-sdk';

import { ObsIcon } from './icons.js';

const React = getHostReact();
const h = React.createElement;
const { useEffect, useState } = React;

export type IdInputTone = 'gold' | 'teal';

interface ToneStyle {
  bg: string;
  borderInput: string;
  badgeBg: string;
  badgeText: string;
  eyebrow: string;
}

const TONES: Record<IdInputTone, ToneStyle> = {
  gold: {
    bg: 'var(--gold-soft)',
    borderInput: 'var(--gold-deep)',
    badgeBg: 'var(--neutral-950)',
    badgeText: 'var(--gold)',
    eyebrow: 'var(--gold-deep)',
  },
  teal: {
    bg: 'var(--teal-soft)',
    borderInput: 'var(--teal-deep)',
    badgeBg: 'var(--neutral-950)',
    badgeText: 'var(--teal)',
    eyebrow: 'var(--teal-deep)',
  },
};

export interface IdInputBandProps {
  /** Valor actual del filtro. null = sin filtro. */
  value: string | null;
  onChange: (next: string | null) => void;
  /** Texto del eyebrow uppercase (ej: "SEGUIR REQUEST_ID"). */
  label: string;
  /** Placeholder del input. */
  placeholder: string;
  /** Tone visual. Default: gold (Stream). */
  tone?: IdInputTone;
  /** Carácter del badge numérico a la izquierda. Default '1'. */
  badge?: string;
}

export function IdInputBand({
  value,
  onChange,
  label,
  placeholder,
  tone = 'gold',
  badge = '1',
}: IdInputBandProps) {
  const [draft, setDraft] = useState(value ?? '');
  const styles = TONES[tone];

  // Sincroniza con cambios externos (ej: click en un id de la tabla setea
  // el filtro desde afuera). Sin esto, el input quedaría con el valor
  // manual aunque el filtro real haya cambiado.
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
        background: styles.bg,
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
          background: styles.badgeBg,
          color: styles.badgeText,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          fontWeight: 700,
        },
      },
      badge
    ),
    h('div', { className: 't-eyebrow', style: { color: styles.eyebrow } }, label),
    h('input', {
      value: draft,
      onChange: (e: { target: { value: string } }) => setDraft(e.target.value),
      onKeyDown: (e: { key: string }) => {
        if (e.key === 'Enter') apply();
      },
      onBlur: apply,
      placeholder,
      style: {
        flex: 1,
        height: 30,
        padding: '0 12px',
        background: 'var(--white)',
        border: `0.5px solid ${styles.borderInput}`,
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
