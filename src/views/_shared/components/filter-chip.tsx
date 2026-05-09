import { getHostReact } from '@coongro/plugin-sdk';

import { ObsIcon } from './icons.js';

const React = getHostReact();
const h = React.createElement;
const { useState } = React;

export interface FilterChipProps {
  label: string;
  /** Texto a la derecha del label (valor activo). */
  value: string;
  /** Si true, pinta el chip en negro (estado "filtro activo"). */
  active?: boolean;
  /** Si false, oculta la flecha de menú. Default true. */
  hasMenu?: boolean;
  onClick?: () => void;
}

/**
 * Chip dense para filtros de listas. Layout: LABEL value ▾.
 * El click es controlado por el caller — el chip no abre menus por sí solo,
 * para que cada filter bar maneje sus propios dropdowns con su estado.
 */
export function FilterChip({
  label,
  value,
  active = false,
  hasMenu = true,
  onClick,
}: FilterChipProps) {
  const [hover, setHover] = useState(false);
  return h(
    'button',
    {
      onClick,
      onMouseEnter: () => setHover(true),
      onMouseLeave: () => setHover(false),
      style: chipStyle(active, hover),
    },
    h(
      'span',
      {
        style: {
          color: active ? 'rgba(255,255,255,0.55)' : 'var(--neutral-500)',
          fontSize: 10.5,
          fontWeight: 500,
          textTransform: 'uppercase',
          letterSpacing: '-0.3px',
        },
      },
      label
    ),
    h('span', { style: { fontWeight: 500 } }, value),
    hasMenu
      ? h(ObsIcon, {
          name: 'chevDown',
          size: 11,
          style: { color: active ? 'rgba(255,255,255,0.6)' : 'var(--neutral-500)' },
        })
      : null
  );
}

export function chipStyle(active: boolean, hover: boolean): Record<string, string | number> {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    height: 26,
    padding: '0 8px 0 9px',
    background: active ? 'var(--neutral-950)' : hover ? 'var(--neutral-200)' : 'var(--white)',
    border: '0.5px solid ' + (active ? 'var(--neutral-950)' : 'var(--neutral-300)'),
    borderRadius: 6,
    color: active ? 'var(--white)' : 'var(--neutral-950)',
    fontFamily: 'var(--font-sans)',
    fontSize: 12,
    fontWeight: 400,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  };
}
