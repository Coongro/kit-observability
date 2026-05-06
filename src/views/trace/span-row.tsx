// Una fila del waterfall — label indentada por depth + barra posicionada
// con offsetFraction/widthFraction. Click la marca como seleccionada y
// avisa al view raíz para abrir el SpanDetail panel.

import { getHostReact } from '@coongro/plugin-sdk';

import { ObsIcon } from '../_shared/components/icons.js';
import { formatDuration } from '../_shared/lib/format-time.js';

import type { SpanNode } from './lib/build-tree.js';
import { spanBarBackgroundColor, spanBarColor } from './lib/span-color.js';

const React = getHostReact();
const h = React.createElement;

const ROW_HEIGHT = 26;
const LABEL_COL_WIDTH = 320;
const DEPTH_INDENT = 14;

export interface SpanRowProps {
  node: SpanNode;
  selected: boolean;
  collapsed: boolean;
  onSelect: () => void;
  onToggleCollapse: () => void;
}

export function SpanRow({ node, selected, collapsed, onSelect, onToggleCollapse }: SpanRowProps) {
  return h(
    'div',
    {
      onClick: onSelect,
      style: {
        display: 'grid',
        gridTemplateColumns: `${LABEL_COL_WIDTH}px 1fr`,
        height: ROW_HEIGHT,
        alignItems: 'center',
        cursor: 'pointer',
        background: selected ? 'var(--neutral-100)' : 'transparent',
        borderBottom: '0.5px solid var(--neutral-300)',
      },
    },
    h(SpanLabel, { node, collapsed, onToggleCollapse }),
    h(SpanBar, { node })
  );
}

function SpanLabel({
  node,
  collapsed,
  onToggleCollapse,
}: {
  node: SpanNode;
  collapsed: boolean;
  onToggleCollapse: () => void;
}) {
  return h(
    'div',
    {
      style: {
        paddingLeft: 14 + node.depth * DEPTH_INDENT,
        paddingRight: 12,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        overflow: 'hidden',
      },
    },
    node.children.length > 0
      ? h(
          'button',
          {
            onClick: (ev: { stopPropagation: () => void }) => {
              ev.stopPropagation();
              onToggleCollapse();
            },
            title: collapsed ? 'expandir' : 'colapsar',
            style: {
              background: 'transparent',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              flexShrink: 0,
            },
          },
          h(ObsIcon, {
            name: collapsed ? 'chevRight' : 'chevDown',
            size: 11,
            style: { color: 'var(--neutral-500)' },
          })
        )
      : h('span', { style: { width: 11, flexShrink: 0 } }),
    h(
      'span',
      {
        style: {
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          color: 'var(--neutral-950)',
          fontWeight: node.depth === 0 ? 600 : 400,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        },
      },
      node.span.name
    ),
    node.span.kind
      ? h(
          'span',
          {
            style: {
              fontFamily: 'var(--font-mono)',
              fontSize: 9.5,
              color: 'var(--neutral-500)',
              padding: '1px 5px',
              border: '0.5px solid var(--neutral-300)',
              borderRadius: 3,
              flexShrink: 0,
            },
          },
          node.span.kind
        )
      : null
  );
}

function SpanBar({ node }: { node: SpanNode }) {
  const offsetPct = `${(node.offsetFraction * 100).toFixed(2)}%`;
  const widthPct = `${(node.widthFraction * 100).toFixed(2)}%`;
  const color = spanBarColor(node.span);
  const bg = spanBarBackgroundColor(node.span);
  const durationLabel = node.inFlight ? 'in-flight' : formatDuration(node.durationNs.toString());

  return h(
    'div',
    {
      style: {
        position: 'relative',
        height: ROW_HEIGHT,
        marginRight: 16,
        background: bg,
        borderRadius: 3,
        overflow: 'visible',
      },
    },
    h('div', {
      style: {
        position: 'absolute',
        top: 6,
        bottom: 6,
        left: offsetPct,
        width: widthPct,
        minWidth: 2,
        background: color,
        borderRadius: 3,
        opacity: node.inFlight ? 0.5 : 1,
      },
    }),
    h(
      'span',
      {
        style: {
          position: 'absolute',
          top: 4,
          left: `calc(${offsetPct} + ${widthPct} + 6px)`,
          fontFamily: 'var(--font-mono)',
          fontSize: 10.5,
          color: 'var(--neutral-700)',
          whiteSpace: 'nowrap',
          pointerEvents: 'none',
        },
      },
      durationLabel
    )
  );
}
