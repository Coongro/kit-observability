import { getHostReact } from '@coongro/plugin-sdk';

const React = getHostReact();
const h = React.createElement;

export interface SparklineProps {
  /** Serie de valores oldest-first. */
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  /** Pinta área debajo de la línea con `color` al 12% de opacidad. */
  fill?: boolean;
}

/**
 * Sparkline minimal — sin ejes, sin ticks, sin tooltip. Para timeline rico
 * con tooltips/peak markers ver `TimelineChart` en views/issues/.
 */
export function Sparkline({
  data,
  width = 80,
  height = 18,
  color = 'var(--neutral-700)',
  fill = false,
}: SparklineProps) {
  if (!data || data.length === 0) return null;

  const max = Math.max(...data, 1);
  const step = width / (data.length - 1 || 1);
  const points = data
    .map((v, i) => `${i * step},${height - (v / max) * (height - 2) - 1}`)
    .join(' ');
  const fillPts = `0,${height} ${points} ${width},${height}`;

  return h(
    'svg',
    {
      width,
      height,
      style: { display: 'block', overflow: 'visible' },
      'aria-hidden': true,
    },
    fill ? h('polygon', { points: fillPts, fill: color, fillOpacity: '0.12' }) : null,
    h('polyline', {
      points,
      fill: 'none',
      stroke: color,
      strokeWidth: '1',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    })
  );
}
