// Barra de filtros del waterfall: hide < N ms, only errors, expand/
// collapse all. Stateless — el estado vive en el view raíz para que
// "expand all" pueda manipular el set de collapsedIds del Waterfall.

import { getHostReact } from '@coongro/plugin-sdk';

import { ObsIcon } from '../_shared/components/icons.js';

import type { WaterfallFilters } from './lib/build-tree.js';

const React = getHostReact();
const h = React.createElement;

const MIN_DURATION_OPTIONS: { value: number; label: string }[] = [
  { value: 0, label: 'todo' },
  { value: 1, label: '> 1ms' },
  { value: 5, label: '> 5ms' },
  { value: 10, label: '> 10ms' },
  { value: 50, label: '> 50ms' },
];

export interface WaterfallFiltersBarProps {
  filters: WaterfallFilters;
  setFilters: (next: WaterfallFilters) => void;
  onExpandAll: () => void;
  onCollapseAll: () => void;
  /** Cantidad de spans visibles después de aplicar filtros (para feedback). */
  visibleCount: number;
  /** Cantidad total de spans en el trace antes de filtrar. */
  totalCount: number;
}

export function WaterfallFiltersBar({
  filters,
  setFilters,
  onExpandAll,
  onCollapseAll,
  visibleCount,
  totalCount,
}: WaterfallFiltersBarProps) {
  return h(
    'div',
    {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        padding: '10px 22px',
        background: 'var(--neutral-100)',
        borderBottom: '0.5px solid var(--neutral-300)',
        flexWrap: 'wrap',
      },
    },
    h(MinDurationSelect, {
      value: filters.minDurationMs,
      onChange: (next) => setFilters({ ...filters, minDurationMs: next }),
    }),
    h(ErrorsToggle, {
      active: filters.errorsOnly,
      onToggle: () => setFilters({ ...filters, errorsOnly: !filters.errorsOnly }),
    }),
    h(SeparatorBar),
    h(
      'button',
      {
        className: 'btn btn-secondary btn-sm',
        onClick: onExpandAll,
        title: 'expandir todo el árbol',
      },
      h(ObsIcon, { name: 'chevDown', size: 11 }),
      h('span', null, 'expandir todo')
    ),
    h(
      'button',
      {
        className: 'btn btn-secondary btn-sm',
        onClick: onCollapseAll,
        title: 'colapsar todo el árbol',
      },
      h(ObsIcon, { name: 'chevRight', size: 11 }),
      h('span', null, 'colapsar todo')
    ),
    h(
      'span',
      {
        style: {
          marginLeft: 'auto',
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          color: 'var(--neutral-700)',
        },
      },
      `${visibleCount.toLocaleString('es-AR')} / ${totalCount.toLocaleString('es-AR')} spans`
    )
  );
}

function MinDurationSelect({
  value,
  onChange,
}: {
  value: number;
  onChange: (next: number) => void;
}) {
  return h(
    'label',
    {
      style: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        fontFamily: 'var(--font-sans)',
        fontSize: 11.5,
        color: 'var(--neutral-700)',
      },
    },
    h('span', null, 'duración mínima'),
    h(
      'select',
      {
        value: String(value),
        onChange: (e: { target: { value: string } }) => onChange(Number(e.target.value)),
        style: {
          height: 26,
          padding: '0 8px',
          background: 'var(--white)',
          border: '0.5px solid var(--neutral-300)',
          borderRadius: 4,
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          color: 'var(--neutral-950)',
        },
      },
      ...MIN_DURATION_OPTIONS.map((opt) =>
        h('option', { key: opt.value, value: String(opt.value) }, opt.label)
      )
    )
  );
}

function ErrorsToggle({ active, onToggle }: { active: boolean; onToggle: () => void }) {
  return h(
    'button',
    {
      onClick: onToggle,
      className: active ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm',
      title: 'mostrar solo spans con error',
      style: active
        ? { background: 'var(--red)', borderColor: 'var(--red)', color: 'var(--white)' }
        : undefined,
    },
    h('span', null, active ? '⚠ solo errores · activo' : '⚠ solo errores')
  );
}

function SeparatorBar() {
  return h('span', {
    style: {
      width: 1,
      height: 18,
      background: 'var(--neutral-300)',
      display: 'inline-block',
    },
  });
}
