import { getHostReact } from '@coongro/plugin-sdk';

import { getLevelColors, getLevelLabel } from '../lib/levels.js';

const React = getHostReact();
const h = React.createElement;

export interface LevelBadgeProps {
  /** Nivel numérico (LogLevel del core-logging). */
  level: number;
  size?: 'sm' | 'md';
}

export function LevelBadge({ level, size = 'md' }: LevelBadgeProps) {
  const colors = getLevelColors(level);
  const small = size === 'sm';
  return h(
    'span',
    {
      style: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: small ? '1px 5px' : '2px 7px',
        borderRadius: 4,
        background: colors.bg,
        color: colors.fg,
        fontFamily: 'var(--font-sans)',
        fontWeight: 700,
        fontSize: small ? 9.5 : 10.5,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        lineHeight: 1.2,
      },
    },
    h('span', {
      style: {
        width: 4,
        height: 4,
        borderRadius: '50%',
        background: colors.dot,
        opacity: 0.9,
      },
    }),
    getLevelLabel(level)
  );
}
