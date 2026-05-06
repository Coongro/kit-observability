// Contenido del drawer de span — campos clave (name, kind, status,
// durations) y JsonTree para attributes/resource/events. Cuando se abre
// junto con `traceId`, también se renderea SpanLogsList con los logs
// del request asociado (sección al final).
//
// El componente se diseña para vivir adentro del Drawer (sin card chrome
// propio) — el background blanco y borde los aporta el Drawer. Para uso
// standalone, envolverlo en un wrapper con su propio card.

import { getHostReact } from '@coongro/plugin-sdk';

import type { SpanRecord } from '../_shared/api.js';
import { CopyBtn } from '../_shared/components/copy-btn.js';
import { JsonTree } from '../_shared/components/json-tree.js';
import { absTime, formatDuration } from '../_shared/lib/format-time.js';

import { OTEL_STATUS_CODE_LABEL } from './lib/otel.js';
import { SpanLogsList } from './span-logs-list.js';

const React = getHostReact();
const h = React.createElement;

export interface SpanDetailProps {
  span: SpanRecord;
  durationNs: number;
  inFlight: boolean;
  /**
   * Si está presente, se renderea SpanLogsList con los logs del request
   * asociado al final del drawer.
   */
  traceId?: string;
}

export function SpanDetail({ span, durationNs, inFlight, traceId }: SpanDetailProps) {
  return h(
    'div',
    { style: { display: 'flex', flexDirection: 'column', gap: 16 } },
    h(SpanIdentity, { span, durationNs, inFlight }),
    h(SpanFields, { span, durationNs, inFlight }),
    h(SpanJsonSection, { title: 'attributes', value: span.attributes }),
    h(SpanJsonSection, { title: 'resource', value: span.resource }),
    h(SpanJsonSection, { title: 'events', value: span.events }),
    traceId !== undefined && traceId.length > 0
      ? h(
          'div',
          null,
          h('div', { className: 't-eyebrow', style: { marginBottom: 6 } }, 'LOGS DEL REQUEST'),
          h(SpanLogsList, { traceId })
        )
      : null
  );
}

function SpanIdentity({
  span,
  durationNs,
  inFlight,
}: {
  span: SpanRecord;
  durationNs: number;
  inFlight: boolean;
}) {
  return h(
    'div',
    { style: { display: 'flex', alignItems: 'flex-start', gap: 10 } },
    h(
      'div',
      { style: { flex: 1, minWidth: 0 } },
      h(
        'div',
        {
          style: {
            fontFamily: 'var(--font-mono)',
            fontSize: 14,
            fontWeight: 600,
            color: 'var(--neutral-950)',
            wordBreak: 'break-word',
          },
        },
        span.name
      ),
      h(
        'div',
        {
          style: {
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            color: 'var(--neutral-500)',
            marginTop: 2,
          },
        },
        `${span.span_id} · ${inFlight ? 'in-flight' : formatDuration(durationNs.toString())}`
      )
    ),
    h(CopyBtn, { value: span, label: 'copiar span como JSON', size: 12 })
  );
}

function SpanFields({
  span,
  durationNs,
  inFlight,
}: {
  span: SpanRecord;
  durationNs: number;
  inFlight: boolean;
}) {
  const rows: { label: string; value: string }[] = [
    { label: 'kind', value: span.kind ?? '—' },
    {
      label: 'status',
      value:
        span.status_code === null
          ? '—'
          : (OTEL_STATUS_CODE_LABEL[span.status_code] ?? String(span.status_code)),
    },
    { label: 'service', value: span.service_name ?? '—' },
    { label: 'tenant', value: span.tenant_id ?? 'system' },
    { label: 'request_id', value: span.request_id ?? '—' },
    { label: 'start', value: absTime(span.start_time, true) },
    {
      label: 'end',
      value: span.end_time === null ? (inFlight ? 'in-flight' : '—') : absTime(span.end_time, true),
    },
    { label: 'duration', value: inFlight ? 'in-flight' : formatDuration(durationNs.toString()) },
  ];

  if (span.status_message !== null) {
    rows.push({ label: 'status_message', value: span.status_message });
  }

  return h(
    'div',
    {
      style: {
        display: 'grid',
        gridTemplateColumns: 'auto 1fr',
        rowGap: 4,
        columnGap: 12,
        paddingTop: 10,
        borderTop: '0.5px dashed var(--neutral-300)',
      },
    },
    ...rows.flatMap((r) => [
      h(
        'span',
        {
          key: `lbl-${r.label}`,
          style: {
            fontFamily: 'var(--font-sans)',
            fontSize: 10.5,
            fontWeight: 500,
            color: 'var(--neutral-500)',
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
          },
        },
        r.label
      ),
      h(
        'span',
        {
          key: `val-${r.label}`,
          style: {
            fontFamily: 'var(--font-mono)',
            fontSize: 11.5,
            color: 'var(--neutral-950)',
            wordBreak: 'break-all',
          },
        },
        r.value
      ),
    ])
  );
}

function SpanJsonSection({ title, value }: { title: string; value: unknown }) {
  // attributes/resource/events vienen tipados como `unknown` desde wire.ts:
  // si una fila viniera malformada (string en lugar de objeto) y se castease
  // directo a Record, JsonTree iteraría caracteres y crashearía. Filtramos
  // todo lo que no sea un plain object con keys.
  if (value === null || typeof value !== 'object') return null;
  if (Object.keys(value).length === 0) return null;
  return h(
    'div',
    null,
    h('div', { className: 't-eyebrow', style: { marginBottom: 6 } }, title),
    h(JsonTree, { obj: value as Record<string, unknown> })
  );
}
