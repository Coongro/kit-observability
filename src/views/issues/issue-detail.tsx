import { getHostReact } from '@coongro/plugin-sdk';

import {
  getIssueDetail as fetchIssueDetail,
  type IssueDetail as IssueDetailData,
  type IssueStatus,
  type LogIssue,
} from '../_shared/api.js';
import { CopyBtn } from '../_shared/components/copy-btn.js';
import { ObsIcon } from '../_shared/components/icons.js';
import { JsonTree } from '../_shared/components/json-tree.js';
import { LevelBadge } from '../_shared/components/level-badge.js';
import {
  StackFrame,
  parseStackFromError,
  type StackFrameData,
} from '../_shared/components/stack-frame.js';
import { absTime, relTime } from '../_shared/lib/format-time.js';
import { useFetch, formatError } from '../_shared/use-fetch.js';

import { TimelineChart } from './timeline-chart.js';

const React = getHostReact();
const h = React.createElement;
const { useMemo, useState } = React;

export interface IssueDetailProps {
  fingerprint: string;
  /** Cuando true, ocupa toda la página; cuando false, panel lateral 580px. */
  fullPage: boolean;
  onClose: () => void;
  onToggleFull: () => void;
  /** Actualiza status del issue. El parent persiste en backend. */
  onStatusChange: (status: IssueStatus) => void;
}

/**
 * Panel de detalle de un issue. Trae los datos por sí mismo via getIssueDetail
 * para que el listado padre no tenga que coordinar fetch del detail con el
 * fetch de la lista — son consultas independientes con paginación distinta.
 */
export function IssueDetail({
  fingerprint,
  fullPage,
  onClose,
  onToggleFull,
  onStatusChange,
}: IssueDetailProps) {
  const { data, loading, error } = useFetch<IssueDetailData>(
    (signal) => fetchIssueDetail(fingerprint, { signal }),
    [fingerprint]
  );

  const wrapStyle = fullPage
    ? {
        position: 'fixed' as const,
        inset: 0,
        background: 'var(--neutral-100)',
        zIndex: 50,
        display: 'flex' as const,
        flexDirection: 'column' as const,
      }
    : {
        width: 580,
        flexShrink: 0,
        background: 'var(--white)',
        borderLeft: '0.5px solid var(--neutral-300)',
        display: 'flex' as const,
        flexDirection: 'column' as const,
        boxShadow: '-4px 0 16px rgba(31,31,31,0.04)',
      };

  return h(
    'aside',
    { style: wrapStyle },
    h(DetailHeader, {
      issue: data?.issue ?? null,
      fingerprint,
      fullPage,
      onClose,
      onToggleFull,
    }),
    h(
      'div',
      {
        style: {
          flex: 1,
          overflowY: 'auto',
          padding: fullPage ? '24px 40px' : '18px 20px',
        },
      },
      h(
        'div',
        {
          style: {
            maxWidth: fullPage ? 920 : '100%',
            margin: fullPage ? '0 auto' : 0,
          },
        },
        loading && !data
          ? h(LoadingState)
          : error
            ? h(ErrorState, { error })
            : data?.issue
              ? h(DetailBody, { detail: data, fullPage, onStatusChange })
              : h(NotFoundState, { fingerprint })
      )
    )
  );
}

// =============================================================================
// Header
// =============================================================================

function DetailHeader({
  issue,
  fingerprint,
  fullPage,
  onClose,
  onToggleFull,
}: {
  issue: LogIssue | null;
  fingerprint: string;
  fullPage: boolean;
  onClose: () => void;
  onToggleFull: () => void;
}) {
  return h(
    'div',
    {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '14px 20px',
        borderBottom: '0.5px solid var(--neutral-300)',
        background: 'var(--white)',
      },
    },
    issue ? h(LevelBadge, { level: issue.level }) : null,
    h(
      'span',
      { style: { fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--neutral-500)' } },
      fingerprint
    ),
    h(CopyBtn, { value: fingerprint, label: 'copiar fingerprint' }),
    h('div', { style: { flex: 1 } }),
    h(
      'button',
      {
        onClick: onToggleFull,
        title: fullPage ? 'volver al panel' : 'expandir',
        style: iconBtn(),
      },
      h(ObsIcon, { name: fullPage ? 'collapse' : 'expand', size: 14 })
    ),
    h(
      'button',
      { onClick: onClose, title: 'cerrar', style: iconBtn() },
      h(ObsIcon, { name: 'close', size: 14 })
    )
  );
}

// =============================================================================
// Body (cuando hay datos)
// =============================================================================

function DetailBody({
  detail,
  fullPage,
  onStatusChange,
}: {
  detail: IssueDetailData;
  fullPage: boolean;
  onStatusChange: (status: IssueStatus) => void;
}) {
  const issue = detail.issue;
  const stackFrames = useMemo<StackFrameData[] | null>(
    () => parseStackFromError(detail.sample?.error),
    [detail.sample?.error]
  );
  const [showSystemFrames, setShowSystemFrames] = useState(false);

  return h(
    React.Fragment,
    null,
    h(
      'div',
      {
        style: {
          fontFamily: 'var(--font-sans)',
          fontSize: fullPage ? 20 : 15.5,
          fontWeight: 500,
          lineHeight: 1.35,
          color: 'var(--neutral-950)',
          marginBottom: 12,
        },
      },
      issue.sample_message
    ),
    h(MetaStrip, { issue }),
    h(ActionRow, { issue, onStatusChange }),
    h(Section, {
      title: 'OCURRENCIAS · ÚLTIMAS 24H',
      right: h(SparkSummary, { spark: issue.sparkline_24h }),
      children: h(TimelineChart, { data: issue.sparkline_24h, level: issue.level, fullPage }),
    }),
    stackFrames && stackFrames.length > 0
      ? h(Section, {
          title: 'STACK TRACE',
          right: h(
            'button',
            {
              onClick: () => setShowSystemFrames((s) => !s),
              style: linkBtn(),
            },
            showSystemFrames ? 'ocultar frames de node_modules' : 'expandir frames de node_modules'
          ),
          children: h(StackList, { frames: stackFrames, showSystemFrames }),
        })
      : null,
    detail.sample
      ? ((): React.ReactNode => {
          // Mostramos el log_entry sample completo en lugar de solo
          // context+metadata: lo más útil cuando se debuggea un issue es
          // ver tenant_id/request_id/timestamp/error juntos sin tener que
          // saltar a Stream. compactJson filtra campos sin valor para que
          // el JSON renderizado quede legible.
          const fullSample = compactJson({
            timestamp: detail.sample.timestamp,
            tenant_id: detail.sample.tenant_id,
            request_id: detail.sample.request_id,
            level: detail.sample.level,
            source: detail.sample.source,
            message: detail.sample.message,
            context: detail.sample.context,
            metadata: detail.sample.metadata,
            error: detail.sample.error,
          });
          return h(Section, {
            title: 'SAMPLE · LOG ENTRY',
            right: h(CopyBtn, { value: fullSample, label: 'copiar JSON', size: 13 }),
            children: h(JsonTree, { obj: fullSample }),
          });
        })()
      : null,
    detail.affectedTenants.length > 0
      ? h(Section, {
          title: `TENANTS AFECTADOS · ${detail.affectedTenants.length}`,
          children: h(TenantsList, { tenants: detail.affectedTenants }),
        })
      : null,
    detail.similarEvents.length > 0
      ? h(Section, {
          title: 'EVENTOS SIMILARES · MISMO FINGERPRINT',
          right: h(
            'span',
            {
              style: { fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--neutral-700)' },
            },
            `últimos ${detail.similarEvents.length}`
          ),
          children: h(SimilarEventsList, { events: detail.similarEvents }),
        })
      : null
  );
}

// =============================================================================
// Sub-componentes del body
// =============================================================================

function MetaStrip({ issue }: { issue: LogIssue }) {
  return h(
    'div',
    {
      style: {
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: 10,
        marginBottom: 18,
        padding: '12px 14px',
        background: 'var(--neutral-100)',
        border: '0.5px solid var(--neutral-300)',
        borderRadius: 8,
      },
    },
    h(Meta, {
      label: 'EVENTS',
      value: h(
        'span',
        {
          style: {
            fontFamily: 'var(--font-serif)',
            fontWeight: 900,
            fontSize: 24,
            WebkitTextStroke: '0.25px currentColor',
            letterSpacing: '-0.5px',
          },
        },
        Number(issue.occurrence_count).toLocaleString('es-AR')
      ),
    }),
    h(Meta, {
      label: 'SOURCE',
      value: h('span', { style: { fontFamily: 'var(--font-mono)', fontSize: 12 } }, issue.source),
    }),
    h(Meta, {
      label: 'LAST SEEN',
      value: h('span', { style: { fontSize: 12.5 } }, relTime(issue.last_seen_at)),
      sub: absTime(issue.last_seen_at, true),
    }),
    h(Meta, {
      label: 'FIRST SEEN',
      value: h('span', { style: { fontSize: 12.5 } }, relTime(issue.first_seen_at)),
      sub: absTime(issue.first_seen_at, true),
    })
  );
}

function ActionRow({
  issue,
  onStatusChange,
}: {
  issue: LogIssue;
  onStatusChange: (status: IssueStatus) => void;
}) {
  return h(
    'div',
    { style: { display: 'flex', gap: 6, marginBottom: 22, flexWrap: 'wrap' } },
    issue.status !== 'resolved'
      ? h(
          'button',
          {
            className: 'btn btn-primary btn-sm',
            onClick: () => onStatusChange('resolved'),
          },
          h(ObsIcon, { name: 'check', size: 13 }),
          h('span', null, 'Resolver')
        )
      : h(
          'button',
          {
            className: 'btn btn-secondary btn-sm',
            onClick: () => onStatusChange('open'),
          },
          h(ObsIcon, { name: 'refresh', size: 13 }),
          h('span', null, 'Reabrir')
        ),
    issue.status !== 'muted'
      ? h(
          'button',
          {
            className: 'btn btn-secondary btn-sm',
            onClick: () => onStatusChange('muted'),
          },
          h(ObsIcon, { name: 'mute', size: 13 }),
          h('span', null, 'Silenciar')
        )
      : null
  );
}

function SparkSummary({ spark }: { spark: number[] }) {
  if (spark.length === 0) return null;
  const max = Math.max(...spark);
  const avg = Math.round(spark.reduce((a, b) => a + b, 0) / spark.length);
  return h(
    'span',
    {
      style: {
        display: 'inline-flex',
        gap: 10,
        alignItems: 'center',
        fontFamily: 'var(--font-mono)',
        fontSize: 11,
        color: 'var(--neutral-700)',
      },
    },
    h(
      'span',
      null,
      h('span', { style: { color: 'var(--neutral-500)' } }, 'peak '),
      h('span', { style: { color: 'var(--neutral-950)', fontWeight: 500 } }, `${max}/h`)
    ),
    h('span', { style: { color: 'var(--neutral-500)' } }, '·'),
    h(
      'span',
      null,
      h('span', { style: { color: 'var(--neutral-500)' } }, 'avg '),
      h('span', { style: { color: 'var(--neutral-950)', fontWeight: 500 } }, `${avg}/h`)
    )
  );
}

function StackList({
  frames,
  showSystemFrames,
}: {
  frames: StackFrameData[];
  showSystemFrames: boolean;
}) {
  const visible = frames.filter((f) => showSystemFrames || f.app);
  const collapsedCount = frames.filter((f) => !f.app).length;

  return h(
    'div',
    {
      style: {
        background: 'var(--white)',
        border: '0.5px solid var(--neutral-300)',
        borderRadius: 8,
        overflow: 'hidden',
      },
    },
    ...visible.map((f, i) =>
      h(StackFrame, {
        key: `${f.file}:${f.line}:${i}`,
        frame: f,
        first: i === 0,
      })
    ),
    !showSystemFrames && collapsedCount > 0
      ? h(
          'div',
          {
            style: {
              padding: '6px 16px',
              borderTop: '0.5px dashed var(--neutral-300)',
              fontSize: 11,
              color: 'var(--neutral-500)',
              fontFamily: 'var(--font-mono)',
            },
          },
          `· ${collapsedCount} frames colapsados de node_modules`
        )
      : null
  );
}

function TenantsList({ tenants }: { tenants: IssueDetailData['affectedTenants'] }) {
  return h(
    'div',
    {
      style: {
        background: 'var(--white)',
        border: '0.5px solid var(--neutral-300)',
        borderRadius: 8,
        overflow: 'hidden',
      },
    },
    ...tenants.map((t, i) =>
      h(
        'div',
        {
          key: t.tenant_id,
          style: {
            display: 'grid',
            gridTemplateColumns: '1fr auto auto',
            gap: 10,
            padding: '8px 14px',
            borderBottom: i < tenants.length - 1 ? '0.5px solid var(--neutral-300)' : 'none',
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            alignItems: 'center',
          },
        },
        h('span', { style: { color: 'var(--neutral-950)' } }, t.tenant_id),
        h(
          'span',
          { style: { color: 'var(--neutral-700)' } },
          `${t.count.toLocaleString('es-AR')} eventos`
        ),
        h('span', { style: { color: 'var(--neutral-500)' } }, relTime(t.last_seen))
      )
    )
  );
}

function SimilarEventsList({ events }: { events: IssueDetailData['similarEvents'] }) {
  return h(
    'div',
    {
      style: {
        background: 'var(--white)',
        border: '0.5px solid var(--neutral-300)',
        borderRadius: 8,
        overflow: 'hidden',
      },
    },
    ...events.map((e, i) =>
      h(
        'div',
        {
          key: e.id,
          style: {
            display: 'grid',
            gridTemplateColumns: '90px 1fr 1fr',
            gap: 10,
            padding: '8px 14px',
            borderBottom: i < events.length - 1 ? '0.5px solid var(--neutral-300)' : 'none',
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            alignItems: 'center',
          },
        },
        h('span', { style: { color: 'var(--neutral-500)' } }, absTime(e.timestamp)),
        h(
          'span',
          {
            style: {
              color: 'var(--neutral-950)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            },
          },
          e.message
        ),
        h('span', { style: { color: 'var(--neutral-700)' } }, e.request_id ?? e.tenant_id ?? '—')
      )
    )
  );
}

// =============================================================================
// Generic primitives del detail
// =============================================================================

function Section({
  title,
  right,
  children,
}: {
  title: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return h(
    'section',
    { style: { marginBottom: 22 } },
    h(
      'div',
      {
        style: {
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 8,
        },
      },
      h('div', { className: 't-eyebrow', style: { fontSize: 10.5 } }, title),
      right ?? null
    ),
    children
  );
}

function Meta({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return h(
    'div',
    null,
    h(
      'div',
      {
        style: {
          fontFamily: 'var(--font-sans)',
          fontSize: 9.5,
          fontWeight: 500,
          color: 'var(--neutral-500)',
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          marginBottom: 4,
        },
      },
      label
    ),
    h('div', { style: { color: 'var(--neutral-950)' } }, value),
    sub
      ? h(
          'div',
          {
            style: {
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              color: 'var(--neutral-500)',
              marginTop: 2,
            },
          },
          sub
        )
      : null
  );
}

function LoadingState() {
  return h(
    'div',
    {
      style: { padding: '40px 0', textAlign: 'center', color: 'var(--neutral-500)', fontSize: 13 },
    },
    'cargando…'
  );
}

function ErrorState({ error }: { error: Error }) {
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
    formatError(error)
  );
}

function NotFoundState({ fingerprint }: { fingerprint: string }) {
  return h(
    'div',
    {
      style: { padding: '40px 0', textAlign: 'center', color: 'var(--neutral-500)', fontSize: 13 },
    },
    `Issue ${fingerprint} no encontrado.`
  );
}

/**
 * Quita keys con valores vacíos (null, undefined, '', objeto/array vacío)
 * para que el JSON del sample no esté lleno de "metadata: null" cuando el
 * caller no envió esos campos. Conserva 0 y false (son informativos en logs).
 */
function compactJson(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value === null || value === undefined) continue;
    if (typeof value === 'string' && value === '') continue;
    if (Array.isArray(value) && value.length === 0) continue;
    if (typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0) {
      continue;
    }
    out[key] = value;
  }
  return out;
}

function iconBtn() {
  return {
    width: 28,
    height: 28,
    display: 'inline-flex' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    background: 'transparent',
    border: '0.5px solid var(--neutral-300)',
    borderRadius: 6,
    cursor: 'pointer' as const,
    color: 'var(--neutral-700)',
  };
}

function linkBtn() {
  return {
    background: 'transparent',
    border: 'none' as const,
    fontFamily: 'var(--font-sans)',
    fontSize: 11,
    color: 'var(--neutral-700)',
    cursor: 'pointer' as const,
    textDecoration: 'underline' as const,
  };
}
