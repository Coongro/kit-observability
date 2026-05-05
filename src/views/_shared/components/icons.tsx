// SVG icon library del plugin. Outline 1.25 stroke, currentColor — sigue el
// look del prototype (Observabilidad/) que se mantiene 1:1 hasta el redesign
// global de Coongro. Cualquier icono nuevo del plugin debe agregarse acá
// (no pasar a Lucide ni a DynamicIcon, por requisito del spec COONG-118).

import { getHostReact } from '@coongro/plugin-sdk';

const React = getHostReact();
const h = React.createElement;

// Cada path matchea visualmente con el prototype. Cualquier ajuste debe
// reflejarse acá y NO en copias inline en cada view.
const PATHS: Record<string, () => React.ReactNode> = {
  search: () =>
    h(
      React.Fragment,
      null,
      h('circle', { cx: 11, cy: 11, r: 6.5 }),
      h('path', { d: 'm16 16 4 4' })
    ),
  copy: () =>
    h(
      React.Fragment,
      null,
      h('rect', { x: 8, y: 8, width: 12, height: 12, rx: 2 }),
      h('path', { d: 'M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3' })
    ),
  check: () => h('path', { d: 'm5 12.5 4.5 4.5L19 7.5' }),
  close: () => h('path', { d: 'M6 6l12 12M18 6 6 18' }),
  expand: () => h('path', { d: 'M9 4H4v5M20 4h-5M20 9V4M4 15v5h5M15 20h5v-5' }),
  collapse: () => h('path', { d: 'M9 4v5H4M20 9h-5V4M4 15h5v5M15 20v-5h5' }),
  external: () =>
    h(
      React.Fragment,
      null,
      h('path', { d: 'M10 5H5a1 1 0 0 0-1 1v13a1 1 0 0 0 1 1h13a1 1 0 0 0 1-1v-5' }),
      h('path', { d: 'M14 4h6v6M20 4l-8 8' })
    ),
  chevDown: () => h('path', { d: 'm6 9 6 6 6-6' }),
  chevRight: () => h('path', { d: 'm9 6 6 6-6 6' }),
  chevUp: () => h('path', { d: 'm18 15-6-6-6 6' }),
  play: () => h('path', { d: 'M6 4l14 8L6 20V4Z' }),
  pause: () =>
    h(
      React.Fragment,
      null,
      h('rect', { x: 6, y: 4, width: 4, height: 16, rx: 0.5 }),
      h('rect', { x: 14, y: 4, width: 4, height: 16, rx: 0.5 })
    ),
  refresh: () =>
    h(
      React.Fragment,
      null,
      h('path', { d: 'M4 11a8 8 0 0 1 14-5l2 2' }),
      h('path', { d: 'M20 4v4h-4' }),
      h('path', { d: 'M20 13a8 8 0 0 1-14 5l-2-2' }),
      h('path', { d: 'M4 20v-4h4' })
    ),
  download: () =>
    h(
      React.Fragment,
      null,
      h('path', { d: 'M12 4v12m-5-5 5 5 5-5' }),
      h('path', { d: 'M4 20h16' })
    ),
  filter: () => h('path', { d: 'M4 5h16l-6 8v5l-4 2v-7L4 5Z' }),
  activity: () => h('path', { d: 'M3 12h4l3-8 4 16 3-8h4' }),
  list: () =>
    h(
      React.Fragment,
      null,
      h('path', { d: 'M8 6h12M8 12h12M8 18h12' }),
      h('circle', { cx: 4, cy: 6, r: 0.8, fill: 'currentColor', stroke: 'none' }),
      h('circle', { cx: 4, cy: 12, r: 0.8, fill: 'currentColor', stroke: 'none' }),
      h('circle', { cx: 4, cy: 18, r: 0.8, fill: 'currentColor', stroke: 'none' })
    ),
  bug: () =>
    h(
      React.Fragment,
      null,
      h('path', { d: 'M9 7a3 3 0 0 1 6 0v2H9V7Z' }),
      h('rect', { x: 7, y: 9, width: 10, height: 10, rx: 3 }),
      h('path', { d: 'M4 12h3M17 12h3M5 7l2 2M19 7l-2 2M5 17l2-1M19 17l-2-1' })
    ),
  shield: () => h('path', { d: 'M12 4 5 7v6c0 4 3 6.5 7 8 4-1.5 7-4 7-8V7l-7-3Z' }),
  heart: () =>
    h('path', { d: 'M12 19s-7-4-7-9.5A4.5 4.5 0 0 1 12 6a4.5 4.5 0 0 1 7 3.5C19 15 12 19 12 19Z' }),
  eye: () =>
    h(
      React.Fragment,
      null,
      h('path', { d: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z' }),
      h('circle', { cx: 12, cy: 12, r: 3 })
    ),
  eyeOff: () =>
    h(
      React.Fragment,
      null,
      h('path', {
        d: 'M3 3l18 18M10.5 6.2A10.7 10.7 0 0 1 12 6c6 0 10 6 10 6a17 17 0 0 1-3.3 3.8M6.2 7.8C3.6 9.6 2 12 2 12s4 7 10 7c1.6 0 3-.4 4.3-1',
      })
    ),
  user: () =>
    h(
      React.Fragment,
      null,
      h('circle', { cx: 12, cy: 8, r: 3.5 }),
      h('path', { d: 'M5 20a7 7 0 0 1 14 0' })
    ),
  mute: () =>
    h(
      React.Fragment,
      null,
      h('path', { d: 'M5 9v6h4l5 4V5l-5 4H5Z' }),
      h('path', { d: 'm17 9 4 6m0-6-4 6' })
    ),
  snooze: () =>
    h(
      React.Fragment,
      null,
      h('circle', { cx: 12, cy: 13, r: 7 }),
      h('path', { d: 'M12 9v4l2 2' }),
      h('path', { d: 'M5 4h4l-4 4M19 4h-4l4 4' })
    ),
  code: () => h('path', { d: 'm8 8-5 4 5 4M16 8l5 4-5 4M14 5l-4 14' }),
  arrowUp: () => h('path', { d: 'M12 19V5m-6 6 6-6 6 6' }),
  arrowDown: () => h('path', { d: 'M12 5v14m6-6-6 6-6-6' }),
  link: () =>
    h(
      React.Fragment,
      null,
      h('path', { d: 'M10 14a3 3 0 0 0 4.2 0l3-3a3 3 0 0 0-4.2-4.2l-1 1' }),
      h('path', { d: 'M14 10a3 3 0 0 0-4.2 0l-3 3a3 3 0 0 0 4.2 4.2l1-1' })
    ),
  redacted: () => h('rect', { x: 3, y: 9, width: 18, height: 6, rx: 1 }),
};

export type IconName = keyof typeof PATHS;

export interface ObsIconProps {
  name: IconName;
  size?: number;
  style?: Record<string, string | number>;
  title?: string;
}

const STROKE_PROPS = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.25,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
};

export function ObsIcon({ name, size = 16, style = {}, title }: ObsIconProps) {
  const factory = PATHS[name];
  if (!factory) {
    // Icon desconocido: rect placeholder vacío del tamaño correcto. Evita
    // crash en runtime y deja una pista visual de "icono faltante".
    return h('span', {
      'aria-hidden': true,
      style: { display: 'inline-block', width: size, height: size, ...style },
    });
  }

  return h(
    'svg',
    {
      viewBox: '0 0 24 24',
      width: size,
      height: size,
      style: { display: 'inline-block', flexShrink: 0, ...style },
      'aria-hidden': title ? undefined : true,
      role: title ? 'img' : undefined,
    },
    title ? h('title', null, title) : null,
    h('g', STROKE_PROPS, factory())
  );
}
