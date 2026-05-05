// Bloque de error inline con botón de retry, usado por todas las views
// (Issues, Stream, Auditoría, Salud) cuando un fetch falla. Mismo look:
// banda red-soft, mensaje del error vía `formatError` (que ya distingue
// ApiError de Error genérico), botón "reintentar" que el caller cablea
// con su `refetch`.

import { getHostReact } from '@coongro/plugin-sdk';

import { formatError } from '../use-fetch.js';

const React = getHostReact();
const h = React.createElement;

export interface InlineErrorProps {
  error: Error;
  onRetry: () => void;
}

export function InlineError({ error, onRetry }: InlineErrorProps) {
  return h(
    'div',
    {
      style: {
        margin: 22,
        padding: 16,
        background: 'var(--red-soft)',
        border: '0.5px solid var(--red)',
        borderRadius: 8,
        color: 'var(--red-deep)',
        fontFamily: 'var(--font-mono)',
        fontSize: 12,
      },
    },
    h('div', { style: { marginBottom: 10 } }, formatError(error)),
    h('button', { className: 'btn btn-secondary btn-sm', onClick: onRetry }, 'reintentar')
  );
}
