import { getHostReact } from '@coongro/plugin-sdk';

const React = getHostReact();
const h = React.createElement;

export interface PageHeaderProps {
  /** Eyebrow superior, ej: "OBSERVABILIDAD · ERRORES AGRUPADOS". */
  eyebrow: string;
  /** Título grande (Noto Serif JP black). */
  title: string;
  /**
   * Stats inline al lado del título. Cada item se renderiza como
   * `<value> <label>` con el value en color rojo (severities) o neutral.
   */
  stats?: { value: number | string; label: string; tone?: 'danger' | 'neutral' }[];
  /** Botones de acción a la derecha (Export, Permalink, etc.). */
  rightSlot?: React.ReactNode;
}

/**
 * Header reusable para todas las views del plugin (Issues, Stream, Auditoría,
 * Salud). Layout fijo: eyebrow arriba, título + stats al lado, acciones a la
 * derecha. Backed por `--white` con borde inferior `0.5px` siguiendo la
 * convención del prototype.
 */
export function PageHeader({ eyebrow, title, stats = [], rightSlot }: PageHeaderProps) {
  return h(
    'div',
    {
      style: {
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        padding: '18px 22px 14px',
        background: 'var(--white)',
        borderBottom: '0.5px solid var(--neutral-300)',
      },
    },
    h(
      'div',
      null,
      h('div', { className: 't-eyebrow' }, eyebrow),
      h(
        'div',
        {
          style: { display: 'flex', alignItems: 'baseline', gap: 14, marginTop: 4 },
        },
        h('h1', { className: 't-page-title', style: { margin: 0 } }, title),
        ...stats.flatMap((s, idx) => [
          idx > 0
            ? h(
                'span',
                {
                  key: `sep-${idx}`,
                  style: {
                    fontFamily: 'var(--font-sans)',
                    fontSize: 12,
                    color: 'var(--neutral-500)',
                  },
                },
                '·'
              )
            : null,
          h(
            'div',
            {
              key: `stat-${idx}`,
              style: { display: 'flex', alignItems: 'baseline', gap: 6 },
            },
            h(
              'span',
              {
                style: {
                  fontFamily: 'var(--font-serif)',
                  fontWeight: 900,
                  fontSize: 22,
                  WebkitTextStroke: '0.25px currentColor',
                  color: s.tone === 'danger' ? 'var(--red)' : 'var(--neutral-950)',
                  letterSpacing: '-0.5px',
                },
              },
              s.value
            ),
            h(
              'span',
              {
                style: {
                  fontFamily: 'var(--font-sans)',
                  fontSize: 12,
                  color: 'var(--neutral-700)',
                },
              },
              s.label
            )
          ),
        ])
      )
    ),
    rightSlot ? h('div', { style: { display: 'flex', gap: 6 } }, rightSlot) : null
  );
}
