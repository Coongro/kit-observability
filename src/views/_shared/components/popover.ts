// Helpers compartidos para los chips con popover (multi-select, single-select,
// text-input). Vive afuera de los componentes para evitar redefinir el
// click-outside hook y los estilos en cada uno.

import { getHostReact } from '@coongro/plugin-sdk';

const React = getHostReact();
const { useEffect, useRef } = React;

export function popoverStyle() {
  return {
    position: 'absolute' as const,
    top: 30,
    left: 0,
    zIndex: 31,
    minWidth: 180,
    background: 'var(--white)',
    border: '0.5px solid var(--neutral-300)',
    borderRadius: 8,
    boxShadow: 'var(--shadow-pop)',
    overflow: 'hidden' as const,
  };
}

export function optionRow(active: boolean) {
  return {
    display: 'flex' as const,
    alignItems: 'center' as const,
    gap: 8,
    width: '100%',
    padding: '8px 12px',
    background: active ? 'var(--neutral-100)' : 'transparent',
    border: 'none' as const,
    borderBottom: '0.5px solid var(--neutral-300)',
    cursor: 'pointer' as const,
    fontFamily: 'var(--font-sans)',
    fontSize: 12,
    color: 'var(--neutral-950)',
    textAlign: 'left' as const,
  };
}

/**
 * Hook click-outside compartido por los chips con popover. Solo agrega el
 * listener cuando el popover está abierto — evita ruido en componentes
 * densos donde la mayoría de los chips están cerrados al mismo tiempo.
 */
export function usePopover(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open, onClose]);
  return ref;
}
