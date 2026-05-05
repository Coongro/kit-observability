// Vista principal de Issues — listado de errores agrupados por fingerprint
// con filtros, acciones y panel de detalle.
//
// Decisiones del port (ver COONG-118):
//   - 1:1 visualmente con el prototype (Observabilidad/IssuesView.jsx).
//   - Sin atajos de teclado (j/k/g+letra/Ctrl+K) — el spec los elimina.
//   - Status del backend son 3: open, resolved, muted. Acciones limitadas a
//     resolver/silenciar/reabrir; no hay snooze (no existe en el schema).
//   - Filtros: tenant, level, source, status, range. No hay category ni
//     assignee (no existen en el backend).

import { getHostReact } from '@coongro/plugin-sdk';

import {
  queryIssues,
  updateIssueStatus as patchIssueStatus,
  type IssueStatus,
  type LogIssue,
} from '../_shared/api.js';
import { ObsIcon } from '../_shared/components/icons.js';
import { PageHeader } from '../_shared/components/page-header.js';
import { ResultsBar } from '../_shared/components/results-bar.js';
import { formatError, useFetch } from '../_shared/use-fetch.js';

import { DEFAULT_FILTERS, IssuesFilterBar, type IssuesFilters } from './filter-bar.js';
import { IssueDetail } from './issue-detail.js';
import { IssueRow } from './issue-row.js';

const React = getHostReact();
const h = React.createElement;
const { useCallback, useMemo, useState } = React;

// Mapping del filtro de range a las query params from/to en ISO. Queda en
// el view porque es el único lugar que aplica este shortcut UX → request.
const RANGE_TO_FROM: Record<IssuesFilters['range'], () => string | undefined> = {
  '1h': () => isoAgo(1 * 60 * 60 * 1000),
  '24h': () => isoAgo(24 * 60 * 60 * 1000),
  '7d': () => isoAgo(7 * 24 * 60 * 60 * 1000),
  '30d': () => isoAgo(30 * 24 * 60 * 60 * 1000),
  all: () => undefined,
};

export function IssuesView() {
  const [filters, setFilters] = useState<IssuesFilters>(DEFAULT_FILTERS);
  const [selected, setSelected] = useState<string | null>(null);
  const [fullPage, setFullPage] = useState(false);

  // Memoizamos los args del fetch para que el cambio de filters dispare
  // refetch solo cuando los valores que mandamos al backend cambian. El
  // filtro de levels NO va al backend hoy (la API recibe level único, no
  // lista) — lo aplicamos en cliente abajo.
  const fetchArgs = useMemo(
    () => ({
      status: filters.statuses,
      tenantId: filters.tenantId ?? undefined,
      source: filters.source ?? undefined,
      from: RANGE_TO_FROM[filters.range](),
    }),
    [filters.statuses, filters.tenantId, filters.source, filters.range]
  );

  const { data, loading, error, refetch } = useFetch(
    (signal) => queryIssues({ ...fetchArgs, signal, limit: 200 }),
    [fetchArgs]
  );

  const issues = useMemo<LogIssue[]>(() => {
    const all = data?.rows ?? [];
    if (filters.levels.length === 0) return all;
    const allowed = new Set<number>(filters.levels);
    return all.filter((i) => allowed.has(i.level));
  }, [data, filters.levels]);

  const openCount = useMemo(() => issues.filter((i) => i.status === 'open').length, [issues]);

  const onStatusChange = useCallback(
    async (id: string, status: IssueStatus) => {
      try {
        await patchIssueStatus(id, status);
        await refetch();
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[kit-observability] failed to update issue status', err);
      }
    },
    [refetch]
  );

  const selectedIssue = selected ? issues.find((i) => i.fingerprint === selected) : null;

  return h(
    'div',
    {
      // El host renderiza la view dentro de `plugin-view-root` (flex
      // column, flex-1). Forzamos height/width 100% además del flex:1
      // para sobrevivir cuando alguna parte del chain de ancestros NO
      // tiene altura definida — uno u otro siempre cierra.
      style: {
        display: 'flex',
        flex: 1,
        width: '100%',
        height: '100%',
        minHeight: 0,
        background: 'var(--neutral-100)',
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
          opacity: fullPage ? 0 : 1,
        },
      },
      h(PageHeader, {
        eyebrow: 'OBSERVABILIDAD · ERRORES AGRUPADOS',
        title: 'Issues',
        stats: [
          { value: openCount, label: 'abiertos', tone: 'danger' },
          { value: issues.length, label: 'visibles' },
        ],
        rightSlot: [
          h(
            'button',
            {
              key: 'export',
              className: 'btn btn-secondary btn-sm',
              disabled: true,
              title: 'pendiente: export a CSV',
            },
            h(ObsIcon, { name: 'download', size: 13 }),
            h('span', null, 'Export')
          ),
          h(
            'button',
            { key: 'permalink', className: 'btn btn-secondary btn-sm', onClick: copyPermalink },
            h(ObsIcon, { name: 'link', size: 13 }),
            h('span', null, 'Permalink')
          ),
        ],
      }),
      h(IssuesFilterBar, { filters, setFilters }),
      h(
        'div',
        { style: { flex: 1, minHeight: 0, overflow: 'auto', background: 'var(--white)' } },
        error
          ? h(InlineError, { error, onRetry: () => void refetch() })
          : h(IssuesTable, {
              issues,
              loading,
              selected,
              onSelect: (fp) => setSelected((s) => (s === fp ? null : fp)),
              onResolve: (id) => void onStatusChange(id, 'resolved'),
              onMute: (id) => void onStatusChange(id, 'muted'),
              onReopen: (id) => void onStatusChange(id, 'open'),
            })
      ),
      h(ResultsBar, {
        count: issues.length,
        totalCount: data?.total ?? 0,
        entity: 'issues',
        right: 'orden: last_seen ↓',
      })
    ),
    selectedIssue
      ? h(IssueDetail, {
          fingerprint: selectedIssue.fingerprint,
          fullPage,
          onClose: () => setSelected(null),
          onToggleFull: () => setFullPage((f) => !f),
          onStatusChange: (s) => void onStatusChange(selectedIssue.id, s),
        })
      : null
  );
}

// =============================================================================
// Tabla — subcomponente local porque el layout de columnas es específico de
// Issues. Si Stream o Auditoría comparten esta forma exacta, se extrae a
// `_shared/components/`.
// =============================================================================

interface IssuesTableProps {
  issues: LogIssue[];
  loading: boolean;
  selected: string | null;
  onSelect: (fingerprint: string) => void;
  onResolve: (id: string) => void;
  onMute: (id: string) => void;
  onReopen: (id: string) => void;
}

function IssuesTable({
  issues,
  loading,
  selected,
  onSelect,
  onResolve,
  onMute,
  onReopen,
}: IssuesTableProps) {
  return h(
    'table',
    { style: { width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' } },
    h(
      'colgroup',
      null,
      h('col', { style: { width: 76 } }),
      h('col'),
      h('col', { style: { width: 156 } }),
      h('col', { style: { width: 90 } }),
      h('col', { style: { width: 110 } }),
      h('col', { style: { width: 110 } }),
      h('col', { style: { width: 110 } }),
      h('col', { style: { width: 110 } })
    ),
    h(
      'thead',
      null,
      h(
        'tr',
        {
          style: {
            background: 'var(--neutral-100)',
            borderBottom: '0.5px solid var(--neutral-300)',
          },
        },
        h(Th, null, 'level'),
        h(Th, null, 'mensaje · fingerprint'),
        h(Th, null, 'source'),
        h(Th, { align: 'right' }, 'events'),
        h(Th, null, 'last seen'),
        h(Th, null, 'first seen'),
        h(Th, null, '24h'),
        h(Th, { align: 'right' }, 'acciones')
      )
    ),
    h(
      'tbody',
      null,
      ...issues.map((i) =>
        h(IssueRow, {
          key: i.fingerprint,
          issue: i,
          active: selected === i.fingerprint,
          onClick: () => onSelect(i.fingerprint),
          onResolve: () => onResolve(i.id),
          onMute: () => onMute(i.id),
          onReopen: () => onReopen(i.id),
        })
      ),
      issues.length === 0 && !loading
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
              'No hay issues con esos filtros. Probá ampliar el rango o el nivel.'
            )
          )
        : null,
      loading && issues.length === 0
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
              'cargando issues…'
            )
          )
        : null
    )
  );
}

function Th({
  children,
  align = 'left',
}: {
  children?: React.ReactNode;
  align?: 'left' | 'right';
}) {
  return h(
    'th',
    {
      style: {
        fontFamily: 'var(--font-sans)',
        fontWeight: 500,
        fontSize: 10.5,
        color: 'var(--neutral-700)',
        textAlign: align,
        padding: '7px 10px',
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        whiteSpace: 'nowrap',
        position: 'sticky',
        top: 0,
        background: 'var(--neutral-100)',
        borderBottom: '0.5px solid var(--neutral-300)',
      },
    },
    children
  );
}

function InlineError({ error, onRetry }: { error: Error; onRetry: () => void }) {
  return h(
    'div',
    {
      style: {
        margin: 22,
        padding: 16,
        background: 'var(--red-soft)',
        border: '0.5px solid var(--red)',
        borderRadius: 8,
        color: 'var(--red-deep)',
        fontFamily: 'var(--font-mono)',
        fontSize: 12,
      },
    },
    h('div', { style: { marginBottom: 10 } }, formatError(error)),
    h('button', { className: 'btn btn-secondary btn-sm', onClick: onRetry }, 'reintentar')
  );
}

function isoAgo(ms: number): string {
  return new Date(Date.now() - ms).toISOString();
}

function copyPermalink() {
  if (typeof window === 'undefined') return;
  void navigator.clipboard?.writeText(window.location.href);
}
