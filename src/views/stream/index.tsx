// Stream view — log_entries raw en tiempo real, con polling auto-refresh
// y un hero filter para "seguir request_id". Decisiones del port:
//
//   - Polling cada 2s vía useFetch({ refreshInterval }), pausable. 1s del
//     prototype era más agresivo de lo necesario y multiplicaba carga sobre
//     el endpoint cuando hay muchos clients abiertos en /dev/panel.
//   - Filtros via los chips de `_shared/components/` (los mismos que Issues).
//     STATUS no aplica en Stream (solo issues tienen status).
//   - El request_id NO va en la barra de filtros — tiene su propio hero
//     band gold-soft porque es el caso de uso central al debuggear.
//   - No hay `category` (el backend no la guarda en log_entries).

import { getHostReact, usePlugin } from '@coongro/plugin-sdk';

import { queryLogs, type LogEntry } from '../_shared/api.js';
import { ObsIcon } from '../_shared/components/icons.js';
import { InlineError } from '../_shared/components/inline-error.js';
import { PageHeader } from '../_shared/components/page-header.js';
import { ResultsBar } from '../_shared/components/results-bar.js';
import { StickyTh } from '../_shared/components/sticky-th.js';
import { copyToClipboard } from '../_shared/lib/clipboard.js';
import { useFetch } from '../_shared/use-fetch.js';

import { DEFAULT_STREAM_FILTERS, StreamFilterBar, type StreamFilters } from './filter-bar.js';
import { RequestIdBand } from './request-id-band.js';
import { StreamRow } from './stream-row.js';

const React = getHostReact();
const h = React.createElement;
const { useCallback, useMemo, useState } = React;

const POLL_INTERVAL_MS = 2000;
const STREAM_LIMIT = 200;

const RANGE_TO_FROM: Record<StreamFilters['range'], () => string | undefined> = {
  '15m': () => isoAgo(15 * 60 * 1000),
  '1h': () => isoAgo(60 * 60 * 1000),
  '6h': () => isoAgo(6 * 60 * 60 * 1000),
  '24h': () => isoAgo(24 * 60 * 60 * 1000),
};

export function StreamView() {
  const { toast } = usePlugin();
  const [filters, setFilters] = useState<StreamFilters>(DEFAULT_STREAM_FILTERS);
  const [requestIdFilter, setRequestIdFilter] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const fetchArgs = useMemo(
    () => ({
      // El backend hoy acepta level único, no lista. Si todos los niveles
      // están seleccionados (default), no mandamos filtro; si hay un solo
      // nivel seleccionado, lo mandamos. Si hay varios pero no todos,
      // filtramos client-side (caso poco común en Stream).
      level: filters.levels.length === 1 ? filters.levels[0] : undefined,
      tenantId: filters.tenantId ?? undefined,
      source: filters.source ?? undefined,
      requestId: requestIdFilter ?? undefined,
      q: filters.search ?? undefined,
      from: RANGE_TO_FROM[filters.range](),
    }),
    [filters, requestIdFilter]
  );

  const { data, loading, error, refetch } = useFetch(
    (signal) => queryLogs({ ...fetchArgs, signal, limit: STREAM_LIMIT }),
    [fetchArgs],
    { refreshInterval: paused ? undefined : POLL_INTERVAL_MS }
  );

  const entries = useMemo<LogEntry[]>(() => {
    const all = data?.entries ?? [];
    // Filtro client-side de niveles cuando el caller seleccionó un subset
    // (la API no acepta level array todavía). Default = todos los niveles
    // → all-pass.
    if (filters.levels.length === 0 || filters.levels.length === 5) return all;
    const allowed = new Set<number>(filters.levels);
    return all.filter((e) => allowed.has(e.level));
  }, [data, filters.levels]);

  const toggleExpanded = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const onFollowRequest = useCallback((requestId: string) => {
    setRequestIdFilter(requestId);
  }, []);

  const onCopyPermalink = useCallback(async () => {
    if (typeof window === 'undefined') return;
    const ok = await copyToClipboard(window.location.href);
    if (ok) {
      toast.success('Permalink copiado', '');
    } else {
      toast.error(
        'No se pudo copiar al portapapeles',
        'El navegador rechazó el clipboard. Probá copiar la URL manualmente.'
      );
    }
  }, [toast]);

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
    h(PageHeader, {
      eyebrow: 'OBSERVABILIDAD · LOGS RAW',
      title: 'Stream',
      stats: [{ value: entries.length.toLocaleString('es-AR'), label: 'eventos' }],
      rightSlot: [
        h(LiveIndicator, { key: 'live', paused }),
        h(
          'button',
          {
            key: 'pause',
            className: 'btn btn-secondary btn-sm',
            onClick: () => setPaused((p) => !p),
          },
          h(ObsIcon, { name: paused ? 'play' : 'pause', size: 13 }),
          h('span', null, paused ? 'reanudar' : 'pausar')
        ),
        h(
          'button',
          {
            key: 'refresh',
            className: 'btn btn-secondary btn-sm',
            onClick: () => void refetch(),
            disabled: loading,
            title: 'forzar refresh ahora',
          },
          h(ObsIcon, { name: 'refresh', size: 13 })
        ),
        h(
          'button',
          {
            key: 'permalink',
            className: 'btn btn-secondary btn-sm',
            onClick: () => void onCopyPermalink(),
          },
          h(ObsIcon, { name: 'link', size: 13 }),
          h('span', null, 'Permalink')
        ),
      ],
    }),
    h(RequestIdBand, { value: requestIdFilter, onChange: setRequestIdFilter }),
    h(StreamFilterBar, { filters, setFilters }),
    h(
      'div',
      { style: { flex: 1, minHeight: 0, overflow: 'auto', background: 'var(--white)' } },
      error
        ? h(InlineError, { error, onRetry: () => void refetch() })
        : h(StreamTable, {
            entries,
            loading,
            expanded,
            onToggle: toggleExpanded,
            onFollowRequest,
          })
    ),
    h(ResultsBar, {
      count: entries.length,
      totalCount: data?.total ?? 0,
      entity: 'eventos',
      middle: paused ? 'polling pausado' : `polling cada ${POLL_INTERVAL_MS / 1000}s`,
      right: 'orden: ts ↓',
    })
  );
}

// =============================================================================
// Live indicator (pulse verde / dot gris)
// =============================================================================

function LiveIndicator({ paused }: { paused: boolean }) {
  return h(
    'span',
    {
      style: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        fontFamily: 'var(--font-sans)',
        fontSize: 12,
        color: 'var(--neutral-700)',
        marginRight: 6,
      },
    },
    h('span', {
      style: {
        width: 7,
        height: 7,
        borderRadius: '50%',
        background: paused ? 'var(--neutral-500)' : 'var(--teal)',
        animation: paused ? 'none' : 'obs-pulse 2s ease-in-out infinite',
      },
    }),
    paused ? 'pausado' : `auto-refresh · ${POLL_INTERVAL_MS / 1000}s`
  );
}

// =============================================================================
// Tabla — sticky header, virtualización pendiente (hoy se cap a 200 rows
// del backend, render directo).
// =============================================================================

interface StreamTableProps {
  entries: LogEntry[];
  loading: boolean;
  expanded: Set<string>;
  onToggle: (id: string) => void;
  onFollowRequest: (requestId: string) => void;
}

function StreamTable({ entries, loading, expanded, onToggle, onFollowRequest }: StreamTableProps) {
  return h(
    'table',
    { style: { width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' } },
    h(
      'colgroup',
      null,
      h('col', { style: { width: 14 } }),
      h('col', { style: { width: 90 } }),
      h('col', { style: { width: 64 } }),
      h('col', { style: { width: 160 } }),
      h('col'),
      h('col', { style: { width: 160 } }),
      h('col', { style: { width: 130 } }),
      h('col', { style: { width: 60 } })
    ),
    h(
      'thead',
      null,
      h(
        'tr',
        null,
        h(StickyTh, { tight: true }, ''),
        h(StickyTh, { tight: true }, 'timestamp'),
        h(StickyTh, { tight: true }, 'level'),
        h(StickyTh, { tight: true }, 'source'),
        h(StickyTh, { tight: true }, 'message'),
        h(StickyTh, { tight: true }, 'request_id'),
        h(StickyTh, { tight: true }, 'tenant'),
        h(StickyTh, { tight: true, align: 'right' }, 'acciones')
      )
    ),
    h(
      'tbody',
      null,
      ...entries.map((e) =>
        h(StreamRow, {
          key: e.id,
          entry: e,
          expanded: expanded.has(e.id),
          onToggle: () => onToggle(e.id),
          onFollowRequest: () => {
            if (e.request_id) onFollowRequest(e.request_id);
          },
        })
      ),
      entries.length === 0 && !loading
        ? h(
            'tr',
            { key: 'empty' },
            h(
              'td',
              {
                colSpan: 8,
                style: {
                  padding: '60px 22px',
                  textAlign: 'center',
                  color: 'var(--neutral-500)',
                  fontSize: 13,
                },
              },
              'No hay eventos con esos filtros.'
            )
          )
        : null,
      loading && entries.length === 0
        ? h(
            'tr',
            { key: 'loading' },
            h(
              'td',
              {
                colSpan: 8,
                style: {
                  padding: '60px 22px',
                  textAlign: 'center',
                  color: 'var(--neutral-500)',
                  fontSize: 13,
                },
              },
              'cargando eventos…'
            )
          )
        : null
    )
  );
}

function isoAgo(ms: number): string {
  return new Date(Date.now() - ms).toISOString();
}
