// Toolbar del waterfall según el prototype TraceView.jsx:
// eyebrow + 3 toggles custom (hideUnder con input numérico inline, solo
// errores con dot, agrupar por kind), separador, ghost buttons expandir/
// colapsar todo, contador a la derecha y kind legend.

import { getHostReact } from '@coongro/plugin-sdk';

import type { WaterfallFilters } from './lib/build-tree.js';
import { DISPLAY_KIND_ORDER, KIND_COLOR } from './lib/kind-palette.js';

const React = getHostReact();
const h = React.createElement;
const { useState } = React;

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

const DEFAULT_HIDE_UNDER_MS = 5;

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
        gap: 10,
        padding: '10px 22px',
        background: 'var(--white)',
        borderBottom: '0.5px solid var(--neutral-300)',
        flexWrap: 'wrap',
        rowGap: 8,
      },
    },
    h(
      'span',
      {
        className: 't-eyebrow',
        style: { fontSize: 10, color: 'var(--neutral-500)' },
      },
      'FILTROS DEL WATERFALL'
    ),
    h(HideUnderToggle, {
      value: filters.minDurationMs,
      setValue: (v) => setFilters({ ...filters, minDurationMs: v }),
    }),
    h(ToolbarToggle, {
      active: filters.errorsOnly,
      onClick: () => setFilters({ ...filters, errorsOnly: !filters.errorsOnly }),
      children: [
        h('span', {
          key: 'dot',
          style: {
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: filters.errorsOnly ? 'var(--white)' : 'var(--red)',
          },
        }),
        h('span', { key: 'lbl' }, 'solo errores'),
      ],
    }),
    h(ToolbarToggle, {
      active: filters.groupByKind,
      onClick: () => setFilters({ ...filters, groupByKind: !filters.groupByKind }),
      children: [h('span', { key: 'lbl' }, 'agrupar por kind')],
    }),
    h(SeparatorBar),
    h(GhostBtn, { onClick: onExpandAll }, 'expandir todo'),
    h(
      'span',
      {
        style: { color: 'var(--neutral-500)', fontFamily: 'var(--font-sans)', fontSize: 11 },
      },
      '·'
    ),
    h(GhostBtn, { onClick: onCollapseAll }, 'colapsar todo'),
    h('div', { style: { flex: 1 } }),
    h(
      'span',
      {
        style: {
          fontFamily: 'var(--font-mono)',
          fontSize: 10.5,
          color: 'var(--neutral-500)',
        },
      },
      `${visibleCount.toLocaleString('es-AR')} / ${totalCount.toLocaleString('es-AR')} spans visibles`
    ),
    h(KindLegend)
  );
}

function HideUnderToggle({ value, setValue }: { value: number; setValue: (next: number) => void }) {
  const active = value > 0;
  return h(ToolbarToggle, {
    active,
    onClick: () => setValue(active ? 0 : DEFAULT_HIDE_UNDER_MS),
    children: [
      h('span', { key: 'pre' }, 'ocultar spans <'),
      h('input', {
        key: 'inp',
        type: 'number',
        min: 0,
        max: 500,
        step: 1,
        value: String(value),
        onClick: (e: { stopPropagation: () => void }) => e.stopPropagation(),
        onChange: (e: { target: { value: string } }) => {
          const next = parseInt(e.target.value || '0', 10);
          setValue(Number.isFinite(next) && next >= 0 ? next : 0);
        },
        style: {
          width: 36,
          height: 18,
          margin: '0 2px',
          padding: '0 4px',
          background: 'transparent',
          border: '0.5px solid currentColor',
          borderRadius: 3,
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          color: 'inherit',
          textAlign: 'center',
          outline: 'none',
          MozAppearance: 'textfield',
        },
      }),
      h('span', { key: 'post' }, 'ms'),
    ],
  });
}

function ToolbarToggle({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children?: React.ReactNode;
}) {
  const [hover, setHover] = useState(false);
  return h(
    'button',
    {
      onClick,
      onMouseEnter: () => setHover(true),
      onMouseLeave: () => setHover(false),
      style: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        height: 26,
        padding: '0 9px',
        background: active ? 'var(--neutral-950)' : hover ? 'var(--neutral-200)' : 'var(--white)',
        border: '0.5px solid ' + (active ? 'var(--neutral-950)' : 'var(--neutral-300)'),
        borderRadius: 6,
        color: active ? 'var(--white)' : 'var(--neutral-950)',
        fontFamily: 'var(--font-sans)',
        fontSize: 12,
        cursor: 'pointer',
        whiteSpace: 'nowrap',
      },
    },
    children
  );
}

function GhostBtn({ onClick, children }: { onClick: () => void; children?: React.ReactNode }) {
  return h(
    'button',
    {
      onClick,
      style: {
        height: 26,
        padding: '0 8px',
        background: 'transparent',
        border: 'none',
        fontFamily: 'var(--font-sans)',
        fontSize: 11.5,
        color: 'var(--neutral-700)',
        cursor: 'pointer',
      },
    },
    children
  );
}

function SeparatorBar() {
  return h('div', {
    style: {
      width: 0.5,
      height: 18,
      background: 'var(--neutral-300)',
    },
  });
}

function KindLegend() {
  return h(
    'div',
    {
      style: {
        display: 'inline-flex',
        gap: 10,
        alignItems: 'center',
        paddingLeft: 12,
        borderLeft: '0.5px solid var(--neutral-300)',
        marginLeft: 6,
      },
    },
    ...DISPLAY_KIND_ORDER.map((k) =>
      h(
        'span',
        {
          key: k,
          style: { display: 'inline-flex', alignItems: 'center', gap: 4 },
        },
        h('span', {
          style: {
            width: 10,
            height: 10,
            borderRadius: 2,
            background: KIND_COLOR[k].fill,
          },
        }),
        h(
          'span',
          {
            style: {
              fontFamily: 'var(--font-sans)',
              fontSize: 10.5,
              color: 'var(--neutral-700)',
            },
          },
          k
        )
      )
    )
  );
}
