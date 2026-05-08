// Una fila del waterfall según el prototype: tree column fija con chevron
// rotation + KindBadge + name (mono si db) + service line + bars area con
// tick gridlines y bar coloreada por kind.

import { getHostReact } from '@coongro/plugin-sdk';

import { ObsIcon } from '../_shared/components/icons.js';

import { KindBadge } from './kind-badge.js';
import type { SpanNode } from './lib/build-tree.js';
import { displayKind, spanBarColor } from './lib/kind-palette.js';
import { OTEL_STATUS_CODE_ERROR } from './lib/otel.js';
import {
  WATERFALL_DEPTH_INDENT as DEPTH_INDENT,
  WATERFALL_TICK_COUNT as TICK_COUNT,
  WATERFALL_TREE_COL_WIDTH as TREE_W,
} from './lib/waterfall-layout.js';

const React = getHostReact();
const h = React.createElement;
const { useState } = React;

export interface SpanRowProps {
  node: SpanNode;
  selected: boolean;
  collapsed: boolean;
  onSelect: () => void;
  onToggleCollapse: () => void;
}

export function SpanRow({ node, selected, collapsed, onSelect, onToggleCollapse }: SpanRowProps) {
  const [hover, setHover] = useState(false);
  const { span } = node;
  const dk = displayKind(span);
  const isError = span.status_code === OTEL_STATUS_CODE_ERROR;
  const hasChildren = node.children.length > 0;

  return h(
    'div',
    {
      onMouseEnter: () => setHover(true),
      onMouseLeave: () => setHover(false),
      onClick: onSelect,
      style: {
        display: 'flex',
        position: 'relative',
        background: selected
          ? 'var(--neutral-100)'
          : hover
            ? 'rgba(247,243,235,0.5)'
            : 'var(--white)',
        borderBottom: '0.5px solid var(--neutral-300)',
        cursor: 'pointer',
      },
    },
    selected
      ? h('div', {
          style: {
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: 2,
            background: 'var(--neutral-950)',
          },
        })
      : null,
    h(TreeCol, {
      node,
      dk,
      isError,
      hasChildren,
      collapsed,
      onToggleCollapse,
    }),
    h(BarsCol, { node, isError })
  );
}

function TreeCol({
  node,
  dk,
  isError,
  hasChildren,
  collapsed,
  onToggleCollapse,
}: {
  node: SpanNode;
  dk: ReturnType<typeof displayKind>;
  isError: boolean;
  hasChildren: boolean;
  collapsed: boolean;
  onToggleCollapse: () => void;
}) {
  const isDb = dk === 'db';
  return h(
    'div',
    {
      style: {
        width: TREE_W,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        padding: `7px 14px 7px ${14 + node.depth * DEPTH_INDENT}px`,
        borderRight: '0.5px solid var(--neutral-300)',
        minWidth: 0,
      },
    },
    hasChildren
      ? h(
          'button',
          {
            onClick: (e: { stopPropagation: () => void }) => {
              e.stopPropagation();
              onToggleCollapse();
            },
            title: collapsed ? 'expandir' : 'colapsar',
            style: {
              width: 16,
              height: 16,
              padding: 0,
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--neutral-700)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'transform 120ms',
              transform: collapsed ? 'rotate(0deg)' : 'rotate(90deg)',
              flexShrink: 0,
            },
          },
          h(ObsIcon, { name: 'chevRight', size: 11 })
        )
      : h(
          'span',
          {
            style: {
              width: 16,
              flexShrink: 0,
              display: 'inline-block',
              textAlign: 'center',
              color: 'var(--neutral-300)',
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
            },
          },
          '·'
        ),
    h(KindBadge, { kind: dk }),
    h(
      'div',
      { style: { minWidth: 0, flex: 1 } },
      h(
        'div',
        {
          style: {
            fontFamily: isDb ? 'var(--font-mono)' : 'var(--font-sans)',
            fontSize: isDb ? 11.5 : 12.5,
            fontWeight: 500,
            color: 'var(--neutral-950)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          },
        },
        node.span.name
      ),
      h(
        'div',
        {
          style: {
            fontFamily: 'var(--font-mono)',
            fontSize: 10.5,
            color: 'var(--neutral-500)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          },
        },
        node.span.service_name ?? 'sin service',
        isError
          ? h('span', { style: { color: 'var(--red)', marginLeft: 6, fontWeight: 500 } }, '· error')
          : null
      )
    )
  );
}

function BarsCol({ node, isError }: { node: SpanNode; isError: boolean }) {
  const startPct = node.offsetFraction * 100;
  const widthPct = Math.max(node.widthFraction * 100, 0.3);
  const color = isError ? 'var(--red)' : spanBarColor(node.span);
  const durationLabel = node.inFlight ? 'in-flight' : `${formatMs(node.durationNs)}ms`;

  return h(
    'div',
    {
      style: {
        flex: 1,
        position: 'relative',
        minWidth: 320,
      },
    },
    // Tick gridlines
    ...Array.from({ length: TICK_COUNT }).map((_, i) =>
      h('div', {
        key: `tick-${i}`,
        style: {
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: `${(i / (TICK_COUNT - 1)) * 100}%`,
          width: 0.5,
          background: i === 0 || i === TICK_COUNT - 1 ? 'transparent' : 'var(--neutral-200)',
        },
      })
    ),
    // Bar + duration label como un solo bloque posicionado. El label vive
    // INSIDE la barra al inicio (4px de padding), texto blanco sobre el fill
    // coloreado, con overflow hidden — para barras muy chicas el label se
    // clipea (la duración exacta queda visible en el drawer del span).
    // Anclar el label al inicio en lugar de al final evita que spans cerca
    // del 100% empujen el texto fuera del timeline.
    h(
      'div',
      {
        style: {
          position: 'absolute',
          top: '50%',
          transform: 'translateY(-50%)',
          left: `calc(${startPct}% + 16px)`,
          width: `calc(${widthPct}% - 32px * ${widthPct / 100})`,
          minWidth: 4,
          height: 14,
          background: color,
          borderRadius: 2,
          boxShadow: isError ? 'inset 0 0 0 0.5px var(--red-deep)' : 'none',
          opacity: node.inFlight ? 0.5 : 1,
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          padding: '0 4px',
        },
      },
      h(
        'span',
        {
          style: {
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            color: 'var(--white)',
            fontWeight: 500,
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
            lineHeight: 1,
          },
        },
        durationLabel
      )
    )
  );
}

function formatMs(ns: number): string {
  if (ns < 1_000_000) return (ns / 1_000_000).toFixed(2);
  return Math.round(ns / 1_000_000).toString();
}
