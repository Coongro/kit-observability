// Lista de log_entries del mismo trace_id (= request_id en log_entries
// según el spec). Se monta en el SpanDetail drawer para que el operador
// vea, junto al span seleccionado, los logs textuales del request.
//
// Decisión: se fetchea solo cuando el drawer está abierto (gated por el
// hook). Si el drawer se cierra el AbortController cancela el request en
// vuelo. Se cap a 100 entries — si un request genera más, hay un
// problema y debería filtrarse desde Stream con el filtro de request_id.

import { getHostReact } from '@coongro/plugin-sdk';

import { queryLogs, type LogEntry } from '../_shared/api.js';
import { LevelBadge } from '../_shared/components/level-badge.js';
import { absTime } from '../_shared/lib/format-time.js';
import { useFetch } from '../_shared/use-fetch.js';

const React = getHostReact();
const h = React.createElement;

const LOGS_LIMIT = 100;

export function SpanLogsList({ traceId }: { traceId: string }) {
  const { data, loading, error, refetch } = useFetch(
    (signal) => queryLogs({ requestId: traceId, signal, limit: LOGS_LIMIT }),
    [traceId]
  );
  const entries = data?.entries ?? [];

  if (error !== null) {
    return h(
      'div',
      {
        style: {
          padding: 12,
          background: 'var(--red-soft)',
          color: 'var(--red-deep)',
          borderRadius: 6,
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          alignItems: 'flex-start',
        },
      },
      h('div', null, `error cargando logs: ${error.message}`),
      h(
        'button',
        { className: 'btn btn-secondary btn-sm', onClick: () => void refetch() },
        'reintentar'
      )
    );
  }

  if (loading && entries.length === 0) {
    return h(
      'div',
      { style: { fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--neutral-500)' } },
      'cargando logs asociados…'
    );
  }

  if (entries.length === 0) {
    return h(
      'div',
      {
        style: {
          fontFamily: 'var(--font-sans)',
          fontSize: 12,
          color: 'var(--neutral-500)',
          fontStyle: 'italic',
        },
      },
      'sin log_entries asociados a este trace_id.'
    );
  }

  return h(
    'div',
    {
      style: {
        background: 'var(--neutral-100)',
        border: '0.5px solid var(--neutral-300)',
        borderRadius: 6,
        overflow: 'hidden',
      },
    },
    ...entries.map((entry, idx) =>
      h(LogEntryRow, { key: entry.id, entry, last: idx === entries.length - 1 })
    )
  );
}

function LogEntryRow({ entry, last }: { entry: LogEntry; last: boolean }) {
  return h(
    'div',
    {
      style: {
        display: 'grid',
        gridTemplateColumns: '70px 56px 1fr',
        gap: 8,
        padding: '6px 10px',
        borderBottom: last ? 'none' : '0.5px solid var(--neutral-300)',
        alignItems: 'center',
      },
    },
    h(
      'span',
      {
        style: { fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--neutral-500)' },
      },
      absTime(entry.timestamp)
    ),
    h(LevelBadge, { level: entry.level, size: 'sm' }),
    h(
      'span',
      {
        style: {
          fontFamily: 'var(--font-sans)',
          fontSize: 11.5,
          color: 'var(--neutral-950)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        },
        title: entry.message,
      },
      entry.message
    )
  );
}
