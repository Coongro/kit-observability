// Header del trace según el prototype TraceView.jsx:
//   - Top row: eyebrow + título + trace_id mono + CopyBtn + botón "cambiar"
//     (picker dropdown con recientes) + Copy as JSON + Open in Claude Code.
//   - Bottom row: meta strip con bg neutral-100, separadores Sep verticales
//     y MetaCells (DURACIÓN serif, STATUS, SPANS, TENANT, REQUEST_ID, INICIO).
//
// El picker pide a /traces/recent on-demand (al abrir) — evita bajar el
// listado mientras el usuario está mirando el trace activo.

import { getHostReact, usePlugin } from '@coongro/plugin-sdk';

import { listRecentTraces, type RecentTrace, type TraceQueryResult } from '../_shared/api.js';
import { CopyBtn } from '../_shared/components/copy-btn.js';
import { ObsIcon } from '../_shared/components/icons.js';
import { popoverStyle, usePopover } from '../_shared/components/popover.js';
import { copyToClipboard } from '../_shared/lib/clipboard.js';
import { absTime, formatDuration, relTime } from '../_shared/lib/format-time.js';

import type { TraceTree } from './lib/build-tree.js';
import { OTEL_STATUS_CODE_ERROR } from './lib/otel.js';

const React = getHostReact();
const h = React.createElement;
const { useEffect, useState } = React;

const RECENTS_LIMIT = 30;

export interface TraceHeaderProps {
  data: TraceQueryResult;
  tree: TraceTree;
  loading: boolean;
  onRefresh: () => void;
  /** Cambiar a otro trace (selecciona desde el picker). */
  onSelectTrace: (traceId: string) => void;
}

export function TraceHeader({ data, tree, loading, onRefresh, onSelectTrace }: TraceHeaderProps) {
  const errorCount = countErrors(tree);
  const status: 'ok' | 'error' = errorCount > 0 ? 'error' : 'ok';
  const rootSpan = tree.roots[0]?.span ?? null;
  const tenantId = rootSpan?.tenant_id ?? null;
  const requestId = rootSpan?.request_id ?? null;
  const startIso = rootSpan?.start_time ?? null;

  return h(
    'div',
    {
      style: {
        background: 'var(--white)',
        borderBottom: '0.5px solid var(--neutral-300)',
        flexShrink: 0,
      },
    },
    h(TopRow, {
      data,
      tree,
      loading,
      onRefresh,
      onSelectTrace,
    }),
    h(MetaStrip, {
      tree,
      errorCount,
      status,
      tenantId,
      requestId,
      startIso,
    })
  );
}

interface TopRowProps {
  data: TraceQueryResult;
  tree: TraceTree;
  loading: boolean;
  onRefresh: () => void;
  onSelectTrace: (traceId: string) => void;
}

function TopRow({ data, tree, loading, onRefresh, onSelectTrace }: TopRowProps) {
  return h(
    'div',
    {
      style: {
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        padding: '18px 22px 10px',
        gap: 12,
        flexWrap: 'wrap',
      },
    },
    h(
      'div',
      { style: { minWidth: 0, flex: '1 1 320px' } },
      h('div', { className: 't-eyebrow' }, 'OBSERVABILIDAD · DISTRIBUTED TRACE · OPENTELEMETRY'),
      h(
        'div',
        {
          style: {
            display: 'flex',
            alignItems: 'baseline',
            gap: 14,
            marginTop: 4,
            flexWrap: 'wrap',
          },
        },
        h('h1', { className: 't-page-title', style: { margin: 0 } }, 'Trace'),
        h(
          'span',
          {
            style: {
              fontFamily: 'var(--font-mono)',
              fontSize: 12.5,
              color: 'var(--neutral-950)',
              fontWeight: 500,
              maxWidth: 280,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            },
          },
          data.trace_id
        ),
        h(CopyBtn, { value: data.trace_id, label: 'copiar trace_id', size: 13 }),
        h(TracePicker, { currentTraceId: data.trace_id, onSelectTrace })
      )
    ),
    h(TopActions, { data, loading, tree, onRefresh })
  );
}

function TopActions({
  data,
  loading,
  tree,
  onRefresh,
}: {
  data: TraceQueryResult;
  loading: boolean;
  tree: TraceTree;
  onRefresh: () => void;
}) {
  const { toast } = usePlugin();
  // tree no se usa visualmente acá pero se reserva en la signature por simetría
  // con TopRow — futuras acciones (ej. "abrir issue del span con error") lo
  // pueden necesitar sin reescribir el contrato.
  void tree;

  const onCopyJson = async () => {
    const ok = await copyToClipboard(JSON.stringify(data, null, 2));
    if (ok) toast.success('Trace copiado como JSON', '');
    else toast.error('No se pudo copiar al portapapeles', '');
  };

  const onOpenInClaudeCode = async () => {
    const cmd = `coongro logs trace --id=${data.trace_id}`;
    const ok = await copyToClipboard(cmd);
    if (ok) toast.success('Comando copiado', cmd);
    else toast.error('No se pudo copiar al portapapeles', cmd);
  };

  return h(
    'div',
    { style: { display: 'flex', gap: 6, alignItems: 'center' } },
    h(
      'button',
      {
        className: 'btn btn-secondary btn-sm',
        onClick: onRefresh,
        disabled: loading,
        title: 'refresh',
      },
      h(ObsIcon, { name: 'refresh', size: 13 })
    ),
    h(
      'button',
      { className: 'btn btn-secondary btn-sm', onClick: () => void onCopyJson() },
      h(ObsIcon, { name: 'copy', size: 13 }),
      h('span', null, 'Copy as JSON')
    ),
    h(
      'button',
      { className: 'btn btn-dark btn-sm', onClick: () => void onOpenInClaudeCode() },
      h(ObsIcon, { name: 'code', size: 13 }),
      h('span', null, 'Open in Claude Code')
    )
  );
}

function TracePicker({
  currentTraceId,
  onSelectTrace,
}: {
  currentTraceId: string;
  onSelectTrace: (traceId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [recents, setRecents] = useState<RecentTrace[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const ref = usePopover(open, () => setOpen(false));

  // Carga lazy: solo bajamos recents cuando el usuario abre el picker.
  useEffect(() => {
    if (!open || recents !== null) return;
    const ctrl = new AbortController();
    listRecentTraces({ signal: ctrl.signal, limit: RECENTS_LIMIT }).then(
      (r) => setRecents(r.traces),
      (err) => {
        if (ctrl.signal.aborted) return;
        setLoadError(err instanceof Error ? err.message : String(err));
      }
    );
    return () => ctrl.abort();
  }, [open, recents]);

  return h(
    'span',
    { ref, style: { position: 'relative' } },
    h(
      'button',
      {
        onClick: () => setOpen((o: boolean) => !o),
        style: {
          height: 24,
          padding: '0 8px',
          background: 'var(--neutral-100)',
          border: '0.5px solid var(--neutral-300)',
          borderRadius: 4,
          fontFamily: 'var(--font-sans)',
          fontSize: 11.5,
          color: 'var(--neutral-700)',
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
        },
      },
      h('span', null, 'cambiar'),
      h(ObsIcon, { name: 'chevDown', size: 11 })
    ),
    open
      ? h(
          'div',
          {
            style: {
              ...popoverStyle(),
              width: 480,
              maxHeight: 360,
              overflowY: 'auto',
            },
          },
          recents === null && loadError === null
            ? h(PickerStatus, { msg: 'cargando recientes…' })
            : null,
          loadError !== null
            ? h(PickerStatus, { msg: `error: ${loadError}`, tone: 'danger' })
            : null,
          recents !== null && recents.length === 0
            ? h(PickerStatus, { msg: 'sin traces recientes' })
            : null,
          recents !== null
            ? recents.map((t) =>
                h(PickerRow, {
                  key: t.trace_id,
                  trace: t,
                  active: t.trace_id === currentTraceId,
                  onSelect: () => {
                    setOpen(false);
                    if (t.trace_id !== currentTraceId) onSelectTrace(t.trace_id);
                  },
                })
              )
            : null
        )
      : null
  );
}

function PickerStatus({ msg, tone = 'neutral' }: { msg: string; tone?: 'danger' | 'neutral' }) {
  return h(
    'div',
    {
      style: {
        padding: '12px 14px',
        fontFamily: 'var(--font-sans)',
        fontSize: 12,
        color: tone === 'danger' ? 'var(--red-deep)' : 'var(--neutral-500)',
        fontStyle: tone === 'neutral' ? 'italic' : 'normal',
      },
    },
    msg
  );
}

function PickerRow({
  trace,
  active,
  onSelect,
}: {
  trace: RecentTrace;
  active: boolean;
  onSelect: () => void;
}) {
  const isError = trace.error_count > 0;
  return h(
    'button',
    {
      onClick: onSelect,
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '10px 12px',
        width: '100%',
        textAlign: 'left',
        background: active ? 'var(--neutral-100)' : 'transparent',
        border: 'none',
        borderBottom: '0.5px solid var(--neutral-300)',
        cursor: 'pointer',
        fontFamily: 'var(--font-sans)',
        fontSize: 12,
        color: 'var(--neutral-950)',
      },
    },
    h(StatusDotMini, { status: isError ? 'error' : 'ok' }),
    h(
      'span',
      {
        style: {
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          color: 'var(--neutral-700)',
        },
      },
      `${trace.trace_id.slice(0, 12)}…`
    ),
    h(
      'span',
      {
        style: {
          flex: 1,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        },
      },
      trace.root_name ?? '—'
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
      formatDuration(trace.duration_ns)
    )
  );
}

function StatusDotMini({ status }: { status: 'ok' | 'error' }) {
  return h('span', {
    style: {
      width: 7,
      height: 7,
      borderRadius: '50%',
      background: status === 'error' ? 'var(--red)' : 'var(--teal)',
      display: 'inline-block',
      flexShrink: 0,
    },
  });
}

interface MetaStripProps {
  tree: TraceTree;
  errorCount: number;
  status: 'ok' | 'error';
  tenantId: string | null;
  requestId: string | null;
  startIso: string | null;
}

function MetaStrip({ tree, errorCount, status, tenantId, requestId, startIso }: MetaStripProps) {
  const durationMs = tree.traceDurationMs;
  const durationColor =
    status === 'error' ? 'var(--red)' : durationMs > 500 ? 'var(--gold-dk)' : 'var(--teal-dk)';

  return h(
    'div',
    {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 0,
        padding: '12px 22px',
        background: 'var(--neutral-100)',
        borderTop: '0.5px solid var(--neutral-300)',
        flexWrap: 'wrap',
        rowGap: 8,
      },
    },
    h(MetaCell, {
      label: 'DURACIÓN',
      value: h(DurationValue, { ms: durationMs, color: durationColor }),
    }),
    h(Sep),
    h(MetaCell, {
      label: 'STATUS',
      value: h(StatusBadge, { status }),
    }),
    h(Sep),
    h(MetaCell, {
      label: 'SPANS',
      value: h(SpansValue, { total: tree.originalSpanCount, errors: errorCount }),
    }),
    h(Sep),
    h(MetaCell, {
      label: 'TENANT',
      value: h(
        'span',
        {
          style: {
            fontFamily: 'var(--font-sans)',
            fontSize: 12.5,
            fontWeight: 500,
            color: 'var(--neutral-950)',
          },
        },
        tenantId ?? 'system'
      ),
    }),
    h(Sep),
    h(MetaCell, {
      label: 'REQUEST_ID',
      value:
        requestId !== null
          ? h(
              'span',
              { style: { display: 'inline-flex', alignItems: 'center', gap: 4 } },
              h(
                'span',
                {
                  style: {
                    fontFamily: 'var(--font-mono)',
                    fontSize: 11.5,
                    color: 'var(--neutral-950)',
                  },
                },
                requestId
              ),
              h(CopyBtn, { value: requestId, label: 'copiar request_id', size: 11 })
            )
          : h(MutedDash),
    }),
    h(Sep),
    h(MetaCell, {
      label: 'INICIO',
      value:
        startIso !== null
          ? h(
              'span',
              {
                style: {
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11.5,
                  color: 'var(--neutral-950)',
                },
              },
              absTime(startIso, true)
            )
          : h(MutedDash),
      sub:
        startIso !== null
          ? h(
              'span',
              {
                style: {
                  fontFamily: 'var(--font-sans)',
                  fontSize: 10.5,
                  color: 'var(--neutral-500)',
                },
              },
              relTime(startIso)
            )
          : null,
    })
  );
}

function MutedDash() {
  return h(
    'span',
    {
      style: {
        fontFamily: 'var(--font-mono)',
        fontSize: 11,
        color: 'var(--neutral-500)',
      },
    },
    '—'
  );
}

function MetaCell({
  label,
  value,
  sub,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
}) {
  return h(
    'div',
    { style: { flex: '1 1 140px', minWidth: 140, padding: '0 14px' } },
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
    h('div', { style: { color: 'var(--neutral-950)', minWidth: 0 } }, value),
    sub !== undefined && sub !== null ? h('div', { style: { marginTop: 2 } }, sub) : null
  );
}

function Sep() {
  return h('div', {
    style: {
      width: 0.5,
      height: 30,
      background: 'var(--neutral-300)',
    },
  });
}

function DurationValue({ ms, color }: { ms: number; color: string }) {
  return h(
    'span',
    {
      style: {
        fontFamily: 'var(--font-serif)',
        fontWeight: 900,
        fontSize: 22,
        letterSpacing: '-0.5px',
        WebkitTextStroke: '0.25px currentColor',
        color,
      },
    },
    Math.round(ms).toString(),
    h(
      'span',
      {
        style: {
          fontFamily: 'var(--font-mono)',
          fontSize: 12,
          marginLeft: 3,
          fontWeight: 500,
          WebkitTextStroke: 0,
        },
      },
      'ms'
    )
  );
}

function SpansValue({ total, errors }: { total: number; errors: number }) {
  return h(
    'span',
    {
      style: {
        fontFamily: 'var(--font-mono)',
        fontSize: 14,
        fontWeight: 500,
        color: 'var(--neutral-950)',
      },
    },
    total.toString(),
    errors > 0
      ? h('span', { style: { color: 'var(--red)', marginLeft: 8 } }, `· ${errors} con error`)
      : null
  );
}

function StatusBadge({ status }: { status: 'ok' | 'error' }) {
  const isError = status === 'error';
  return h(
    'span',
    {
      style: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: '2px 7px',
        borderRadius: 4,
        background: isError ? 'var(--red)' : 'var(--teal-soft)',
        color: isError ? 'var(--white)' : 'var(--teal-deep)',
        fontFamily: 'var(--font-sans)',
        fontSize: 11,
        fontWeight: 500,
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
      },
    },
    h('span', {
      style: {
        width: 6,
        height: 6,
        borderRadius: '50%',
        background: isError ? 'var(--white)' : 'var(--teal-dk)',
      },
    }),
    isError ? 'error' : 'ok'
  );
}

function countErrors(tree: TraceTree): number {
  let n = 0;
  function walk(nodes: TraceTree['roots']): void {
    for (const node of nodes) {
      if (node.span.status_code === OTEL_STATUS_CODE_ERROR) n += 1;
      walk(node.children);
    }
  }
  walk(tree.roots);
  return n;
}
