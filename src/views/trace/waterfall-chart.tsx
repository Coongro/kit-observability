// Cascada de spans — header con eje de tiempo + filas por span. La
// indentación visual viene del `depth` precomputado en el árbol y la
// posición/ancho de cada barra de `offsetFraction`/`widthFraction`.
//
// El componente NO hace cálculos de tiempo — todo viene listo del módulo
// `lib/build-tree.ts`. El único cálculo acá es el render de los ticks
// del eje (4 marcas equidistantes).

import { getHostReact } from '@coongro/plugin-sdk';

import { formatDuration } from '../_shared/lib/format-time.js';

import { type SpanNode, type TraceTree, flattenTree } from './lib/build-tree.js';
import { SpanRow } from './span-row.js';

const React = getHostReact();
const h = React.createElement;

const LABEL_COL_WIDTH = 320;
const TICK_COUNT = 4;

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

  return h(
    'div',
    {
      style: {
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--white)',
        border: '0.5px solid var(--neutral-300)',
        borderRadius: 8,
        overflow: 'hidden',
      },
    },
    h(TimeAxisHeader, { traceDurationNs: tree.traceDurationNs }),
    h(
      'div',
      { style: { display: 'flex', flexDirection: 'column' } },
      ...flat.map((node) =>
        h(SpanRow, {
          key: node.span.span_id,
          node,
          selected: node.span.span_id === selectedSpanId,
          collapsed: collapsedIds.has(node.span.span_id),
          onSelect: () => onSelectSpan(node),
          onToggleCollapse: () => onToggleCollapse(node.span.span_id),
        })
      )
    )
  );
}

function TimeAxisHeader({ traceDurationNs }: { traceDurationNs: number }) {
  const ticks = Array.from({ length: TICK_COUNT + 1 }, (_, i) => {
    const fraction = i / TICK_COUNT;
    return {
      fraction,
      label: formatDuration(traceDurationNs * fraction),
    };
  });

  return h(
    'div',
    {
      style: {
        display: 'grid',
        gridTemplateColumns: `${LABEL_COL_WIDTH}px 1fr`,
        height: 28,
        background: 'var(--neutral-100)',
        borderBottom: '0.5px solid var(--neutral-300)',
        alignItems: 'center',
      },
    },
    h(
      'div',
      {
        style: {
          paddingLeft: 14,
          fontFamily: 'var(--font-sans)',
          fontSize: 10.5,
          fontWeight: 500,
          color: 'var(--neutral-700)',
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
        },
      },
      'span'
    ),
    h(
      'div',
      {
        style: {
          position: 'relative',
          height: 28,
          marginRight: 16,
        },
      },
      ...ticks.map((tick, idx) =>
        h(
          'span',
          {
            key: `tick-${idx}`,
            style: {
              position: 'absolute',
              top: 6,
              left: `${(tick.fraction * 100).toFixed(2)}%`,
              transform:
                idx === 0
                  ? 'none'
                  : idx === ticks.length - 1
                    ? 'translateX(-100%)'
                    : 'translateX(-50%)',
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              color: 'var(--neutral-500)',
            },
          },
          tick.label
        )
      )
    )
  );
}
