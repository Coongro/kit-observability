import { getHostReact, usePlugin } from '@coongro/plugin-sdk';

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
import { copyToClipboard } from '../_shared/lib/clipboard.js';
import { absTime, relTime } from '../_shared/lib/format-time.js';
import { extractSearchToken } from '../_shared/lib/issue-search-token.js';
import { openStream } from '../_shared/lib/open-stream.js';
import { openTrace } from '../_shared/lib/open-trace.js';
import { computeWindow } from '../_shared/lib/time-window.js';
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
  const { views } = usePlugin();
  const latestRequestId = data?.sample?.request_id ?? null;

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
      onOpenLatestTrace: latestRequestId !== null ? () => openTrace(views, latestRequestId) : null,
      onOpenInStream:
        data?.issue !== null && data?.issue !== undefined
          ? () => {
              // Componemos los 3 filtros en una sola navegación. El backend
              // los aplica como AND, así que cada uno es opcional y refina
              // sin romper:
              //   - source + tenant: ya pre-existía, narrowing grueso.
              //   - requestId: cuando el sample lo tiene, salto quirúrgico
              //     a la cadena del request (caso típico: error en HTTP
              //     handler).
              //   - q (search token): heurístico desde el mensaje cuando no
              //     hay request_id (caso típico: audit/cron sin contexto
              //     HTTP, ej. el DRIFT del TenantStateAudit).
              //   - window ±2 min de last_seen_at: captura todos los logs
              //     emitidos en el mismo pase (ej. header DRIFT + sus 7
              //     detail lines), incluso cuando no comparten request_id.
              const issue = data.issue;
              const window = computeWindow(issue.last_seen_at, 2 * 60 * 1000);
              const fallbackToken =
                latestRequestId === null ? extractSearchToken(issue.sample_message) : null;
              openStream(views, {
                source: issue.source,
                tenantId: issue.tenant_id,
                requestId: latestRequestId,
                q: fallbackToken,
                from: window?.from ?? null,
                to: window?.to ?? null,
              });
            }
          : null,
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
  onOpenLatestTrace,
  onOpenInStream,
}: {
  issue: LogIssue | null;
  fingerprint: string;
  fullPage: boolean;
  onClose: () => void;
  onToggleFull: () => void;
  /** null mientras carga el detail o cuando el sample no tiene request_id. */
  onOpenLatestTrace: (() => void) | null;
  /** null mientras carga el detail. Cuando hay issue, abre Stream filtrado
   * por su source + tenant para ver el contexto completo (header + lines
   * below en casos como TenantStateAudit). */
  onOpenInStream: (() => void) | null;
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
    onOpenInStream !== null
      ? h(
          'button',
          {
            className: 'btn btn-secondary btn-sm',
            onClick: onOpenInStream,
            title: 'abrir Stream filtrado por source + tenant del issue',
          },
          h(ObsIcon, { name: 'list', size: 13 }),
          h('span', null, 'Ver en Stream')
        )
      : null,
    onOpenLatestTrace !== null
      ? h(
          'button',
          {
            className: 'btn btn-secondary btn-sm',
            onClick: onOpenLatestTrace,
            title: 'abrir el waterfall del último request del issue',
          },
          h(ObsIcon, { name: 'link', size: 13 }),
          h('span', null, 'Ver último trace')
        )
      : null,
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
    h(Section, {
      title: 'STACK TRACE',
      right:
        stackFrames && stackFrames.some((f) => !f.app)
          ? h(
              'button',
              {
                onClick: () => setShowSystemFrames((s) => !s),
                style: linkBtn(),
              },
              showSystemFrames
                ? 'ocultar frames de node_modules'
                : 'expandir frames de node_modules'
            )
          : null,
      children:
        stackFrames && stackFrames.length > 0
          ? h(StackList, { frames: stackFrames, showSystemFrames })
          : h(NoStackPlaceholder),
    }),
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
  const { toast } = usePlugin();

  const onOpenInClaudeCode = (): void => {
    void (async () => {
      const cmd = `coongro logs query --fingerprint=${issue.fingerprint}`;
      const ok = await copyToClipboard(cmd);
      if (ok) toast.success('Comando copiado', cmd);
      else toast.error('No se pudo copiar al portapapeles', cmd);
    })();
  };

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
    // Snooze 24h: el backend NO tiene status `snoozed` (solo open/resolved/
    // muted); el prototype lo tenía como mock. Lo dejamos visible pero
    // disabled para mantener fidelidad visual con el diseño y el tooltip
    // explica por qué no funciona — cuando el backend lo soporte, basta
    // con remover `disabled` y pasar el status correcto a `onStatusChange`.
    h(
      'button',
      {
        className: 'btn btn-secondary btn-sm',
        disabled: true,
        title: 'pendiente: el backend no expone status `snoozed` aún',
      },
      h(ObsIcon, { name: 'snooze', size: 13 }),
      h('span', null, 'Snooze 24h')
    ),
    issue.status !== 'muted'
      ? h(
          'button',
          {
            className: 'btn btn-secondary btn-sm',
            onClick: () => onStatusChange('muted'),
          },
          h(ObsIcon, { name: 'mute', size: 13 }),
          h('span', null, 'Ignorar')
        )
      : h(
          'button',
          {
            className: 'btn btn-secondary btn-sm',
            onClick: () => onStatusChange('open'),
          },
          h(ObsIcon, { name: 'refresh', size: 13 }),
          h('span', null, 'Reactivar')
        ),
    h(
      'button',
      { className: 'btn btn-dark btn-sm', onClick: onOpenInClaudeCode },
      h(ObsIcon, { name: 'code', size: 13 }),
      h('span', null, 'Abrir en Claude Code')
    )
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

function NoStackPlaceholder() {
  // El parser solo entiende `error.stack` (string V8) o `error.frames` (ya
  // parseado). Si el log_entry no trae ninguno de los dos, mostramos esto
  // en lugar de ocultar la sección — el usuario espera verla y la ausencia
  // del stack es un dato útil ("este error no fue capturado con stack").
  return h(
    'div',
    {
      style: {
        padding: '14px 16px',
        background: 'var(--white)',
        border: '0.5px solid var(--neutral-300)',
        borderRadius: 8,
        fontFamily: 'var(--font-sans)',
        fontSize: 12,
        color: 'var(--neutral-500)',
        fontStyle: 'italic',
      },
    },
    'Este log_entry no incluye un stack trace parseable.'
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
  const { views } = usePlugin();
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
    ...events.map((e, i) => {
      const hasTrace = e.request_id !== null && e.request_id.length > 0;
      // Layout en dos líneas: arriba metadata compacta (timestamp · level ·
      // tenant · request_id · chev), abajo el mensaje completo. Mensajes
      // largos como "[TenantStateAudit] DRIFT DETECTED ..." quedaban
      // elípsizados en una grid horizontal cuando 6 rows competían por el
      // mismo `1fr`. Stack vertical → leíble sin tooltip + sigue siendo
      // dense (8px padding).
      return h(
        'div',
        {
          key: e.id,
          onClick: hasTrace ? () => openTrace(views, e.request_id) : undefined,
          title: hasTrace ? 'ver waterfall del trace' : 'sin trace asociado',
          style: {
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
            padding: '10px 14px',
            borderBottom: i < events.length - 1 ? '0.5px solid var(--neutral-300)' : 'none',
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            cursor: hasTrace ? 'pointer' : 'default',
          },
        },
        // Metadata row
        h(
          'div',
          {
            style: {
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              minWidth: 0,
            },
          },
          h(
            'span',
            { style: { color: 'var(--neutral-500)', flexShrink: 0 } },
            absTime(e.timestamp)
          ),
          h(LevelBadge, { level: e.level, size: 'sm' }),
          e.tenant_id !== null
            ? h(
                'span',
                {
                  style: {
                    color: 'var(--neutral-700)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    maxWidth: 110,
                  },
                  title: e.tenant_id,
                },
                e.tenant_id.slice(0, 8)
              )
            : null,
          e.request_id !== null
            ? h(
                'span',
                {
                  style: {
                    color: hasTrace ? 'var(--teal-deep)' : 'var(--neutral-700)',
                    textDecoration: hasTrace ? 'underline' : 'none',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    flex: 1,
                    minWidth: 0,
                  },
                  title: e.request_id,
                },
                e.request_id
              )
            : h('span', { style: { color: 'var(--neutral-500)', flex: 1 } }, '—'),
          hasTrace
            ? h(ObsIcon, {
                name: 'chevRight',
                size: 11,
                style: { color: 'var(--neutral-500)', flexShrink: 0 },
              })
            : null
        ),
        // Mensaje row — wrap normal, sin truncar
        h(
          'div',
          {
            style: {
              fontFamily: 'var(--font-sans)',
              fontSize: 12,
              color: 'var(--neutral-950)',
              lineHeight: 1.4,
              wordBreak: 'break-word',
            },
          },
          e.message
        )
      );
    })
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
