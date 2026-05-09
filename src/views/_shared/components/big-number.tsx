// Número grande estilo serif-bold con unidad opcional al lado. Usado en
// el dashboard de Salud para los KPIs (queue lag, errores, etc.) y
// pensado para reuso en otros dashboards futuros del plugin.
//
// El styling matchea el del prototype: serif extra-bold con stroke fino y
// tracking negativo. La unidad va en color neutral más chico, baseline-aligned.

import { getHostReact } from '@coongro/plugin-sdk';

const React = getHostReact();
const h = React.createElement;

export interface BigNumberProps {
  /** Número o string ya formateado. Si es number, se localiza con es-AR. */
  value: number | string;
  /** Unidad opcional al lado (ej: "ms", "/24"). */
  unit?: string;
  /** Tamaño del número grande. Default 36. */
  size?: number;
  /** Override del color del número. Default `var(--neutral-950)`. */
  color?: string;
}

export function BigNumber({ value, unit, size = 36, color }: BigNumberProps) {
  const unitSize = Math.max(12, Math.round(size * 0.5));
  return h(
    'div',
    {
      style: {
        display: 'inline-flex',
        alignItems: 'baseline',
        gap: 4,
        fontFamily: 'var(--font-serif)',
        fontWeight: 900,
        WebkitTextStroke: '0.3px currentColor',
        letterSpacing: '-1px',
        color: color ?? 'var(--neutral-950)',
        lineHeight: 1,
      },
    },
    h(
      'span',
      { style: { fontSize: size } },
      typeof value === 'number' ? value.toLocaleString('es-AR') : value
    ),
    unit
      ? h(
          'span',
          {
            style: {
              fontSize: unitSize,
              color: 'var(--neutral-700)',
              WebkitTextStroke: '0.2px currentColor',
            },
          },
          unit
        )
      : null
  );
}
