import { getHostReact } from '@coongro/plugin-sdk';

import { Redacted } from './redacted.js';

const React = getHostReact();
const h = React.createElement;

export interface JsonTreeProps {
  obj: unknown;
  /** Background del bloque de código. Default: dark. */
  variant?: 'dark' | 'light';
}

/**
 * Pretty-print de un objeto JSON con tipografía mono y tokens de color.
 * Detecta strings con caracteres `▮` y los renderiza como Redacted (placeholder
 * visual de PII), comportamiento heredado del prototype.
 *
 * Reusable por: Issues detail (sample meta), Trace detail (span attributes),
 * Stream detail (event raw).
 */
export function JsonTree({ obj, variant = 'dark' }: JsonTreeProps) {
  const dark = variant === 'dark';
  return h(
    'div',
    {
      style: {
        background: dark ? 'var(--neutral-950)' : 'var(--neutral-100)',
        border: dark ? 'none' : '0.5px solid var(--neutral-300)',
        borderRadius: 8,
        overflow: 'hidden',
      },
    },
    h(
      'pre',
      {
        style: {
          margin: 0,
          padding: '14px 16px',
          fontFamily: 'var(--font-mono)',
          fontSize: 11.5,
          color: dark ? '#e6e6e6' : 'var(--neutral-950)',
          lineHeight: 1.55,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        },
      },
      renderValue(obj, 0, dark)
    )
  );
}

function renderValue(obj: unknown, indent: number, dark: boolean): React.ReactNode {
  if (obj === null || obj === undefined) {
    return h('span', { style: { color: dark ? '#8a8a8a' : 'var(--neutral-500)' } }, 'null');
  }
  if (typeof obj === 'string') {
    if (obj.includes('▮')) {
      return h(
        React.Fragment,
        null,
        h('span', { style: { color: dark ? '#a7dfd3' : 'var(--teal-deep)' } }, '"'),
        h(Redacted, { width: Math.min(obj.length * 6, 90) }),
        h('span', { style: { color: dark ? '#a7dfd3' : 'var(--teal-deep)' } }, '"')
      );
    }
    return h('span', { style: { color: dark ? '#a7dfd3' : 'var(--teal-deep)' } }, `"${obj}"`);
  }
  if (typeof obj === 'number') {
    return h(
      'span',
      { style: { color: dark ? '#FFE29A' : 'var(--gold-deep)' } },
      obj.toLocaleString('es-AR')
    );
  }
  if (typeof obj === 'boolean') {
    return h('span', { style: { color: dark ? '#F28590' : 'var(--red-deep)' } }, String(obj));
  }
  if (Array.isArray(obj)) {
    return h(
      'span',
      null,
      '[ ',
      ...obj.flatMap((v, i) => [
        h(React.Fragment, { key: i }, renderValue(v, indent, dark)),
        i < obj.length - 1 ? ', ' : '',
      ]),
      ' ]'
    );
  }

  const entries = Object.entries(obj as Record<string, unknown>);
  return h(
    'span',
    null,
    '{\n',
    ...entries.flatMap(([k, v], i) => [
      h(React.Fragment, { key: k }, ' '.repeat(indent + 2)),
      h(
        'span',
        { key: `${k}-key`, style: { color: dark ? '#FFC633' : 'var(--gold-dk)' } },
        `"${k}"`
      ),
      h(
        'span',
        { key: `${k}-colon`, style: { color: dark ? '#8a8a8a' : 'var(--neutral-500)' } },
        ': '
      ),
      h(React.Fragment, { key: `${k}-val` }, renderValue(v, indent + 2, dark)),
      i < entries.length - 1 ? ',\n' : '\n',
    ]),
    ' '.repeat(indent),
    '}'
  );
}
