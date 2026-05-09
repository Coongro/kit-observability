import { getHostReact } from '@coongro/plugin-sdk';

const React = getHostReact();
const h = React.createElement;

export interface ResultsBarProps {
  count: number;
  totalCount: number;
  /** Label de la entidad listada. Default 'rows'. */
  entity?: string;
  /** Texto extra en el medio (ej: "virtualizada · 30 rows / pantalla"). */
  middle?: string;
  /** Texto a la derecha (ej: "orden: last_seen ↓"). */
  right?: string;
}

/**
 * Footer compacto de tablas con conteos y metadata de orden/paginación.
 * Aparece debajo de Issues, Stream y Auditoría con los mismos estilos.
 */
export function ResultsBar({ count, totalCount, entity = 'rows', middle, right }: ResultsBarProps) {
  return h(
    'div',
    {
      style: {
        height: 30,
        minHeight: 30,
        display: 'flex',
        alignItems: 'center',
        padding: '0 14px',
        gap: 14,
        background: 'var(--white)',
        borderTop: '0.5px solid var(--neutral-300)',
        fontFamily: 'var(--font-mono)',
        fontSize: 10.5,
        color: 'var(--neutral-700)',
      },
    },
    h(
      'span',
      null,
      `${count.toLocaleString('es-AR')} de ${totalCount.toLocaleString('es-AR')} ${entity}`
    ),
    middle ? h('span', { style: { color: 'var(--neutral-500)' } }, `· ${middle}`) : null,
    h('div', { style: { flex: 1 } }),
    right ? h('span', { style: { color: 'var(--neutral-500)' } }, right) : null
  );
}
