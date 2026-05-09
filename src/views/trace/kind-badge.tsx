// Badge inline coloreado por kind. Lo usan SpanRow (al lado del nombre) y
// SpanDetail (header del drawer).

import { getHostReact } from '@coongro/plugin-sdk';

import { KIND_COLOR, type DisplayKind } from './lib/kind-palette.js';

const React = getHostReact();
const h = React.createElement;

export interface KindBadgeProps {
  kind: DisplayKind;
}

export function KindBadge({ kind }: KindBadgeProps) {
  const style = KIND_COLOR[kind];
  return h(
    'span',
    {
      style: {
        display: 'inline-flex',
        alignItems: 'center',
        padding: '1px 5px',
        borderRadius: 3,
        background: style.soft,
        color: style.deep,
        fontFamily: 'var(--font-sans)',
        fontSize: 9.5,
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
        flexShrink: 0,
      },
    },
    style.label
  );
}
