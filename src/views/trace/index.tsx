// Trace view — waterfall horizontal de los spans de un trace_id, con
// drawer lateral de detalle al click en un span. Acepta el id por:
//
//   1. `views.params.trace_id` (permalink `?view=trace&trace_id=...`)
//   2. Selector inicial con lista de recientes y input grande, cuando se
//      entra al menú sin params.
//
// Decisiones del port:
//
//   - Header rico con tenant chip, contadores de spans/errores, "Open in
//     Claude Code" (copia comando MCP) y "Copy as JSON" del trace.
//   - Filtros del waterfall (hide < N ms, only errors, expand/collapse
//     all) — la lógica vive en `lib/build-tree.ts`, el view solo encolla
//     handlers.
//   - SpanDetail como Drawer slide-in lateral. El drawer también muestra
//     los log_entries del mismo request (mismo trace_id en log_entries).
//   - Auto-refresh OFF — el trace es snapshot; refresh manual desde el
//     header.

import { getHostReact, usePlugin } from '@coongro/plugin-sdk';

import { getTrace, type TraceQueryResult } from '../_shared/api.js';
import { Drawer } from '../_shared/components/drawer.js';
import { InlineError } from '../_shared/components/inline-error.js';
import { ResultsBar } from '../_shared/components/results-bar.js';
import { formatDuration } from '../_shared/lib/format-time.js';
import { useFetch } from '../_shared/use-fetch.js';

import {
  applyFilters,
  buildTraceTree,
  collectExpandableIds,
  DEFAULT_WATERFALL_FILTERS,
  type SpanNode,
  type WaterfallFilters,
} from './lib/build-tree.js';
import { SpanDetail } from './span-detail.js';
import { TraceHeader } from './trace-header.js';
import { TraceSelector } from './trace-selector.js';
import { WaterfallChart } from './waterfall-chart.js';
import { WaterfallFiltersBar } from './waterfall-filters.js';

const React = getHostReact();
const h = React.createElement;
const { useCallback, useEffect, useMemo, useState } = React;

export function TraceView() {
  const { views } = usePlugin();
  const initialTraceId = readTraceIdFromParams(views.params);

  const [traceId, setTraceId] = useState<string | null>(initialTraceId);
  const [selectedSpanId, setSelectedSpanId] = useState<string | null>(null);
  const [filters, setFilters] = useState<WaterfallFilters>(DEFAULT_WATERFALL_FILTERS);
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());

  // Si los params del view cambian (navegación a otro trace_id sin
  // recargar la página), sincronizamos el state local.
  useEffect(() => {
    const fromParams = readTraceIdFromParams(views.params);
    if (fromParams !== null && fromParams !== traceId) {
      setTraceId(fromParams);
      setSelectedSpanId(null);
      setCollapsedIds(new Set());
    }
  }, [views.params, traceId]);

  const { data, loading, error, refetch } = useFetch<TraceQueryResult | null>(
    async (signal) => {
      if (traceId === null) return null;
      return await getTrace(traceId, { signal });
    },
    [traceId]
  );

  const fullTree = useMemo(() => {
    if (data === null || data.spans.length === 0) return null;
    return buildTraceTree(data.spans);
  }, [data]);

  const filteredTree = useMemo(() => {
    if (fullTree === null) return null;
    return applyFilters(fullTree, filters);
  }, [fullTree, filters]);

  const selectedNode = useMemo<SpanNode | null>(() => {
    if (filteredTree === null || selectedSpanId === null) return null;
    return findNode(filteredTree.roots, selectedSpanId);
  }, [filteredTree, selectedSpanId]);

  const onSelectTrace = useCallback((next: string) => {
    setTraceId(next);
    setSelectedSpanId(null);
    setCollapsedIds(new Set());
    setFilters(DEFAULT_WATERFALL_FILTERS);
  }, []);

  const onClearTrace = useCallback(() => {
    setTraceId(null);
    setSelectedSpanId(null);
    setCollapsedIds(new Set());
    setFilters(DEFAULT_WATERFALL_FILTERS);
  }, []);

  const onExpandAll = useCallback(() => setCollapsedIds(new Set()), []);
  const onCollapseAll = useCallback(() => {
    if (fullTree === null) return;
    setCollapsedIds(new Set(collectExpandableIds(fullTree)));
  }, [fullTree]);

  const onToggleCollapse = useCallback((spanId: string) => {
    setCollapsedIds((prev: Set<string>) => {
      const next = new Set(prev);
      if (next.has(spanId)) next.delete(spanId);
      else next.add(spanId);
      return next;
    });
  }, []);

  return h(
    'div',
    {
      style: {
        display: 'flex',
        flex: 1,
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        minHeight: 0,
        background: 'var(--neutral-100)',
      },
    },
    traceId === null
      ? h(TraceSelector, { onSelect: onSelectTrace })
      : h(LoadedTrace, {
          data,
          fullTree,
          filteredTree,
          loading,
          error,
          filters,
          setFilters,
          onRefresh: () => void refetch(),
          onClear: onClearTrace,
          collapsedIds,
          onToggleCollapse,
          onExpandAll,
          onCollapseAll,
          selectedSpanId,
          setSelectedSpanId,
          selectedNode,
          traceId,
        })
  );
}

interface LoadedTraceProps {
  data: TraceQueryResult | null;
  fullTree: ReturnType<typeof buildTraceTree> | null;
  filteredTree: ReturnType<typeof buildTraceTree> | null;
  loading: boolean;
  error: Error | null;
  filters: WaterfallFilters;
  setFilters: (next: WaterfallFilters) => void;
  onRefresh: () => void;
  onClear: () => void;
  collapsedIds: Set<string>;
  onToggleCollapse: (spanId: string) => void;
  onExpandAll: () => void;
  onCollapseAll: () => void;
  selectedSpanId: string | null;
  setSelectedSpanId: (id: string | null) => void;
  selectedNode: SpanNode | null;
  traceId: string;
}

function LoadedTrace({
  data,
  fullTree,
  filteredTree,
  loading,
  error,
  filters,
  setFilters,
  onRefresh,
  onClear,
  collapsedIds,
  onToggleCollapse,
  onExpandAll,
  onCollapseAll,
  selectedSpanId,
  setSelectedSpanId,
  selectedNode,
  traceId,
}: LoadedTraceProps) {
  if (error !== null) {
    return h('div', { style: { padding: 22 } }, h(InlineError, { error, onRetry: onRefresh }));
  }

  if (data === null || fullTree === null) {
    return h(LoadingOrEmpty, { loading, traceId });
  }

  const visibleCount = filteredTree?.totalSpans ?? 0;

  return h(
    React.Fragment,
    null,
    h(TraceHeader, {
      data,
      tree: fullTree,
      loading,
      onRefresh,
      onClear,
    }),
    h(WaterfallFiltersBar, {
      filters,
      setFilters,
      onExpandAll,
      onCollapseAll,
      visibleCount,
      totalCount: fullTree.totalSpans,
    }),
    h(
      'div',
      { style: { flex: 1, minHeight: 0, overflow: 'auto', padding: '18px 22px' } },
      filteredTree !== null && filteredTree.totalSpans > 0
        ? h(WaterfallChart, {
            tree: filteredTree,
            selectedSpanId,
            collapsedIds,
            onSelectSpan: (node: SpanNode) => setSelectedSpanId(node.span.span_id),
            onToggleCollapse,
          })
        : h(NoMatchesAfterFilter, {
            onClearFilters: () => setFilters(DEFAULT_WATERFALL_FILTERS),
          })
    ),
    h(ResultsBar, {
      count: visibleCount,
      totalCount: fullTree.totalSpans,
      entity: 'spans',
      middle:
        data.truncated === true
          ? 'trace truncado — se muestran los primeros 1000 spans'
          : `duración total ${formatDuration(fullTree.traceDurationNs.toString())}`,
      right: 'orden: start_time ↑',
    }),
    h(
      Drawer,
      {
        open: selectedNode !== null,
        onClose: () => setSelectedSpanId(null),
        title: h('div', { className: 't-eyebrow' }, 'SPAN SELECCIONADO'),
        width: 520,
      },
      selectedNode !== null
        ? h(SpanDetail, {
            span: selectedNode.span,
            durationNs: selectedNode.durationNs,
            inFlight: selectedNode.inFlight,
            traceId,
          })
        : null
    )
  );
}

function LoadingOrEmpty({ loading, traceId }: { loading: boolean; traceId: string }) {
  return h(
    'div',
    {
      style: {
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--neutral-500)',
        fontFamily: 'var(--font-sans)',
        fontSize: 13,
      },
    },
    loading ? 'cargando spans…' : `no hay spans para trace_id "${traceId}".`
  );
}

function NoMatchesAfterFilter({ onClearFilters }: { onClearFilters: () => void }) {
  return h(
    'div',
    {
      style: {
        padding: '60px 22px',
        textAlign: 'center',
        color: 'var(--neutral-500)',
        fontFamily: 'var(--font-sans)',
        fontSize: 13,
      },
    },
    h('div', { style: { marginBottom: 12 } }, 'ningún span pasa los filtros activos.'),
    h(
      'button',
      { className: 'btn btn-secondary btn-sm', onClick: onClearFilters },
      'limpiar filtros'
    )
  );
}

function readTraceIdFromParams(params: unknown): string | null {
  if (params === null || typeof params !== 'object') return null;
  const value = (params as Record<string, unknown>).trace_id;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function findNode(roots: SpanNode[], spanId: string): SpanNode | null {
  for (const root of roots) {
    if (root.span.span_id === spanId) return root;
    const inChildren = findNode(root.children, spanId);
    if (inChildren !== null) return inChildren;
  }
  return null;
}
