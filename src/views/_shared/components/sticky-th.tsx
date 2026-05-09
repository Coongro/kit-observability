// `<th>` con sticky-top para tablas con header fijo durante scroll.
// Compartido por Stream y Auditoría — Issues usa una variante propia
// (table layout más denso). Si alguna vez convergen los 3, mover Issues
// a este primitivo.

import { getHostReact } from '@coongro/plugin-sdk';

const React = getHostReact();
const h = React.createElement;

export interface StickyThProps {
  align?: 'left' | 'right';
  /** Padding vertical+horizontal. Default '12px 14px' (audit-style); usar `tight: true` para Stream-style (7px 10px). */
  tight?: boolean;
  children?: React.ReactNode;
}

export function StickyTh({ align = 'left', tight = false, children }: StickyThProps) {
  return h(
    'th',
    {
      style: {
        fontFamily: 'var(--font-sans)',
        fontWeight: 500,
        fontSize: 10.5,
        color: 'var(--neutral-700)',
        textAlign: align,
        padding: tight ? '7px 10px' : '12px 14px',
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        whiteSpace: 'nowrap',
        position: 'sticky',
        top: 0,
        zIndex: 1,
        background: tight ? 'var(--neutral-100)' : 'var(--white)',
        borderBottom: '0.5px solid var(--neutral-300)',
      },
    },
    children
  );
}
