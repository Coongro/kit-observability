// Card de métrica con header (title + status), big value, sub line y slot
// extra opcional separado por una línea dashed. Pensado para grids de
// dashboards (Salud hoy; potencialmente Issues/Stream summary cards a
// futuro). El status pinta el dot + label uppercase con la paleta del
// design system.
//
// El estado "comingSoon" desatura el card (opacity reducida + status
// neutral + label "PRÓXIMAMENTE") sin sacarlo del grid — así el layout
// queda estable cuando esos features se implementen y el render real
// reemplace al placeholder.

import { getHostReact } from '@coongro/plugin-sdk';

import type { DotStatus } from './status-dot.js';
import { StatusDot } from './status-dot.js';

const React = getHostReact();
const h = React.createElement;

export type MetricStatus = Exclude<DotStatus, 'neutral'>;

const STATUS_LABEL_COLOR: Record<MetricStatus, string> = {
  ok: 'var(--teal-deep)',
  warn: 'var(--gold-deep)',
  error: 'var(--red-deep)',
};

export interface MetricCardProps {
  title: string;
  /** Si `comingSoon` es true, este valor se ignora. */
  status: MetricStatus;
  /** Cuerpo principal del card (típicamente un BigNumber). */
  big?: React.ReactNode;
  /** Línea secundaria mono-pequeña debajo del big (umbrales, contextos). */
  sub?: React.ReactNode;
  /** Contenido extra debajo de una línea dashed (chart, listas, links). */
  extra?: React.ReactNode;
  /**
   * Marca el card como placeholder de feature pendiente. Reemplaza el
   * status por dot neutral + "PRÓXIMAMENTE", reemplaza big/extra por un
   * mensaje y baja la opacidad. El layout del grid se mantiene.
   */
  comingSoon?: boolean;
  /** Override del mensaje de placeholder. Default: descripción genérica. */
  comingSoonText?: string;
}

export function MetricCard({
  title,
  status,
  big,
  sub,
  extra,
  comingSoon = false,
  comingSoonText,
}: MetricCardProps) {
  return h(
    'div',
    {
      style: {
        background: 'var(--white)',
        border: '0.5px solid var(--neutral-300)',
        borderRadius: 12,
        padding: '18px 18px 16px',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 180,
        opacity: comingSoon ? 0.65 : 1,
      },
    },
    h(
      'div',
      {
        style: {
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 10,
        },
      },
      h('div', { className: 't-eyebrow', style: { fontSize: 10.5 } }, title),
      comingSoon ? h(StatusBadge, { neutral: true }) : h(StatusBadge, { status })
    ),
    comingSoon
      ? h(ComingSoonBody, { text: comingSoonText })
      : h(
          React.Fragment,
          null,
          big ? h('div', { style: { marginTop: 2 } }, big) : null,
          sub
            ? h(
                'div',
                {
                  style: {
                    fontFamily: 'var(--font-mono)',
                    fontSize: 10.5,
                    color: 'var(--neutral-500)',
                    marginTop: 4,
                  },
                },
                sub
              )
            : null,
          extra
            ? h(
                'div',
                {
                  style: {
                    marginTop: 12,
                    paddingTop: 12,
                    borderTop: '0.5px dashed var(--neutral-300)',
                  },
                },
                extra
              )
            : null
        )
  );
}

interface StatusBadgeProps {
  status?: MetricStatus;
  neutral?: boolean;
}

function StatusBadge({ status, neutral = false }: StatusBadgeProps) {
  const label = neutral ? 'PRÓXIMAMENTE' : (status ?? 'ok').toUpperCase();
  const color = neutral ? 'var(--neutral-700)' : STATUS_LABEL_COLOR[status ?? 'ok'];
  return h(
    'span',
    { style: { display: 'inline-flex', alignItems: 'center', gap: 5 } },
    h(StatusDot, { status: neutral ? 'neutral' : (status ?? 'ok'), size: 7 }),
    h(
      'span',
      {
        style: {
          fontFamily: 'var(--font-sans)',
          fontSize: 10.5,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          color,
        },
      },
      label
    )
  );
}

function ComingSoonBody({ text }: { text?: string }) {
  return h(
    'div',
    {
      style: {
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        padding: '18px 6px',
        color: 'var(--neutral-700)',
        fontFamily: 'var(--font-sans)',
        fontSize: 12,
        fontStyle: 'italic',
        lineHeight: 1.5,
      },
    },
    text ?? 'Feature pendiente — el card se completa cuando la métrica esté disponible.'
  );
}
