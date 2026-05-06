// Drawer slide-in lateral (derecha). Reutilizable para detail panels en
// cualquier vista del plugin. Hoy lo usa Trace para SpanDetail; Issues
// y Stream son candidatos naturales si en el futuro queremos detalle
// lateral en lugar de inline.
//
// Características:
//   - Backdrop semitransparente que cierra al click.
//   - Stops propagation dentro del drawer para que clicks internos no
//     disparen el cierre.
//   - z-index alto (10000) para superar UI del host (chrome del shell).
//     Si el host alguna vez expone un primitive de drawer, podemos
//     migrar; por ahora self-contained.
//   - Width configurable, default 480.

import { getHostReact } from '@coongro/plugin-sdk';

import { ObsIcon } from './icons.js';

const React = getHostReact();
const h = React.createElement;

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  /** Header visible arriba del drawer (típicamente título + acciones). */
  title?: React.ReactNode;
  /** Ancho en px. Default 480. */
  width?: number;
  children?: React.ReactNode;
}

export function Drawer({ open, onClose, title, width = 480, children }: DrawerProps) {
  if (!open) return null;
  return h(
    'div',
    {
      onClick: onClose,
      style: {
        position: 'fixed',
        inset: 0,
        background: 'rgba(31,31,31,0.35)',
        zIndex: 10000,
        display: 'flex',
        justifyContent: 'flex-end',
      },
    },
    h(
      'div',
      {
        onClick: (ev: { stopPropagation: () => void }) => ev.stopPropagation(),
        style: {
          width,
          maxWidth: '92vw',
          height: '100%',
          background: 'var(--white)',
          borderLeft: '0.5px solid var(--neutral-300)',
          boxShadow: '-12px 0 32px rgba(31,31,31,0.12)',
          display: 'flex',
          flexDirection: 'column',
          animation: 'obs-drawer-slide-in 180ms ease-out',
        },
      },
      h(
        'div',
        {
          style: {
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 18px',
            borderBottom: '0.5px solid var(--neutral-300)',
            gap: 10,
          },
        },
        h('div', { style: { flex: 1, minWidth: 0 } }, title),
        h(
          'button',
          {
            className: 'btn btn-ghost btn-sm',
            onClick: onClose,
            title: 'cerrar',
            style: { padding: '4px 8px' },
          },
          h(ObsIcon, { name: 'close', size: 13 })
        )
      ),
      h(
        'div',
        { style: { flex: 1, minHeight: 0, overflow: 'auto', padding: '14px 18px' } },
        children
      )
    )
  );
}
