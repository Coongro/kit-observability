// Trace view raíz — composición de TraceHeader + WaterfallFiltersBar +
// WaterfallChart + SpanDetail (side panel, no modal). Acepta el id por:
//
//   1. `views.params.trace_id` (permalink `?view=trace&trace_id=...`)
//   2. Auto-carga del primer trace reciente cuando se entra al menú sin
//      params (matchea el prototype, que siempre tiene un trace activo).
//
// Auto-refresh OFF — el trace es una snapshot. Re-fetch manual desde el
// header. La lógica del waterfall (árbol, filtros, depth, offsets) vive
// en `lib/build-tree.ts` para que sea pura y testeable.

import { getHostReact, usePlugin } from '@coongro/plugin-sdk';

import { getTrace, listRecentTraces, type TraceQueryResult } from '../_shared/api.js';
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
  type TraceTree,
  type WaterfallFilters,
} from './lib/build-tree.js';
import { SpanDetail } from './span-detail.js';
import { TraceHeader } from './trace-header.js';
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

  const fullTree = useMemo<TraceTree | null>(() => {
    if (data === null || data.spans.length === 0) return null;
    return buildTraceTree(data.spans);
  }, [data]);

  const filteredTree = useMemo<TraceTree | null>(() => {
    if (fullTree === null) return null;
    return applyFilters(fullTree, filters);
  }, [fullTree, filters]);

  const selectedNode = useMemo<SpanNode | null>(() => {
    if (filteredTree === null || selectedSpanId === null) return null;
    return findNode(filteredTree.roots, selectedSpanId);
  }, [filteredTree, selectedSpanId]);

  const parentNode = useMemo<SpanNode | null>(() => {
    if (fullTree === null || selectedNode === null) return null;
    const parentId = selectedNode.span.parent_span_id;
    if (parentId === null) return null;
    return findNode(fullTree.roots, parentId);
  }, [fullTree, selectedNode]);

  const onSelectTrace = useCallback((next: string) => {
    setTraceId(next);
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
        minHeight: 0,
        background: 'var(--neutral-100)',
        minWidth: 0,
      },
    },
    h(
      'div',
      {
        style: {
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          minWidth: 0,
          minHeight: 0,
        },
      },
      traceId === null
        ? h(EmptyState, { onSelectTrace })
        : h(LoadedTrace, {
            data,
            fullTree,
            filteredTree,
            loading,
            error,
            filters,
            setFilters,
            onRefresh: () => void refetch(),
            onSelectTrace,
            collapsedIds,
            onToggleCollapse,
            onExpandAll,
            onCollapseAll,
            selectedSpanId,
            setSelectedSpanId,
            traceId,
          })
    ),
    selectedNode !== null && fullTree !== null && traceId !== null
      ? h(SpanDetailPanel, {
          node: selectedNode,
          parentNode,
          traceDurationNs: fullTree.traceDurationNs,
          traceId,
          onSelectParent: (id: string) => setSelectedSpanId(id),
          onClose: () => setSelectedSpanId(null),
        })
      : null
  );
}

function SpanDetailPanel({
  node,
  parentNode,
  traceDurationNs,
  traceId,
  onSelectParent,
  onClose,
}: {
  node: SpanNode;
  parentNode: SpanNode | null;
  traceDurationNs: number;
  traceId: string;
  onSelectParent: (parentSpanId: string) => void;
  onClose: () => void;
}) {
  return h(
    'div',
    {
      style: {
        width: 420,
        flexShrink: 0,
        background: 'var(--white)',
        borderLeft: '0.5px solid var(--neutral-300)',
        boxShadow: '-4px 0 16px rgba(31,31,31,0.04)',
        display: 'flex',
        flexDirection: 'column',
      },
    },
    h(SpanDetail, {
      span: node.span,
      durationNs: node.durationNs,
      inFlight: node.inFlight,
      traceDurationNs,
      parentNode,
      onSelectParent,
      onClose,
      traceId,
    })
  );
}

interface LoadedTraceProps {
  data: TraceQueryResult | null;
  fullTree: TraceTree | null;
  filteredTree: TraceTree | null;
  loading: boolean;
  error: Error | null;
  filters: WaterfallFilters;
  setFilters: (next: WaterfallFilters) => void;
  onRefresh: () => void;
  onSelectTrace: (traceId: string) => void;
  collapsedIds: Set<string>;
  onToggleCollapse: (spanId: string) => void;
  onExpandAll: () => void;
  onCollapseAll: () => void;
  selectedSpanId: string | null;
  setSelectedSpanId: (id: string | null) => void;
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
  onSelectTrace,
  collapsedIds,
  onToggleCollapse,
  onExpandAll,
  onCollapseAll,
  selectedSpanId,
  setSelectedSpanId,
  traceId,
}: LoadedTraceProps) {
  if (error !== null) {
    return h('div', { style: { padding: 22 } }, h(InlineError, { error, onRetry: onRefresh }));
  }

  if (data === null) {
    return h(LoadingState, { loading });
  }

  if (data.spans.length === 0 || fullTree === null) {
    return h(NotFoundState, { traceId, onSelectTrace });
  }

  return h(
    React.Fragment,
    null,
    h(TraceHeader, {
      data,
      tree: fullTree,
      loading,
      onRefresh,
      onSelectTrace,
    }),
    h(WaterfallFiltersBar, {
      filters,
      setFilters,
      onExpandAll,
      onCollapseAll,
      visibleCount: filteredTree?.visibleSpanCount ?? 0,
      totalCount: fullTree.originalSpanCount,
    }),
    filteredTree !== null && filteredTree.visibleSpanCount > 0
      ? h(WaterfallChart, {
          tree: filteredTree,
          selectedSpanId,
          collapsedIds,
          onSelectSpan: (node: SpanNode) => setSelectedSpanId(node.span.span_id),
          onToggleCollapse,
        })
      : h(NoMatchesAfterFilter, {
          onClearFilters: () => setFilters(DEFAULT_WATERFALL_FILTERS),
        }),
    h(ResultsBar, {
      count: filteredTree?.visibleSpanCount ?? 0,
      totalCount: fullTree.originalSpanCount,
      entity: 'spans',
      middle:
        data.truncated === true
          ? 'trace truncado — se muestran los primeros 1000 spans'
          : `duración total ${formatDuration(fullTree.traceDurationNs.toString())}`,
      right: 'orden: start_time ↑',
    })
  );
}

function LoadingState({ loading }: { loading: boolean }) {
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
    loading ? 'cargando spans…' : ''
  );
}

function NotFoundState({
  traceId,
  onSelectTrace,
}: {
  traceId: string;
  onSelectTrace: (traceId: string) => void;
}) {
  return h(
    'div',
    {
      style: {
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 14,
        padding: '60px 22px',
        textAlign: 'center',
      },
    },
    h(
      'div',
      {
        style: { fontFamily: 'var(--font-sans)', fontSize: 14, color: 'var(--neutral-950)' },
      },
      'No encontramos spans para este trace_id.'
    ),
    h(
      'div',
      {
        style: {
          fontFamily: 'var(--font-mono)',
          fontSize: 12,
          color: 'var(--neutral-500)',
          maxWidth: 520,
        },
      },
      `"${traceId}" no existe en log_spans, o sus spans expiraron por retention. Si el request_id existe en log_entries, podés verlo desde Stream.`
    ),
    h(EmptyStateRecents, { onSelectTrace })
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
        flex: 1,
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

function EmptyState({ onSelectTrace }: { onSelectTrace: (traceId: string) => void }) {
  // Cuando no hay trace_id en params, intentamos auto-seleccionar el primer
  // trace reciente. Si la lista falla o está vacía, mostramos un mensaje.
  const { data, loading, error } = useFetch((signal) => listRecentTraces({ signal, limit: 1 }), []);

  useEffect(() => {
    const first = data?.traces[0];
    if (first !== undefined) onSelectTrace(first.trace_id);
  }, [data, onSelectTrace]);

  if (error !== null) {
    return h(
      'div',
      { style: { padding: 22 } },
      h(InlineError, {
        error,
        onRetry: () => {
          /* useFetch lo reintenta cuando cambian deps; acá no tiene refetch propio */
        },
      })
    );
  }

  return h(
    'div',
    {
      style: {
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        gap: 14,
        padding: '60px 22px',
        textAlign: 'center',
      },
    },
    loading
      ? h(
          'div',
          {
            style: {
              fontFamily: 'var(--font-sans)',
              fontSize: 13,
              color: 'var(--neutral-500)',
            },
          },
          'cargando trace inicial…'
        )
      : h(EmptyStateNoTraces),
    !loading ? h(EmptyStateRecents, { onSelectTrace }) : null
  );
}

function EmptyStateNoTraces() {
  return h(
    'div',
    null,
    h(
      'div',
      {
        style: { fontFamily: 'var(--font-sans)', fontSize: 14, color: 'var(--neutral-950)' },
      },
      'Aún no hay traces registrados.'
    ),
    h(
      'div',
      {
        style: {
          fontFamily: 'var(--font-mono)',
          fontSize: 12,
          color: 'var(--neutral-500)',
          marginTop: 6,
        },
      },
      'Generá actividad (un request al API) y volvé a entrar.'
    )
  );
}

function EmptyStateRecents({ onSelectTrace }: { onSelectTrace: (traceId: string) => void }) {
  // Listado embebido para que el usuario tenga algo clickeable cuando entró sin
  // params y el auto-load aún no resolvió, o cuando el trace_id pedido no
  // existe.
  const { data, loading, error } = useFetch(
    (signal) => listRecentTraces({ signal, limit: 10 }),
    []
  );
  // useFetch arranca en null hasta que resuelve; sin esta guarda accederíamos
  // a `null.traces` y crashearíamos el view raíz.
  if (error !== null || loading || data === null || data.traces.length === 0) return null;
  return h(
    'div',
    {
      style: {
        marginTop: 14,
        background: 'var(--white)',
        border: '0.5px solid var(--neutral-300)',
        borderRadius: 8,
        overflow: 'hidden',
        width: '100%',
        maxWidth: 560,
      },
    },
    h(
      'div',
      {
        className: 't-eyebrow',
        style: {
          padding: '10px 14px',
          borderBottom: '0.5px solid var(--neutral-300)',
          background: 'var(--neutral-100)',
          textAlign: 'left',
        },
      },
      'TRACES RECIENTES'
    ),
    ...data.traces.map((t) =>
      h(
        'button',
        {
          key: t.trace_id,
          onClick: () => onSelectTrace(t.trace_id),
          style: {
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '10px 14px',
            width: '100%',
            textAlign: 'left',
            background: 'transparent',
            border: 'none',
            borderBottom: '0.5px solid var(--neutral-300)',
            cursor: 'pointer',
            fontFamily: 'var(--font-sans)',
            fontSize: 12,
            color: 'var(--neutral-950)',
          },
        },
        h(
          'span',
          {
            style: {
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              color: 'var(--neutral-700)',
            },
          },
          `${t.trace_id.slice(0, 12)}…`
        ),
        h(
          'span',
          {
            style: {
              flex: 1,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            },
          },
          t.root_name ?? '—'
        ),
        h(
          'span',
          {
            style: {
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              color: 'var(--neutral-700)',
            },
          },
          formatDuration(t.duration_ns)
        )
      )
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

function findNode(roots: ReadonlyArray<SpanNode>, spanId: string): SpanNode | null {
  for (const root of roots) {
    if (root.span.span_id === spanId) return root;
    const inChildren = findNode(root.children, spanId);
    if (inChildren !== null) return inChildren;
  }
  return null;
}
