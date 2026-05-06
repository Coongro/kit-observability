// Banner hero de Salud — bloque grande con OK/WARN/ERROR a la izquierda
// y la razón humana a la derecha. La paleta y la copy van a tono con la
// severidad: teal-soft / gold-soft / red-soft.
//
// Vive en views/health porque su layout es muy específico de esta vista
// (hero único, no se reusa en otros dashboards). Si surgiera un segundo
// dashboard con el mismo concepto se generaliza, pero hoy sería YAGNI.

import { getHostReact } from '@coongro/plugin-sdk';

import type { HealthStatus } from '../_shared/lib/derive-health-status.js';

const React = getHostReact();
const h = React.createElement;

const PALETTE: Record<
  HealthStatus,
  { bg: string; border: string; chip: string; chipText: string }
> = {
  ok: {
    bg: 'var(--teal-soft)',
    border: 'var(--teal)',
    chip: 'var(--teal)',
    chipText: 'var(--neutral-950)',
  },
  warn: {
    bg: 'var(--gold-soft)',
    border: 'var(--gold-dk)',
    chip: 'var(--gold)',
    chipText: 'var(--neutral-950)',
  },
  error: {
    bg: 'var(--red-soft)',
    border: 'var(--red)',
    chip: 'var(--red)',
    chipText: 'var(--white)',
  },
};

export interface GlobalStatusBannerProps {
  status: HealthStatus;
  reason: string;
  /** Text mostrado en la columna derecha (uptime, último deploy). Opcional. */
  meta?: { label: string; value: string }[];
  onRecheck?: () => void;
  loading?: boolean;
}

export function GlobalStatusBanner({
  status,
  reason,
  meta = [],
  onRecheck,
  loading = false,
}: GlobalStatusBannerProps) {
  const palette = PALETTE[status];

  return h(
    'div',
    {
      style: {
        display: 'flex',
        alignItems: 'stretch',
        background: palette.bg,
        border: `0.5px solid ${palette.border}`,
        borderRadius: 12,
        overflow: 'hidden',
      },
    },
    h(
      'div',
      {
        style: {
          width: 200,
          padding: '20px 22px',
          background: palette.chip,
          color: palette.chipText,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
        },
      },
      h(
        'div',
        { className: 't-eyebrow', style: { color: 'inherit', opacity: 0.7 } },
        'ESTADO GLOBAL'
      ),
      h(
        'div',
        {
          style: {
            fontFamily: 'var(--font-serif)',
            fontWeight: 900,
            fontSize: 40,
            WebkitTextStroke: '0.3px currentColor',
            letterSpacing: '-1px',
            lineHeight: 1,
            marginTop: 6,
          },
        },
        status.toUpperCase()
      )
    ),
    h(
      'div',
      {
        style: {
          padding: '20px 22px',
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
        },
      },
      h(
        'div',
        {
          className: 't-eyebrow',
          style: { color: status === 'warn' ? 'var(--gold-deep)' : 'var(--neutral-700)' },
        },
        'RAZÓN'
      ),
      h(
        'div',
        {
          style: {
            fontFamily: 'var(--font-sans)',
            fontSize: 14,
            color: 'var(--neutral-950)',
            marginTop: 4,
            maxWidth: 720,
          },
        },
        reason
      )
    ),
    meta.length > 0 || onRecheck
      ? h(
          'div',
          {
            style: {
              padding: '16px 20px',
              borderLeft: '0.5px solid rgba(31,31,31,0.15)',
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
              justifyContent: 'center',
              minWidth: 160,
            },
          },
          ...meta.map((m, idx) =>
            h(
              'span',
              {
                key: `meta-${idx}`,
                style: {
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11,
                  color: 'var(--neutral-700)',
                },
              },
              `${m.label} ${m.value}`
            )
          ),
          onRecheck
            ? h(
                'button',
                {
                  className: 'btn btn-secondary btn-sm',
                  style: { marginTop: 4 },
                  onClick: onRecheck,
                  disabled: loading,
                },
                loading ? 'verificando…' : 'Re-check'
              )
            : null
        )
      : null
  );
}
