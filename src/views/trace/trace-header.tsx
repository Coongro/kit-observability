// Header del trace con metadata + acciones rápidas. Reemplaza la versión
// simple del PageHeader: además de los counters (spans / errores), tiene
// chip de tenant, "Copy as JSON" del trace completo y "Open in Claude
// Code" que copia el comando MCP al portapapeles.
//
// Vive en views/trace porque la combinación de campos es muy específica
// (un trace tiene metadata distinta a logs/issues). El layout sí imita el
// PageHeader (eyebrow + título + stats inline) para que la familia visual
// sea consistente con el resto del kit.

import { getHostReact, usePlugin } from '@coongro/plugin-sdk';

import type { TraceQueryResult } from '../_shared/api.js';
import { CopyBtn } from '../_shared/components/copy-btn.js';
import { ObsIcon } from '../_shared/components/icons.js';
import { copyToClipboard } from '../_shared/lib/clipboard.js';
import { shortenId } from '../_shared/lib/format-id.js';
import { absTime, formatDuration } from '../_shared/lib/format-time.js';

import type { TraceTree } from './lib/build-tree.js';
import { OTEL_STATUS_CODE_ERROR } from './lib/otel.js';

const React = getHostReact();
const h = React.createElement;

export interface TraceHeaderProps {
  data: TraceQueryResult;
  tree: TraceTree;
  loading: boolean;
  onRefresh: () => void;
  /** Cambiar de trace (volver al selector). */
  onClear: () => void;
}

export function TraceHeader({ data, tree, loading, onRefresh, onClear }: TraceHeaderProps) {
  const errorCount = countErrors(tree);
  const tenants = collectTenants(tree);

  return h(
    'div',
    {
      style: {
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        padding: '18px 22px 14px',
        background: 'var(--white)',
        borderBottom: '0.5px solid var(--neutral-300)',
        gap: 18,
        flexWrap: 'wrap',
      },
    },
    h(TraceMeta, {
      data,
      tree,
      errorCount,
      tenants,
    }),
    h(TraceActions, { data, loading, onRefresh, onClear })
  );
}

function TraceMeta({
  data,
  tree,
  errorCount,
  tenants,
}: {
  data: TraceQueryResult;
  tree: TraceTree;
  errorCount: number;
  tenants: string[];
}) {
  const rootSpan = tree.roots[0]?.span;
  const startIso = rootSpan?.start_time ?? data.spans[0]?.start_time ?? null;

  return h(
    'div',
    { style: { minWidth: 0 } },
    h('div', { className: 't-eyebrow' }, 'OBSERVABILIDAD · WATERFALL'),
    h(
      'div',
      {
        style: { display: 'flex', alignItems: 'baseline', gap: 14, marginTop: 4, flexWrap: 'wrap' },
      },
      h('h1', { className: 't-page-title', style: { margin: 0 } }, 'Trace'),
      h(TraceIdChip, { traceId: data.trace_id }),
      h(SeparatorDot),
      h(Stat, {
        value: tree.originalSpanCount.toLocaleString('es-AR'),
        label: 'spans',
      }),
      h(SeparatorDot),
      h(Stat, {
        value: errorCount.toLocaleString('es-AR'),
        label: 'errores',
        tone: errorCount > 0 ? 'danger' : 'neutral',
      }),
      h(SeparatorDot),
      h(Stat, {
        value: formatDuration(tree.traceDurationNs.toString()),
        label: 'duración',
      })
    ),
    h(
      'div',
      {
        style: {
          marginTop: 8,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          flexWrap: 'wrap',
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          color: 'var(--neutral-700)',
        },
      },
      startIso !== null ? h('span', null, absTime(startIso, true)) : null,
      tenants.length > 0
        ? h(TenantChips, { tenants })
        : h('span', { style: { color: 'var(--neutral-500)' } }, 'sin tenant'),
      data.truncated
        ? h(
            'span',
            {
              style: {
                padding: '1px 6px',
                background: 'var(--gold-soft)',
                color: 'var(--gold-deep)',
                borderRadius: 3,
                fontSize: 10.5,
                fontWeight: 500,
              },
            },
            'truncado · primeros 1000'
          )
        : null
    )
  );
}

function TraceIdChip({ traceId }: { traceId: string }) {
  return h(
    'span',
    {
      style: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '3px 8px',
        background: 'var(--neutral-100)',
        border: '0.5px solid var(--neutral-300)',
        borderRadius: 4,
        fontFamily: 'var(--font-mono)',
        fontSize: 11.5,
        color: 'var(--neutral-700)',
      },
    },
    h('span', null, shortenId(traceId, 8, 8, 16)),
    h(CopyBtn, { value: traceId, label: 'copiar trace_id', size: 11 })
  );
}

function TenantChips({ tenants }: { tenants: string[] }) {
  return h(
    'span',
    { style: { display: 'inline-flex', gap: 4, flexWrap: 'wrap' } },
    ...tenants.slice(0, 3).map((t) =>
      h(
        'span',
        {
          key: t,
          style: {
            padding: '1px 6px',
            background: 'var(--neutral-200)',
            borderRadius: 3,
            fontSize: 10.5,
            color: 'var(--neutral-700)',
          },
        },
        shortenId(t)
      )
    ),
    tenants.length > 3
      ? h('span', { style: { color: 'var(--neutral-500)' } }, `+${tenants.length - 3}`)
      : null
  );
}

function SeparatorDot() {
  return h(
    'span',
    {
      style: { fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--neutral-500)' },
    },
    '·'
  );
}

interface StatProps {
  value: string;
  label: string;
  tone?: 'danger' | 'neutral';
}

function Stat({ value, label, tone = 'neutral' }: StatProps) {
  return h(
    'div',
    { style: { display: 'flex', alignItems: 'baseline', gap: 6 } },
    h(
      'span',
      {
        style: {
          fontFamily: 'var(--font-serif)',
          fontWeight: 900,
          fontSize: 22,
          WebkitTextStroke: '0.25px currentColor',
          color: tone === 'danger' ? 'var(--red)' : 'var(--neutral-950)',
          letterSpacing: '-0.5px',
        },
      },
      value
    ),
    h(
      'span',
      {
        style: { fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--neutral-700)' },
      },
      label
    )
  );
}

function TraceActions({
  data,
  loading,
  onRefresh,
  onClear,
}: {
  data: TraceQueryResult;
  loading: boolean;
  onRefresh: () => void;
  onClear: () => void;
}) {
  const { toast } = usePlugin();

  const onOpenInClaudeCode = async () => {
    const cmd = `coongro logs trace --id=${data.trace_id}`;
    const ok = await copyToClipboard(cmd);
    if (ok) {
      toast.success('Comando copiado', cmd);
    } else {
      toast.error('No se pudo copiar al portapapeles', cmd);
    }
  };

  return h(
    'div',
    { style: { display: 'flex', gap: 6, alignSelf: 'flex-end' } },
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
    h(CopyBtn, { value: data, label: 'copiar trace como JSON', size: 13 }),
    h(
      'button',
      {
        className: 'btn btn-secondary btn-sm',
        onClick: () => void onOpenInClaudeCode(),
        title: 'copiar comando coongro logs trace al portapapeles',
      },
      h(ObsIcon, { name: 'link', size: 13 }),
      h('span', null, 'Open in Claude Code')
    ),
    h(
      'button',
      {
        className: 'btn btn-ghost btn-sm',
        onClick: onClear,
        title: 'volver al selector de traces',
      },
      h(ObsIcon, { name: 'close', size: 13 }),
      h('span', null, 'cerrar')
    )
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

function collectTenants(tree: TraceTree): string[] {
  const seen = new Set<string>();
  function walk(nodes: TraceTree['roots']): void {
    for (const node of nodes) {
      if (node.span.tenant_id !== null) seen.add(node.span.tenant_id);
      walk(node.children);
    }
  }
  walk(tree.roots);
  return [...seen];
}
