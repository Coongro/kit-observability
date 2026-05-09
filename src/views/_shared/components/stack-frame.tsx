import { getHostReact } from '@coongro/plugin-sdk';

import {
  parseStackFromError as parseStackFromErrorImpl,
  type StackFrameData,
} from '../lib/parse-stack.js';

import { CopyBtn } from './copy-btn.js';
import { ObsIcon } from './icons.js';

const React = getHostReact();
const h = React.createElement;
const { useState } = React;

// Re-exports para preservar el API previo (callers importan
// `parseStackFromError` y `StackFrameData` desde acá). Los tests apuntan
// directo a `./stack-frame-parser.js` para evitar bajar React.
export type { StackFrameData };
export const parseStackFromError = parseStackFromErrorImpl;

export interface StackFrameProps {
  frame: StackFrameData;
  /** True para el primer frame del trace (se highlightea con red-soft). */
  first?: boolean;
}

/**
 * Renderea un frame del stack trace con link a VSCode (vscode://file/...) y
 * botón de copy del path. Reusable entre Issues detail y cualquier vista
 * que muestre stack traces (Trace span errors, Stream entry detail).
 */
export function StackFrame({ frame, first = false }: StackFrameProps) {
  const [hover, setHover] = useState(false);
  const vscodeUrl = `vscode://file/${frame.file}:${frame.line}:${frame.col}`;
  return h(
    'div',
    {
      onMouseEnter: () => setHover(true),
      onMouseLeave: () => setHover(false),
      style: {
        padding: '10px 16px',
        borderBottom: '0.5px solid var(--neutral-300)',
        background: first ? 'var(--red-soft)' : hover ? 'var(--neutral-100)' : 'transparent',
        opacity: frame.app ? 1 : 0.5,
      },
    },
    h(
      'div',
      {
        style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
      },
      h(
        'div',
        { style: { minWidth: 0, flex: 1 } },
        h(
          'div',
          {
            style: {
              fontFamily: 'var(--font-mono)',
              fontSize: 12,
              color: 'var(--neutral-950)',
              fontWeight: 500,
            },
          },
          frame.fn,
          !frame.app
            ? h(
                'span',
                {
                  style: {
                    marginLeft: 8,
                    fontSize: 9.5,
                    fontWeight: 700,
                    color: 'var(--neutral-500)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                  },
                },
                'node_modules'
              )
            : null
        ),
        h(
          'div',
          {
            style: {
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              color: 'var(--neutral-500)',
              marginTop: 2,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            },
          },
          frame.file,
          h('span', { style: { color: 'var(--neutral-700)' } }, `:${frame.line}`),
          `:${frame.col}`
        )
      ),
      h(
        'div',
        { style: { display: 'flex', gap: 4, opacity: hover ? 1 : 0.4 } },
        h(
          'a',
          {
            href: vscodeUrl,
            title: 'abrir en VSCode',
            style: {
              width: 26,
              height: 26,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '0.5px solid var(--neutral-300)',
              borderRadius: 4,
              color: 'var(--neutral-700)',
              textDecoration: 'none',
              background: 'var(--white)',
            },
          },
          h(ObsIcon, { name: 'external', size: 12 })
        ),
        h(CopyBtn, { value: `${frame.file}:${frame.line}`, label: 'copiar path' })
      )
    )
  );
}
