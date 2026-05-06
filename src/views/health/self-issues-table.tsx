// Tabla "el writer se loggeó a sí mismo" — issues activos cuya source
// pertenece al propio plugin de observability. Se monta sobre el endpoint
// `/logs/issues` filtrando client-side por sources del kit.
//
// Por qué client-side y no un filtro server-side: el listado de sources
// "propias" es chico y conocido (plugin:kit-observability + core:db +
// core:retention) y no quisimos sumar un parámetro `source[]` (multi) al
// endpoint solo para esto. Si la lista de self-sources crece se promueve
// a query param.

import { getHostReact } from '@coongro/plugin-sdk';

import { type LogIssue, queryIssues } from '../_shared/api.js';
import { LevelBadge } from '../_shared/components/level-badge.js';
import { StickyTh } from '../_shared/components/sticky-th.js';
import { relTime } from '../_shared/lib/format-time.js';
import { useFetch } from '../_shared/use-fetch.js';

const React = getHostReact();
const h = React.createElement;
const { useMemo } = React;

const SELF_SOURCES = new Set(['plugin:kit-observability', 'core:db', 'core:retention']);

const SELF_ISSUES_LIMIT = 20;

export function SelfIssuesTable() {
  const { data, loading, error } = useFetch((signal) => queryIssues({ signal, limit: 100 }), []);

  const ownIssues = useMemo<LogIssue[]>(() => {
    const all = data?.rows ?? [];
    return all.filter((i) => SELF_SOURCES.has(i.source)).slice(0, SELF_ISSUES_LIMIT);
  }, [data]);

  return h(
    'div',
    { style: { padding: '4px 28px 28px' } },
    h(
      'div',
      {
        style: {
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          marginBottom: 10,
        },
      },
      h(
        'div',
        null,
        h('div', { className: 't-eyebrow' }, 'EL WRITER SE LOGGEÓ A SÍ MISMO'),
        h(
          'h2',
          {
            style: {
              fontFamily: 'var(--font-serif)',
              fontWeight: 900,
              fontSize: 22,
              WebkitTextStroke: '0.25px currentColor',
              letterSpacing: '-0.5px',
              margin: '4px 0 0',
            },
          },
          'Issues activos del propio plugin'
        )
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
        `${ownIssues.length} eventos`
      )
    ),
    h(
      'div',
      {
        style: {
          background: 'var(--white)',
          border: '0.5px solid var(--neutral-300)',
          borderRadius: 12,
          overflow: 'hidden',
        },
      },
      h(SelfIssuesBody, { issues: ownIssues, loading, error })
    )
  );
}

interface BodyProps {
  issues: LogIssue[];
  loading: boolean;
  error: Error | null;
}

function SelfIssuesBody({ issues, loading, error }: BodyProps) {
  if (error !== null) {
    return h(
      'div',
      {
        style: {
          padding: '32px 22px',
          textAlign: 'center',
          color: 'var(--red-deep)',
          fontFamily: 'var(--font-mono)',
          fontSize: 12,
        },
      },
      `error cargando issues: ${error.message}`
    );
  }
  return h(
    'table',
    { style: { width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' } },
    h(
      'colgroup',
      null,
      h('col', { style: { width: 78 } }),
      h('col'),
      h('col', { style: { width: 200 } }),
      h('col', { style: { width: 90 } }),
      h('col', { style: { width: 130 } })
    ),
    h(
      'thead',
      null,
      h(
        'tr',
        null,
        h(StickyTh, null, 'level'),
        h(StickyTh, null, 'title'),
        h(StickyTh, null, 'source'),
        h(StickyTh, { align: 'right' }, 'events'),
        h(StickyTh, null, 'last seen')
      )
    ),
    h(
      'tbody',
      null,
      ...issues.map((issue) => h(SelfIssueRow, { key: issue.id, issue })),
      issues.length === 0
        ? h(
            'tr',
            { key: 'empty' },
            h(
              'td',
              {
                colSpan: 5,
                style: {
                  padding: '40px 22px',
                  textAlign: 'center',
                  color: 'var(--neutral-500)',
                  fontFamily: 'var(--font-sans)',
                  fontSize: 13,
                },
              },
              loading ? 'cargando…' : 'sin issues del propio plugin — todo limpio.'
            )
          )
        : null
    )
  );
}

function SelfIssueRow({ issue }: { issue: LogIssue }) {
  return h(
    'tr',
    { style: { borderBottom: '0.5px solid var(--neutral-300)', height: 44 } },
    h('td', { style: cellStyle() }, h(LevelBadge, { level: issue.level })),
    h(
      'td',
      { style: cellStyle() },
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
        issue.sample_message
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
        issue.fingerprint
      )
    ),
    h(
      'td',
      { style: cellStyle() },
      h(
        'span',
        {
          style: {
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            color: 'var(--neutral-700)',
          },
        },
        issue.source
      )
    ),
    h(
      'td',
      { style: { ...cellStyle(), textAlign: 'right' } },
      h(
        'span',
        { style: { fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 500 } },
        Number(issue.occurrence_count).toLocaleString('es-AR')
      )
    ),
    h(
      'td',
      { style: cellStyle() },
      h(
        'span',
        { style: { fontFamily: 'var(--font-sans)', fontSize: 11.5 } },
        relTime(issue.last_seen_at)
      )
    )
  );
}

function cellStyle() {
  return {
    padding: '10px 14px',
    fontFamily: 'var(--font-sans)' as const,
    fontSize: 12.5,
    color: 'var(--neutral-950)',
    verticalAlign: 'middle' as const,
    overflow: 'hidden' as const,
  };
}
