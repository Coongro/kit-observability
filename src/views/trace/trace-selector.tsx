// Selector inicial de la vista Trace — hero centrado con input grande
// para pegar un trace_id, más una lista de traces recientes (fetched de
// /traces/recent) para que el operador pique uno sin tener que ir a
// otra herramienta a buscar el id.
//
// Decisión: el componente maneja su propio data fetching del listado de
// recientes (independiente del fetch del trace seleccionado). Si el
// listado falla, el input arriba sigue siendo usable — el operador
// pega el id manual y listo.

import { getHostReact } from '@coongro/plugin-sdk';

import { listRecentTraces, type RecentTrace } from '../_shared/api.js';
import { ObsIcon } from '../_shared/components/icons.js';
import { shortenId } from '../_shared/lib/format-id.js';
import { formatDuration, relTime } from '../_shared/lib/format-time.js';
import { useFetch } from '../_shared/use-fetch.js';

const React = getHostReact();
const h = React.createElement;
const { useState } = React;

const RECENTS_LIMIT = 20;

export interface TraceSelectorProps {
  onSelect: (traceId: string) => void;
}

export function TraceSelector({ onSelect }: TraceSelectorProps) {
  const [draft, setDraft] = useState('');
  const [search, setSearch] = useState('');

  const { data, loading, error, refetch } = useFetch(
    (signal) => listRecentTraces({ signal, limit: RECENTS_LIMIT }),
    []
  );

  const apply = () => {
    const trimmed = draft.trim();
    if (trimmed.length > 0) onSelect(trimmed);
  };

  const recents = filterRecents(data?.traces ?? [], search);

  return h(
    'div',
    {
      style: {
        flex: 1,
        minHeight: 0,
        overflow: 'auto',
        display: 'flex',
        justifyContent: 'center',
        padding: '40px 22px 60px',
        background: 'var(--neutral-100)',
      },
    },
    h(
      'div',
      {
        style: { width: '100%', maxWidth: 760, display: 'flex', flexDirection: 'column', gap: 24 },
      },
      h(SelectorHero, {
        draft,
        setDraft,
        apply,
      }),
      h(RecentsSection, {
        loading,
        error,
        traces: recents,
        totalRecents: data?.traces.length ?? 0,
        search,
        setSearch,
        onSelect,
        onRetry: () => void refetch(),
      })
    )
  );
}

function SelectorHero({
  draft,
  setDraft,
  apply,
}: {
  draft: string;
  setDraft: (s: string) => void;
  apply: () => void;
}) {
  return h(
    'div',
    {
      style: {
        background: 'var(--white)',
        border: '0.5px solid var(--neutral-300)',
        borderRadius: 12,
        padding: '32px 32px 28px',
        textAlign: 'center',
      },
    },
    h('div', { className: 't-eyebrow' }, 'OBSERVABILIDAD · WATERFALL'),
    h(
      'h1',
      {
        className: 't-page-title',
        style: { margin: '8px 0 6px' },
      },
      'Trace'
    ),
    h(
      'p',
      {
        style: {
          margin: '0 0 22px',
          fontFamily: 'var(--font-sans)',
          fontSize: 13,
          color: 'var(--neutral-700)',
          fontStyle: 'italic',
        },
      },
      'pegá un trace_id y vé toda la cascada de spans del request.'
    ),
    h(
      'div',
      {
        style: {
          display: 'flex',
          alignItems: 'stretch',
          gap: 8,
          maxWidth: 580,
          margin: '0 auto',
        },
      },
      h('input', {
        autoFocus: true,
        value: draft,
        onChange: (e: { target: { value: string } }) => setDraft(e.target.value),
        onKeyDown: (e: { key: string }) => {
          if (e.key === 'Enter') apply();
        },
        placeholder: 'ej: 4bf92f3577b34da6a3ce929d0e0e4736',
        style: {
          flex: 1,
          height: 40,
          padding: '0 14px',
          background: 'var(--white)',
          border: '0.5px solid var(--neutral-500)',
          borderRadius: 6,
          fontFamily: 'var(--font-mono)',
          fontSize: 13,
          color: 'var(--neutral-950)',
          outline: 'none',
        },
      }),
      h(
        'button',
        {
          className: 'btn btn-primary',
          onClick: apply,
          disabled: draft.trim().length === 0,
        },
        h('span', null, 'Ver waterfall'),
        h(ObsIcon, { name: 'chevRight', size: 13 })
      )
    )
  );
}

interface RecentsSectionProps {
  loading: boolean;
  error: Error | null;
  traces: RecentTrace[];
  totalRecents: number;
  search: string;
  setSearch: (s: string) => void;
  onSelect: (traceId: string) => void;
  onRetry: () => void;
}

function RecentsSection({
  loading,
  error,
  traces,
  totalRecents,
  search,
  setSearch,
  onSelect,
  onRetry,
}: RecentsSectionProps) {
  return h(
    'div',
    null,
    h(
      'div',
      {
        style: {
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          marginBottom: 10,
          gap: 10,
        },
      },
      h(
        'div',
        null,
        h('div', { className: 't-eyebrow' }, 'RECIENTES'),
        h(
          'h2',
          {
            style: {
              fontFamily: 'var(--font-serif)',
              fontWeight: 900,
              fontSize: 18,
              WebkitTextStroke: '0.25px currentColor',
              letterSpacing: '-0.5px',
              margin: '4px 0 0',
            },
          },
          'Últimos traces'
        )
      ),
      h(SearchInput, { value: search, onChange: setSearch })
    ),
    error !== null
      ? h(RecentsError, { error, onRetry })
      : traces.length === 0 && !loading
        ? h(RecentsEmpty, { hasSearch: search.length > 0, totalRecents })
        : h(RecentsTable, { traces, loading, onSelect })
  );
}

function SearchInput({ value, onChange }: { value: string; onChange: (s: string) => void }) {
  return h(
    'div',
    {
      style: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        background: 'var(--white)',
        border: '0.5px solid var(--neutral-300)',
        borderRadius: 6,
        padding: '4px 10px',
        height: 30,
      },
    },
    h(ObsIcon, { name: 'search', size: 12, style: { color: 'var(--neutral-500)' } }),
    h('input', {
      value,
      onChange: (e: { target: { value: string } }) => onChange(e.target.value),
      placeholder: 'filtrar por id, service, tenant…',
      style: {
        border: 'none',
        outline: 'none',
        fontFamily: 'var(--font-mono)',
        fontSize: 11.5,
        color: 'var(--neutral-950)',
        background: 'transparent',
        width: 240,
      },
    })
  );
}

function RecentsTable({
  traces,
  loading,
  onSelect,
}: {
  traces: RecentTrace[];
  loading: boolean;
  onSelect: (traceId: string) => void;
}) {
  return h(
    'div',
    {
      style: {
        background: 'var(--white)',
        border: '0.5px solid var(--neutral-300)',
        borderRadius: 8,
        overflow: 'hidden',
        opacity: loading ? 0.7 : 1,
      },
    },
    ...traces.map((trace, idx) =>
      h(RecentRow, {
        key: trace.trace_id,
        trace,
        last: idx === traces.length - 1,
        onSelect: () => onSelect(trace.trace_id),
      })
    )
  );
}

function RecentRow({
  trace,
  last,
  onSelect,
}: {
  trace: RecentTrace;
  last: boolean;
  onSelect: () => void;
}) {
  const hasErrors = trace.error_count > 0;
  return h(
    'div',
    {
      onClick: onSelect,
      style: {
        display: 'grid',
        gridTemplateColumns: '160px 1fr 90px 80px 60px',
        gap: 14,
        padding: '12px 16px',
        borderBottom: last ? 'none' : '0.5px solid var(--neutral-300)',
        cursor: 'pointer',
        alignItems: 'center',
        background: 'var(--white)',
        transition: 'background 80ms ease',
      },
      onMouseEnter: (e: { currentTarget: { style: { background: string } } }) => {
        e.currentTarget.style.background = 'var(--neutral-100)';
      },
      onMouseLeave: (e: { currentTarget: { style: { background: string } } }) => {
        e.currentTarget.style.background = 'var(--white)';
      },
    },
    h(
      'div',
      null,
      h(
        'div',
        {
          style: {
            fontFamily: 'var(--font-mono)',
            fontSize: 11.5,
            color: 'var(--neutral-950)',
            fontWeight: 500,
          },
        },
        shortenId(trace.trace_id, 8, 8, 16)
      ),
      h(
        'div',
        {
          style: {
            fontFamily: 'var(--font-mono)',
            fontSize: 10.5,
            color: 'var(--neutral-500)',
            marginTop: 2,
          },
        },
        relTime(trace.start_time)
      )
    ),
    h(
      'div',
      { style: { minWidth: 0 } },
      h(
        'div',
        {
          style: {
            fontFamily: 'var(--font-sans)',
            fontSize: 12.5,
            color: 'var(--neutral-950)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          },
        },
        trace.root_name ?? '—'
      ),
      h(
        'div',
        {
          style: {
            fontFamily: 'var(--font-mono)',
            fontSize: 10.5,
            color: 'var(--neutral-500)',
            marginTop: 2,
          },
        },
        `${trace.service_name ?? 'sin service'} · ${
          trace.tenant_id !== null ? shortenId(trace.tenant_id) : 'system'
        }`
      )
    ),
    h(
      'span',
      {
        style: {
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          color: 'var(--neutral-700)',
          textAlign: 'right',
        },
      },
      formatDuration(trace.duration_ns)
    ),
    h(
      'span',
      {
        style: {
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          color: 'var(--neutral-700)',
          textAlign: 'right',
        },
      },
      `${trace.span_count} spans`
    ),
    hasErrors
      ? h(
          'span',
          {
            style: {
              padding: '2px 6px',
              background: 'var(--red-soft)',
              color: 'var(--red-deep)',
              borderRadius: 3,
              fontFamily: 'var(--font-mono)',
              fontSize: 10.5,
              fontWeight: 600,
              textAlign: 'center',
            },
          },
          `${trace.error_count} err`
        )
      : h(
          'span',
          {
            style: {
              fontFamily: 'var(--font-mono)',
              fontSize: 10.5,
              color: 'var(--teal-deep)',
              textAlign: 'center',
            },
          },
          'ok'
        )
  );
}

function RecentsEmpty({ hasSearch, totalRecents }: { hasSearch: boolean; totalRecents: number }) {
  return h(
    'div',
    {
      style: {
        background: 'var(--white)',
        border: '0.5px solid var(--neutral-300)',
        borderRadius: 8,
        padding: '32px 22px',
        textAlign: 'center',
        color: 'var(--neutral-500)',
        fontFamily: 'var(--font-sans)',
        fontSize: 13,
      },
    },
    hasSearch
      ? `ningún trace reciente coincide con esa búsqueda (de ${totalRecents} candidatos).`
      : 'aún no hay traces — generá actividad y refresheá.'
  );
}

function RecentsError({ error, onRetry }: { error: Error; onRetry: () => void }) {
  return h(
    'div',
    {
      style: {
        padding: 16,
        background: 'var(--red-soft)',
        border: '0.5px solid var(--red)',
        borderRadius: 8,
        color: 'var(--red-deep)',
        fontFamily: 'var(--font-mono)',
        fontSize: 12,
      },
    },
    h('div', { style: { marginBottom: 10 } }, `error cargando recientes: ${error.message}`),
    h('button', { className: 'btn btn-secondary btn-sm', onClick: onRetry }, 'reintentar')
  );
}

function filterRecents(traces: RecentTrace[], search: string): RecentTrace[] {
  const q = search.trim().toLowerCase();
  if (q.length === 0) return traces;
  return traces.filter(
    (t) =>
      t.trace_id.toLowerCase().includes(q) ||
      (t.service_name?.toLowerCase().includes(q) ?? false) ||
      (t.tenant_id?.toLowerCase().includes(q) ?? false) ||
      (t.root_name?.toLowerCase().includes(q) ?? false)
  );
}
