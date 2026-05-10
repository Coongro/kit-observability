import { getHostReact } from '@coongro/plugin-sdk';

const React = getHostReact();
const h = React.createElement;

export interface RedactedProps {
  width?: number;
  /** Texto del tooltip — explicita por qué el valor está oculto. */
  label?: string;
}

/**
 * Placeholder visual para valores PII redactados. NO renderea el string
 * `[REDACTED]` para que el ojo no lo confunda con texto normal — la
 * grilla diagonal grita "esto está intencionalmente oculto".
 */
export function Redacted({ width = 56, label = 'redactado por seguridad' }: RedactedProps) {
  return h('span', {
    title: label,
    style: {
      display: 'inline-block',
      verticalAlign: '-2px',
      width,
      height: 10,
      background:
        'repeating-linear-gradient(135deg, var(--neutral-500) 0 3px, var(--neutral-300) 3px 6px)',
      borderRadius: 2,
      cursor: 'help',
      opacity: 0.7,
    },
  });
}
