import { getHostReact } from '@coongro/plugin-sdk';

const React = getHostReact();
const h = React.createElement;

export type DotStatus = 'ok' | 'warn' | 'error' | 'neutral';

const COLORS: Record<DotStatus, string> = {
  ok: 'var(--teal)',
  warn: 'var(--gold)',
  error: 'var(--red)',
  neutral: 'var(--neutral-500)',
};

export interface StatusDotProps {
  status: DotStatus;
  size?: number;
}

export function StatusDot({ status, size = 8 }: StatusDotProps) {
  return h('span', {
    style: {
      width: size,
      height: size,
      borderRadius: '50%',
      background: COLORS[status],
      display: 'inline-block',
      flexShrink: 0,
    },
  });
}
