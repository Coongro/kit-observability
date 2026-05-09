// Salud view — estado del propio plugin de observability. La premisa es
// "si esto miente, todo lo demás miente": cualquier degradación del DBSink
// o SpanSink se ve acá antes que en otras vistas.
//
// Decisiones del port:
//
//   - 6 cards en grid 3x2, mismo layout que el prototype. Las que muestran
//     features no implementadas (Notifier Telegram, Particiones, Última
//     retención) van como `comingSoon` para preservar el layout cuando se
//     entregue cada feature.
//   - Refresh manual + auto-refresh 10s. Más liviano que Stream (2s)
//     porque la salud no cambia tan rápido y el endpoint solo devuelve
//     contadores in-memory (no toca DB).
//   - GlobalStatusBanner deriva su severidad y razón con
//     `derive-health-status.ts` — el view no hardcodea reglas.
//   - Self-issues table reutiliza `queryIssues` con filtro client-side
//     por sources del propio plugin.

import { getHostReact, usePlugin } from '@coongro/plugin-sdk';

import { getHealth, type SinkHealth } from '../_shared/api.js';
import { BigNumber } from '../_shared/components/big-number.js';
import { ObsIcon } from '../_shared/components/icons.js';
import { InlineError } from '../_shared/components/inline-error.js';
import { MetricCard } from '../_shared/components/metric-card.js';
import { PageHeader } from '../_shared/components/page-header.js';
import {
  deriveFailsafeStatus,
  deriveGlobalReason,
  deriveGlobalStatus,
  deriveInsertErrorsStatus,
  deriveQueueLagStatus,
  worseStatus,
  type HealthStatus,
} from '../_shared/lib/derive-health-status.js';
import { absTime, relTime } from '../_shared/lib/format-time.js';
import { useFetch } from '../_shared/use-fetch.js';

import { GlobalStatusBanner } from './global-status-banner.js';
import { SelfIssuesTable } from './self-issues-table.js';

const React = getHostReact();
const h = React.createElement;
const { useCallback, useEffect, useRef } = React;

const POLL_INTERVAL_MS = 10_000;

export function HealthView() {
  const { toast } = usePlugin();

  const { data, loading, error, refetch } = useFetch((signal) => getHealth({ signal }), [], {
    refreshInterval: POLL_INTERVAL_MS,
  });

  // `useFetch.refetch` nunca rejecta — el error se expone vía el state
  // `error`. Mantenemos un ref sincronizado para que `onRecheck` pueda
  // chequearlo post-refetch sin entrar en deps del useCallback.
  const errorRef = useRef<Error | null>(error);
  useEffect(() => {
    errorRef.current = error;
  }, [error]);

  // Cache del último data válido. Si un tick del polling falla después
  // de un load exitoso, conservamos el último valor visible — el dashboard
  // no debe colapsar a "cartel de error" cuando ya tenía data.
  const lastHealthRef = useRef(data);
  useEffect(() => {
    if (data !== null) lastHealthRef.current = data;
  }, [data]);

  const onRecheck = useCallback(() => {
    void refetch().then(() => {
      if (errorRef.current === null) {
        toast.info('Salud actualizada', '');
      }
    });
  }, [refetch, toast]);

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
        overflow: 'auto',
        background: 'var(--neutral-100)',
      },
    },
    h(PageHeader, {
      eyebrow: 'OBSERVABILIDAD · ESTADO DEL PROPIO PLUGIN · si esto miente, todo lo demás miente',
      title: 'Salud',
      rightSlot: [
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
      ],
    }),
    error && lastHealthRef.current === null
      ? h(InlineError, { error, onRetry: () => void refetch() })
      : h(HealthBody, {
          health: data ?? lastHealthRef.current,
          stale: error !== null,
          loading,
          onRecheck,
        })
  );
}

interface BodyProps {
  health: { dbSink: SinkHealth; spanSink: SinkHealth } | null;
  /** True cuando el último tick falló y mostramos el último valor cacheado. */
  stale: boolean;
  loading: boolean;
  onRecheck: () => void;
}

function HealthBody({ health, stale, loading, onRecheck }: BodyProps) {
  if (health === null) {
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
      'cargando salud del plugin…'
    );
  }

  const sinks = [health.dbSink, health.spanSink];
  const globalStatus = deriveGlobalStatus(sinks);
  const globalReason = deriveGlobalReason([
    { name: 'dbSink', health: health.dbSink },
    { name: 'spanSink', health: health.spanSink },
  ]);

  return h(
    React.Fragment,
    null,
    stale ? h(StaleBanner) : null,
    h(
      'div',
      { style: { padding: '18px 28px 0' } },
      h(GlobalStatusBanner, {
        status: globalStatus,
        reason: globalReason,
        onRecheck,
        loading,
      })
    ),
    h(MetricGrid, { health }),
    h(SelfIssuesTable)
  );
}

interface MetricGridProps {
  health: { dbSink: SinkHealth; spanSink: SinkHealth };
}

function MetricGrid({ health }: MetricGridProps) {
  return h(
    'div',
    {
      style: {
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 14,
        padding: '18px 28px',
      },
    },
    h(QueueLagCard, { health }),
    h(FailsafeCard, { health }),
    h(InsertErrorsCard, { health }),
    h(LastFlushCard, { health }),
    h(MetricCard, {
      title: 'Notifier Telegram',
      status: 'ok',
      comingSoon: true,
      comingSoonText: 'Plugin separado @coongro/telegram — fuera de scope del kit-observability.',
    }),
    h(MetricCard, {
      title: 'Particiones',
      status: 'ok',
      // El ticket de seguimiento del cron de retention se documenta en
      // CLAUDE.md/Plane; el texto user-facing no lo menciona porque rota
      // cada vez que se cierra/reasigna.
      comingSoon: true,
      comingSoonText: 'Pendiente de cron de retention — chequea pg_partman + huecos.',
    })
  );
}

// =============================================================================
// Cards específicas — cada una toma SinkHealth y arma sus own props del
// MetricCard genérico. Se mantienen como funciones aparte para que el
// MetricGrid quede legible y para poder testear la lógica de derive en
// aislamiento si hace falta.
// =============================================================================

function QueueLagCard({ health }: MetricGridProps) {
  const status: HealthStatus = worseStatus(
    deriveQueueLagStatus(health.dbSink.queueLag),
    deriveQueueLagStatus(health.spanSink.queueLag)
  );
  const total = health.dbSink.queueLag + health.spanSink.queueLag;
  return h(MetricCard, {
    title: 'Lag de queue',
    status,
    big: h(BigNumber, { value: total, unit: 'entries' }),
    sub: 'pendientes de flush · suma DB + Span',
    extra: h(SinkBreakdown, {
      rows: [
        { label: 'DBSink', value: `${health.dbSink.queueLag}` },
        { label: 'SpanSink', value: `${health.spanSink.queueLag}` },
      ],
    }),
  });
}

function FailsafeCard({ health }: MetricGridProps) {
  const status: HealthStatus = worseStatus(
    deriveFailsafeStatus(health.dbSink),
    deriveFailsafeStatus(health.spanSink)
  );
  const lost = health.dbSink.permanentlyLost + health.spanSink.permanentlyLost;
  const diverted = health.dbSink.divertedToFailsafe + health.spanSink.divertedToFailsafe;
  return h(MetricCard, {
    title: 'Logs en fail-safe',
    status,
    big: h(BigNumber, { value: diverted }),
    sub: 'derivados a fail-safe (DB rebotó)',
    extra: h(SinkBreakdown, {
      rows: [
        {
          label: 'permanentemente perdidos',
          value: `${lost}`,
          tone: lost > 0 ? 'error' : 'neutral',
        },
        {
          label: 'errores de failsafe',
          value: `${health.dbSink.failsafeWriteErrors + health.spanSink.failsafeWriteErrors}`,
          tone:
            health.dbSink.failsafeWriteErrors + health.spanSink.failsafeWriteErrors > 0
              ? 'error'
              : 'neutral',
        },
      ],
    }),
  });
}

function InsertErrorsCard({ health }: MetricGridProps) {
  const status: HealthStatus = worseStatus(
    deriveInsertErrorsStatus(health.dbSink),
    deriveInsertErrorsStatus(health.spanSink)
  );
  const total = health.dbSink.insertFailures + health.spanSink.insertFailures;
  return h(MetricCard, {
    title: 'Errores de insert',
    status,
    big: h(BigNumber, { value: total }),
    sub: 'batches con fallo de flush · acumulado',
    extra: h(SinkBreakdown, {
      rows: [
        { label: 'DBSink', value: `${health.dbSink.insertFailures}` },
        { label: 'SpanSink', value: `${health.spanSink.insertFailures}` },
      ],
    }),
  });
}

function LastFlushCard({ health }: MetricGridProps) {
  const dbAt = health.dbSink.lastFlushAt;
  const spanAt = health.spanSink.lastFlushAt;
  const status: HealthStatus = dbAt === null || spanAt === null ? 'warn' : 'ok';
  const mostRecent =
    dbAt !== null && spanAt !== null
      ? new Date(dbAt).getTime() > new Date(spanAt).getTime()
        ? dbAt
        : spanAt
      : (dbAt ?? spanAt);

  return h(MetricCard, {
    title: 'Último flush',
    status,
    big: h(
      'span',
      { style: { fontFamily: 'var(--font-sans)', fontSize: 18, fontWeight: 500 } },
      mostRecent === null ? 'nunca' : relTime(mostRecent)
    ),
    sub: mostRecent === null ? 'ningún sink ha flusheado todavía' : absTime(mostRecent, true),
    extra: h(SinkBreakdown, {
      rows: [
        { label: 'DBSink', value: dbAt === null ? 'nunca' : relTime(dbAt) },
        { label: 'SpanSink', value: spanAt === null ? 'nunca' : relTime(spanAt) },
      ],
    }),
  });
}

interface SinkBreakdownProps {
  rows: { label: string; value: string; tone?: 'neutral' | 'error' }[];
}

function StaleBanner() {
  return h(
    'div',
    {
      style: {
        padding: '6px 22px',
        background: 'var(--gold-soft)',
        borderBottom: '0.5px solid var(--gold-dk)',
        fontFamily: 'var(--font-mono)',
        fontSize: 11,
        color: 'var(--gold-deep)',
      },
    },
    'datos potencialmente desactualizados — el último refresh falló. Mostrando último valor conocido.'
  );
}

function SinkBreakdown({ rows }: SinkBreakdownProps) {
  return h(
    'div',
    { style: { display: 'flex', flexDirection: 'column', gap: 4 } },
    ...rows.map((r, idx) =>
      h(
        'div',
        {
          key: `row-${idx}`,
          style: {
            display: 'flex',
            justifyContent: 'space-between',
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            color: r.tone === 'error' ? 'var(--red-deep)' : 'var(--neutral-700)',
          },
        },
        h('span', null, r.label),
        h('span', { style: { fontWeight: 500 } }, r.value)
      )
    )
  );
}
