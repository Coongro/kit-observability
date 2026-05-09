import { getHostReact } from '@coongro/plugin-sdk';

import { getLevelColors } from '../_shared/lib/levels.js';

const React = getHostReact();
const h = React.createElement;
const { useEffect, useRef, useState } = React;

export interface TimelineChartProps {
  /** Buckets de count, oldest first. */
  data: number[];
  /** LogLevel del issue — define color del trazo y fill. */
  level: number;
  /** True para versión a página completa (más alto). */
  fullPage?: boolean;
  /** Cantidad total de horas que cubren los buckets. Default 24. */
  windowHours?: number;
}

/**
 * Timeline chart con gridlines, peak marker, hover crosshair + tooltip.
 * Aislado del Sparkline simple porque solo se usa en detail panel y agregar
 * todo este chrome al sparkline básico lo haría pesado en las celdas de tabla.
 */
export function TimelineChart({
  data,
  level,
  fullPage = false,
  windowHours = 24,
}: TimelineChartProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [w, setW] = useState(fullPage ? 880 : 540);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    if (!wrapRef.current) return;
    const ro = new ResizeObserver((entries) => {
      const cw = entries[0]?.contentRect.width ?? 0;
      if (cw > 60) setW(cw);
    });
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  const colors = getLevelColors(level);
  const stroke = colors.stroke;
  const fillColor = level >= 30 ? 'rgba(229,176,40,0.18)' : 'rgba(125,176,159,0.18)';
  const errorFill = 'rgba(221,79,52,0.14)';

  const padL = 36;
  const padR = 16;
  const padT = 14;
  const padB = 26;
  const height = fullPage ? 220 : 180;
  const innerW = Math.max(w - padL - padR, 60);
  const innerH = height - padT - padB;
  const max = Math.max(...data, 1);
  const niceMax = niceCeil(max);
  const step = innerW / (data.length - 1 || 1);
  const xy = (v: number, i: number): [number, number] => [
    padL + i * step,
    padT + innerH - (v / niceMax) * innerH,
  ];

  const linePts = data.map((v, i) => xy(v, i).join(',')).join(' ');
  const fillPts = `${padL},${padT + innerH} ${linePts} ${padL + innerW},${padT + innerH}`;
  const peakIdx = data.indexOf(max);
  const yTicks = [0, niceMax / 2, niceMax];

  return h(
    'div',
    {
      ref: wrapRef,
      style: {
        background: 'var(--white)',
        border: '0.5px solid var(--neutral-300)',
        borderRadius: 8,
        padding: '6px 6px 0',
        position: 'relative',
      },
    },
    h(
      'svg',
      {
        width: w,
        height,
        style: { display: 'block', overflow: 'visible' },
        onMouseLeave: () => setHover(null),
        onMouseMove: (e: React.MouseEvent<SVGSVGElement>) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const x = e.clientX - rect.left;
          const idx = Math.round((x - padL) / step);
          setHover(idx >= 0 && idx < data.length ? idx : null);
        },
      },
      ...yTicks.map((t, i) => {
        const y = padT + innerH - (t / niceMax) * innerH;
        return h(
          'g',
          { key: `tick-${i}` },
          h('line', {
            x1: padL,
            x2: padL + innerW,
            y1: y,
            y2: y,
            stroke: i === 0 ? 'var(--neutral-300)' : 'var(--neutral-200)',
            strokeWidth: 0.5,
            strokeDasharray: i === 0 ? undefined : '2 3',
          }),
          h(
            'text',
            {
              x: padL - 8,
              y: y + 3.5,
              textAnchor: 'end',
              style: {
                fontFamily: 'var(--font-mono)',
                fontSize: 9.5,
                fill: 'var(--neutral-500)',
              },
            },
            Math.round(t).toString()
          )
        );
      }),
      h('polygon', {
        points: fillPts,
        fill: level >= 40 ? errorFill : fillColor,
      }),
      h('polyline', {
        points: linePts,
        fill: 'none',
        stroke,
        strokeWidth: 1.5,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
      }),
      ((): React.ReactNode => {
        const [px, py] = xy(max, peakIdx);
        return h(
          'g',
          { key: 'peak' },
          h('circle', { cx: px, cy: py, r: 3.5, fill: stroke }),
          h('circle', {
            cx: px,
            cy: py,
            r: 6,
            fill: 'none',
            stroke,
            strokeOpacity: 0.3,
            strokeWidth: 0.5,
          }),
          h('line', {
            x1: px,
            x2: px,
            y1: py - 8,
            y2: padT - 2,
            stroke,
            strokeWidth: 0.5,
            strokeDasharray: '2 2',
            opacity: 0.6,
          }),
          h(
            'text',
            {
              x: px,
              y: padT - 4,
              textAnchor: 'middle',
              style: {
                fontFamily: 'var(--font-mono)',
                fontSize: 9.5,
                fontWeight: 500,
                fill: stroke,
              },
            },
            `peak ${max}`
          )
        );
      })(),
      hover !== null
        ? ((): React.ReactNode => {
            const [hx, hy] = xy(data[hover], hover);
            return h(
              'g',
              { key: 'hover' },
              h('line', {
                x1: hx,
                x2: hx,
                y1: padT,
                y2: padT + innerH,
                stroke: 'var(--neutral-700)',
                strokeWidth: 0.5,
                strokeDasharray: '2 2',
              }),
              h('circle', {
                cx: hx,
                cy: hy,
                r: 3,
                fill: 'var(--white)',
                stroke,
                strokeWidth: 1.5,
              })
            );
          })()
        : null,
      ...buildXLabels(data.length, windowHours).map((x, i, arr) =>
        h(
          'text',
          {
            key: `xlbl-${i}`,
            x: padL + x.i * step,
            y: padT + innerH + 14,
            textAnchor: i === 0 ? 'start' : i === arr.length - 1 ? 'end' : 'middle',
            style: { fontFamily: 'var(--font-mono)', fontSize: 9.5, fill: 'var(--neutral-500)' },
          },
          x.label
        )
      )
    ),
    hover !== null
      ? ((): React.ReactNode => {
          const [hx] = xy(data[hover], hover);
          const hoursAgo = Math.round(
            (data.length - 1 - hover) * (windowHours / (data.length - 1 || 1))
          );
          return h(
            'div',
            {
              style: {
                position: 'absolute',
                left: Math.min(Math.max(hx - 60, 6), w - 126),
                top: 6,
                background: 'var(--neutral-950)',
                color: 'var(--white)',
                padding: '5px 9px',
                borderRadius: 4,
                fontFamily: 'var(--font-mono)',
                fontSize: 10.5,
                pointerEvents: 'none',
                boxShadow: 'var(--shadow-pop)',
                whiteSpace: 'nowrap',
              },
            },
            h('span', { style: { color: 'var(--gold)' } }, data[hover].toString()),
            h('span', { style: { color: '#8a8a8a' } }, ' events · '),
            h('span', null, `hace ${hoursAgo}h`)
          );
        })()
      : null
  );
}

/** Round-up "agradable" para el max del eje Y: 1, 2, 5 × 10^n. */
function niceCeil(n: number): number {
  const pow = Math.pow(10, Math.floor(Math.log10(n)));
  const x = n / pow;
  if (x <= 1) return pow;
  if (x <= 2) return 2 * pow;
  if (x <= 5) return 5 * pow;
  return 10 * pow;
}

function buildXLabels(bucketCount: number, windowHours: number): { i: number; label: string }[] {
  const stepHours = windowHours / 4;
  return [
    { i: 0, label: `-${windowHours}h` },
    { i: Math.floor(bucketCount / 4), label: `-${Math.round(windowHours - stepHours)}h` },
    { i: Math.floor(bucketCount / 2), label: `-${Math.round(windowHours / 2)}h` },
    { i: Math.floor((3 * bucketCount) / 4), label: `-${Math.round(stepHours)}h` },
    { i: bucketCount - 1, label: 'ahora' },
  ];
}
