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
import { IdInputBand } from '../_shared/components/id-input-band.js';
import { InlineError } from '../_shared/components/inline-error.js';
import { PageHeader } from '../_shared/components/page-header.js';
import { ResultsBar } from '../_shared/components/results-bar.js';
import { StickyTh } from '../_shared/components/sticky-th.js';
import { copyToClipboard } from '../_shared/lib/clipboard.js';
import { useFetch } from '../_shared/use-fetch.js';

import { DEFAULT_STREAM_FILTERS, StreamFilterBar, type StreamFilters } from './filter-bar.js';
import { StreamRow } from './stream-row.js';

const React = getHostReact();
const h = React.createElement;
const { useCallback, useEffect, useMemo, useState } = React;

const POLL_INTERVAL_MS = 2000;
const STREAM_LIMIT = 200;

const RANGE_TO_FROM: Record<StreamFilters['range'], () => string | undefined> = {
  '15m': () => isoAgo(15 * 60 * 1000),
  '1h': () => isoAgo(60 * 60 * 1000),
  '6h': () => isoAgo(6 * 60 * 60 * 1000),
  '24h': () => isoAgo(24 * 60 * 60 * 1000),
};

export function StreamView() {
  const { toast, views } = usePlugin();
  const [filters, setFilters] = useState<StreamFilters>(() =>
    applyParamsToFilters(DEFAULT_STREAM_FILTERS, views.params)
  );
  const [requestIdFilter, setRequestIdFilter] = useState<string | null>(() =>
    readStringParam(views.params, 'requestId')
  );
  // Ventana custom (override del chip de range). Si está seteada, gana
  // contra `RANGE_TO_FROM[filters.range]()`. Se usa cuando un caller
  // (ej: Issues "Ver en Stream") quiere acotar a un timeframe específico
  // alrededor de un evento. El chip de range sigue clickeable para
  // limpiarla.
  const [customRange, setCustomRange] = useState<{ from: string; to: string } | null>(() =>
    readCustomRangeFromParams(views.params)
  );
  const [paused, setPaused] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Sync con cambios de params posteriores (navegación entre issues sin
  // recarga). Solo aplicamos cuando los params traen algún filtro real —
  // así no resetamos el estado del usuario cuando params queda vacío al
  // cerrar el detail de otra view.
  useEffect(() => {
    if (!hasAnyFilterParam(views.params)) return;
    setFilters((prev) => applyParamsToFilters(prev, views.params));
    const rid = readStringParam(views.params, 'requestId');
    if (rid !== null) setRequestIdFilter(rid);
    const cr = readCustomRangeFromParams(views.params);
    if (cr !== null) setCustomRange(cr);
  }, [views.params]);

  const fetchArgs = useMemo(
    () => ({
      // Mandamos los niveles seleccionados como array al backend (que usa
      // `IN(...)`). Cuando están los 5 niveles default → undefined (no
      // filtro). Cuando hay 1+ niveles parciales → array. Esto reemplaza el
      // filter-client-side que rompía cuando los logs recientes no incluían
      // los niveles pedidos (limit 200 saturado por info/debug ruidosos).
      levels: filters.levels.length > 0 && filters.levels.length < 5 ? filters.levels : undefined,
      tenantId: filters.tenantId ?? undefined,
      source: filters.source ?? undefined,
      requestId: requestIdFilter ?? undefined,
      q: filters.search ?? undefined,
      from: customRange?.from ?? RANGE_TO_FROM[filters.range](),
      to: customRange?.to,
    }),
    [filters, requestIdFilter, customRange]
  );

  const { data, loading, error, refetch } = useFetch(
    (signal) => queryLogs({ ...fetchArgs, signal, limit: STREAM_LIMIT }),
    [fetchArgs],
    { refreshInterval: paused ? undefined : POLL_INTERVAL_MS }
  );

  const entries = useMemo<LogEntry[]>(() => data?.entries ?? [], [data]);

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
    h(IdInputBand, {
      value: requestIdFilter,
      onChange: setRequestIdFilter,
      label: 'SEGUIR REQUEST_ID',
      placeholder: 'pegá un request_id (ej: req_01JR2K7T9V8Q) y vé la cadena completa…',
      tone: 'gold',
    }),
    h(StreamFilterBar, { filters, setFilters }),
    customRange !== null
      ? h(CustomRangeIndicator, { range: customRange, onClear: () => setCustomRange(null) })
      : null,
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

/**
 * Banda informativa que aparece cuando hay una ventana custom activa
 * (usuario navegó desde Issues "Ver en Stream" con un timeframe específico).
 * El chip de range del filter bar queda en su valor default pero no se
 * aplica — esta banda lo aclara y ofrece volver al default con un click.
 */
function CustomRangeIndicator({
  range,
  onClear,
}: {
  range: { from: string; to: string };
  onClear: () => void;
}) {
  return h(
    'div',
    {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '8px 22px',
        background: 'var(--sky-soft)',
        borderBottom: '0.5px solid var(--sky-lt)',
        fontFamily: 'var(--font-mono)',
        fontSize: 11,
        color: 'var(--sky-deep)',
      },
    },
    h(
      'span',
      { style: { fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' } },
      'rango custom'
    ),
    h('span', null, `${formatRangeBound(range.from)} → ${formatRangeBound(range.to)}`),
    h('div', { style: { flex: 1 } }),
    h(
      'button',
      {
        onClick: onClear,
        title: 'limpiar rango custom y volver al chip de range',
        style: {
          height: 22,
          padding: '0 8px',
          background: 'transparent',
          border: '0.5px solid var(--sky-dk)',
          borderRadius: 4,
          color: 'var(--sky-deep)',
          cursor: 'pointer',
          fontFamily: 'var(--font-sans)',
          fontSize: 11,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
        },
      },
      'limpiar'
    )
  );
}

function formatRangeBound(iso: string): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return iso;
  const d = new Date(ms);
  // HH:MM:SS local — el rango siempre es chico (segundos/minutos), día
  // completo no aporta. Si la ventana cruza días el caller puede ver el
  // ISO completo en el title del chip.
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/**
 * Lee un string trimeado de los params del view, o null si no está. Usado
 * para que `openStream({ source, q, ... })` desde otras vistas pueda
 * pre-cargar la barra de filtros del Stream.
 */
function readStringParam(params: unknown, key: string): string | null {
  if (params === null || typeof params !== 'object') return null;
  const value = (params as Record<string, unknown>)[key];
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function hasAnyFilterParam(params: unknown): boolean {
  return (
    readStringParam(params, 'source') !== null ||
    readStringParam(params, 'requestId') !== null ||
    readStringParam(params, 'tenantId') !== null ||
    readStringParam(params, 'q') !== null ||
    readStringParam(params, 'from') !== null ||
    readStringParam(params, 'to') !== null
  );
}

/**
 * Lee `from`/`to` ISO de los params como una ventana custom. Necesita los
 * dos valores presentes — un solo extremo no tiene semántica clara y
 * podría confundirse con el chip de range. Devuelve null si falta alguno.
 */
function readCustomRangeFromParams(params: unknown): { from: string; to: string } | null {
  const from = readStringParam(params, 'from');
  const to = readStringParam(params, 'to');
  if (from === null || to === null) return null;
  return { from, to };
}

/**
 * Merge de params → StreamFilters. NO toca campos que no vinieron en params
 * — un caller que solo manda `source` no debería resetear `range`/`levels`.
 */
function applyParamsToFilters(base: StreamFilters, params: unknown): StreamFilters {
  const source = readStringParam(params, 'source');
  const tenantId = readStringParam(params, 'tenantId');
  const q = readStringParam(params, 'q');
  return {
    ...base,
    source: source ?? base.source,
    tenantId: tenantId ?? base.tenantId,
    search: q ?? base.search,
  };
}
