// Cascada del trace según el prototype: tree column fija de 280px con
// border-right + área de barras flex con tick gridlines verticales y
// sticky header con eyebrow "span · service" / "línea de tiempo · 0ms →
// Xms" / "kind · duración".
//
// El componente NO hace cálculos de tiempo — todo viene listo del módulo
// `lib/build-tree.ts`.

import { getHostReact } from '@coongro/plugin-sdk';

import { type SpanNode, type TraceTree, flattenTree } from './lib/build-tree.js';
import { WATERFALL_TICK_COUNT, WATERFALL_TREE_COL_WIDTH } from './lib/waterfall-layout.js';
import { SpanRow } from './span-row.js';

const React = getHostReact();
const h = React.createElement;

export interface WaterfallChartProps {
  tree: TraceTree;
  selectedSpanId: string | null;
  /** IDs de nodos colapsados — sus descendientes no se muestran. */
  collapsedIds: Set<string>;
  onSelectSpan: (node: SpanNode) => void;
  /** Toggle del estado collapsed de un nodo (chevron clickable del SpanRow). */
  onToggleCollapse: (spanId: string) => void;
}

export function WaterfallChart({
  tree,
  selectedSpanId,
  collapsedIds,
  onSelectSpan,
  onToggleCollapse,
}: WaterfallChartProps) {
  const flat = flattenTree(tree, collapsedIds);
  const traceDurationMs = Math.round(tree.traceDurationMs);

  return h(
    'div',
    {
      style: {
        flex: 1,
        minHeight: 0,
        overflow: 'auto',
        background: 'var(--white)',
      },
    },
    h(WaterfallHeader, { traceDurationMs }),
    ...flat.map((node) =>
      h(SpanRow, {
        key: node.span.span_id,
        node,
        selected: node.span.span_id === selectedSpanId,
        collapsed: collapsedIds.has(node.span.span_id),
        onSelect: () => onSelectSpan(node),
        onToggleCollapse: () => onToggleCollapse(node.span.span_id),
      })
    ),
    flat.length === 0
      ? h(
          'div',
          {
            style: {
              padding: '60px 22px',
              textAlign: 'center',
              color: 'var(--neutral-500)',
              fontSize: 13,
            },
          },
          'No hay spans con esos filtros. Probá bajar el umbral de ms.'
        )
      : null
  );
}

function WaterfallHeader({ traceDurationMs }: { traceDurationMs: number }) {
  return h(
    'div',
    {
      style: {
        display: 'flex',
        position: 'sticky',
        top: 0,
        zIndex: 5,
        background: 'var(--neutral-100)',
        borderBottom: '0.5px solid var(--neutral-300)',
      },
    },
    h(
      'div',
      {
        style: {
          width: WATERFALL_TREE_COL_WIDTH,
          flexShrink: 0,
          padding: '8px 14px',
          fontFamily: 'var(--font-sans)',
          fontSize: 10.5,
          fontWeight: 500,
          color: 'var(--neutral-700)',
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          borderRight: '0.5px solid var(--neutral-300)',
        },
      },
      'span · service'
    ),
    h(
      'div',
      { style: { flex: 1, position: 'relative', minWidth: 320 } },
      h(
        'div',
        {
          style: {
            display: 'flex',
            justifyContent: 'space-between',
            padding: '8px 16px',
            fontFamily: 'var(--font-sans)',
            fontSize: 10.5,
            fontWeight: 500,
            color: 'var(--neutral-700)',
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
          },
        },
        h('span', null, `línea de tiempo · 0ms → ${traceDurationMs}ms`),
        h(
          'span',
          {
            style: {
              fontFamily: 'var(--font-mono)',
              textTransform: 'none',
              letterSpacing: 0,
            },
          },
          'kind · duración'
        )
      )
    )
  );
}

/**
 * Tick gridlines verticales — renderizan líneas hairline en el área de barras
 * para que el ojo pueda leer offsets relativos. Se exponen acá para que el
 * SpanRow pueda overlayearlas detrás de la barra.
 */
export function WaterfallTicks({ tickCount }: { tickCount?: number } = {}) {
  const count = tickCount ?? WATERFALL_TICK_COUNT;
  return h(
    'div',
    {
      style: {
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
      },
    },
    ...Array.from({ length: count }).map((_, i) =>
      h('div', {
        key: i,
        style: {
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: `${(i / (count - 1)) * 100}%`,
          width: 0.5,
          background: i === 0 || i === count - 1 ? 'transparent' : 'var(--neutral-200)',
        },
      })
    )
  );
}
