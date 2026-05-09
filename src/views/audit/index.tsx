// Auditoría view — eventos inmutables de "quién hizo qué". Vista de
// compliance, no debug. Decisiones del port:
//
//   - Sin polling. La tabla de audit_events crece lento (no es log spam),
//     y los operadores que la miran están investigando un evento puntual,
//     no haciendo tail. Refresh manual via botón.
//   - 7-day default range. Capa de retention real es 7 años (legal), pero
//     lo común a investigar es "qué pasó esta semana". Range chip permite
//     ampliar a 30/90/all.
//   - ACTION/ACTOR/ENTITY como TextInputChip por ahora. Cuando agreguemos
//     `/audit/actions` al backend (similar a `/sources`) se promueven a
//     DropdownFilterChip — pero hoy es internal-only y los operadores
//     conocen el shape de las actions.

import { getHostReact, usePlugin } from '@coongro/plugin-sdk';

import { queryAudit, type AuditEvent } from '../_shared/api.js';
import { ObsIcon } from '../_shared/components/icons.js';
import { InlineError } from '../_shared/components/inline-error.js';
import { PageHeader } from '../_shared/components/page-header.js';
import { ResultsBar } from '../_shared/components/results-bar.js';
import { StickyTh } from '../_shared/components/sticky-th.js';
import { copyToClipboard } from '../_shared/lib/clipboard.js';
import { useFetch } from '../_shared/use-fetch.js';

import { AuditRow } from './audit-row.js';
import { AuditFilterBar, DEFAULT_AUDIT_FILTERS, type AuditFilters } from './filter-bar.js';
import { useTenantNameMap } from './lib/use-tenant-name-map.js';

const React = getHostReact();
const h = React.createElement;
const { useCallback, useMemo, useState } = React;

const AUDIT_LIMIT = 500;

const RANGE_TO_FROM: Record<AuditFilters['range'], () => string | undefined> = {
  '24h': () => isoAgo(24 * 60 * 60 * 1000),
  '7d': () => isoAgo(7 * 24 * 60 * 60 * 1000),
  '30d': () => isoAgo(30 * 24 * 60 * 60 * 1000),
  '90d': () => isoAgo(90 * 24 * 60 * 60 * 1000),
  all: () => undefined,
};

export function AuditView() {
  const { toast } = usePlugin();
  const [filters, setFilters] = useState<AuditFilters>(DEFAULT_AUDIT_FILTERS);
  // Pre-cargado al mount; el lookup `id → name` queda síncrono dentro
  // del row component. Se loadea en paralelo con la query de audit
  // events — una pestaña que se loadea con la otra no penaliza TTFC.
  const tenantNameMap = useTenantNameMap();

  const fetchArgs = useMemo(
    () => ({
      tenantId: filters.tenantId ?? undefined,
      actorId: filters.actorId ?? undefined,
      action: filters.action ?? undefined,
      entityType: filters.entityType ?? undefined,
      entityId: filters.entityId ?? undefined,
      from: RANGE_TO_FROM[filters.range](),
    }),
    [filters]
  );

  const { data, loading, error, refetch } = useFetch(
    (signal) => queryAudit({ ...fetchArgs, signal, limit: AUDIT_LIMIT }),
    [fetchArgs]
  );

  const events = useMemo<AuditEvent[]>(() => data?.rows ?? [], [data]);

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
        background: 'var(--neutral-200)',
      },
    },
    h(PageHeader, {
      eyebrow: 'OBSERVABILIDAD · INMUTABLE · COMPLIANCE',
      title: 'Auditoría',
      stats: [{ value: events.length.toLocaleString('es-AR'), label: 'eventos · solo lectura' }],
      rightSlot: [
        h(
          'button',
          {
            key: 'refresh',
            className: 'btn btn-secondary btn-sm',
            onClick: () => void refetch(),
            disabled: loading,
            title: 'refresh',
          },
          h(ObsIcon, { name: 'refresh', size: 13 })
        ),
        h(
          'button',
          {
            key: 'export',
            className: 'btn btn-secondary btn-sm',
            disabled: true,
            title: 'pendiente: export CSV',
          },
          h(ObsIcon, { name: 'download', size: 13 }),
          h('span', null, 'Export CSV')
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
    h(AuditFilterBar, { filters, setFilters }),
    h(
      'div',
      { style: { flex: 1, minHeight: 0, overflow: 'auto', background: 'var(--white)' } },
      error
        ? h(InlineError, { error, onRetry: () => void refetch() })
        : h(AuditTable, { events, loading, resolveTenantName: tenantNameMap.get })
    ),
    h(ResultsBar, {
      count: events.length,
      totalCount: events.length,
      entity: 'eventos',
      middle: `retención 7 años · cap ${AUDIT_LIMIT.toLocaleString('es-AR')} en vista`,
      right: 'orden: ts ↓',
    })
  );
}

interface AuditTableProps {
  events: AuditEvent[];
  loading: boolean;
  resolveTenantName: (tenantId: string) => string | undefined;
}

function AuditTable({ events, loading, resolveTenantName }: AuditTableProps) {
  return h(
    'table',
    { style: { width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' } },
    // Anchos por columna. `target` y `meta` tienen contenido variable;
    // las dejamos respirar dejando target sin width fijo (auto) y meta
    // con flex (sin width). El resto sí fijo para que la tabla se vea
    // estable a escalas distintas.
    h(
      'colgroup',
      null,
      h('col', { style: { width: 180 } }), // timestamp
      h('col', { style: { width: 220 } }), // actor
      h('col', { style: { width: 200 } }), // action
      h('col', { style: { minWidth: 200 } }), // target — wrap, sin tope hard
      h('col', { style: { width: 200 } }), // tenant (name + uuid)
      h('col'), // meta — flexible
      h('col', { style: { width: 60 } }) // copy
    ),
    h(
      'thead',
      null,
      h(
        'tr',
        null,
        h(StickyTh, null, 'timestamp'),
        h(StickyTh, null, 'actor'),
        h(StickyTh, null, 'action'),
        h(StickyTh, null, 'target'),
        h(StickyTh, null, 'tenant'),
        h(StickyTh, null, 'meta'),
        h(StickyTh, null, '')
      )
    ),
    h(
      'tbody',
      null,
      ...events.map((e) => h(AuditRow, { key: e.id, event: e, resolveTenantName })),
      events.length === 0 && !loading
        ? h(
            'tr',
            { key: 'empty' },
            h(
              'td',
              {
                colSpan: 7,
                style: {
                  padding: '60px 22px',
                  textAlign: 'center',
                  color: 'var(--neutral-500)',
                  fontSize: 13,
                },
              },
              'No hay eventos de auditoría con esos filtros.'
            )
          )
        : null,
      loading && events.length === 0
        ? h(
            'tr',
            { key: 'loading' },
            h(
              'td',
              {
                colSpan: 7,
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
