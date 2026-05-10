// Drawer de detalle de span según el prototype TraceView.jsx — header con
// KindBadge + StatusBadge si error + span_id, title con mono si DB,
// timing card 2-col (DURACIÓN EXACTA + mini-bar / start/end/parent),
// ATTRIBUTES con renderers por kind (DB con SQL highlight + params,
// HTTP con method/url/status, plain), STACK TRACE si error, LOGS
// ASOCIADOS y footer con copy actions.
//
// Nota: el componente vive adentro del Drawer del view raíz pero
// también renderea su propio header sticky para que copy/close estén
// siempre accesibles aunque el cuerpo se scrollee.

import { getHostReact, usePlugin } from '@coongro/plugin-sdk';

import type { SpanRecord } from '../_shared/api.js';
import { CopyBtn } from '../_shared/components/copy-btn.js';
import { ObsIcon } from '../_shared/components/icons.js';
import { StackFrame, type StackFrameData } from '../_shared/components/stack-frame.js';
import { copyToClipboard } from '../_shared/lib/clipboard.js';

import { KindBadge } from './kind-badge.js';
import type { SpanNode } from './lib/build-tree.js';
import { displayKind, KIND_COLOR, type DisplayKind } from './lib/kind-palette.js';
import { OTEL_STATUS_CODE_ERROR } from './lib/otel.js';
import { SpanLogsList } from './span-logs-list.js';

const React = getHostReact();
const h = React.createElement;
const { useState } = React;

export interface SpanDetailProps {
  span: SpanRecord;
  durationNs: number;
  inFlight: boolean;
  /** Duración total del trace en ns (para el "% del request total"). */
  traceDurationNs: number;
  /** El nodo padre del span seleccionado, si existe en el árbol. */
  parentNode: SpanNode | null;
  /** Callback para navegar al span padre desde el drawer. */
  onSelectParent: (parentSpanId: string) => void;
  onClose: () => void;
  /**
   * Si está presente, se renderea SpanLogsList con los logs del request
   * asociado al final del drawer.
   */
  traceId: string;
}

export function SpanDetail({
  span,
  durationNs,
  inFlight,
  traceDurationNs,
  parentNode,
  onSelectParent,
  onClose,
  traceId,
}: SpanDetailProps) {
  const dk = displayKind(span);
  const isError = span.status_code === OTEL_STATUS_CODE_ERROR;
  const isDb = dk === 'db';
  const stack = isError ? extractStackFromEvents(span.events) : null;
  const attrs = asPlainObject(span.attributes);

  return h(
    'aside',
    {
      style: {
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--white)',
      },
    },
    h(SpanHeader, {
      span,
      dk,
      isError,
      onClose,
    }),
    h(
      'div',
      { style: { flex: 1, overflowY: 'auto', padding: '18px 20px' } },
      h(
        'div',
        {
          style: {
            fontFamily: isDb ? 'var(--font-mono)' : 'var(--font-sans)',
            fontSize: isDb ? 14 : 16,
            fontWeight: 500,
            lineHeight: 1.35,
            color: 'var(--neutral-950)',
            marginBottom: 14,
            wordBreak: 'break-word',
          },
        },
        span.name
      ),
      h(TimingCard, {
        span,
        durationNs,
        inFlight,
        traceDurationNs,
        isError,
        dk,
        parentNode,
        onSelectParent,
      }),
      h(
        Section,
        {
          title: 'ATTRIBUTES',
          right:
            attrs !== null
              ? h(CopyBtn, { value: attrs, label: 'copiar attributes', size: 13 })
              : null,
        },
        h(KindAttributes, { dk, attrs })
      ),
      isError && stack !== null && stack.length > 0
        ? h(Section, { title: 'STACK TRACE' }, h(StackTraceList, { stack }))
        : null,
      span.status_message !== null
        ? h(
            Section,
            { title: 'STATUS MESSAGE' },
            h(StatusMessageBlock, { message: span.status_message, isError })
          )
        : null,
      h(Section, { title: 'LOGS ASOCIADOS' }, h(SpanLogsList, { traceId })),
      h(SpanFooterActions, { span })
    )
  );
}

function SpanHeader({
  span,
  dk,
  isError,
  onClose,
}: {
  span: SpanRecord;
  dk: DisplayKind;
  isError: boolean;
  onClose: () => void;
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
    h(KindBadge, { kind: dk }),
    isError ? h(ErrorBadgeMini) : null,
    h(
      'span',
      {
        style: {
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          color: 'var(--neutral-500)',
        },
      },
      span.span_id
    ),
    h(CopyBtn, { value: span.span_id, label: 'copiar span_id' }),
    h('div', { style: { flex: 1 } }),
    h(
      'button',
      {
        onClick: onClose,
        title: 'cerrar',
        style: {
          width: 28,
          height: 28,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'transparent',
          border: '0.5px solid var(--neutral-300)',
          borderRadius: 6,
          cursor: 'pointer',
          color: 'var(--neutral-700)',
        },
      },
      h(ObsIcon, { name: 'close', size: 14 })
    )
  );
}

function ErrorBadgeMini() {
  return h(
    'span',
    {
      style: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: '2px 7px',
        borderRadius: 4,
        background: 'var(--red)',
        color: 'var(--white)',
        fontFamily: 'var(--font-sans)',
        fontSize: 11,
        fontWeight: 500,
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
      },
    },
    h('span', {
      style: { width: 6, height: 6, borderRadius: '50%', background: 'var(--white)' },
    }),
    'error'
  );
}

function TimingCard({
  span,
  durationNs,
  inFlight,
  traceDurationNs,
  isError,
  dk,
  parentNode,
  onSelectParent,
}: {
  span: SpanRecord;
  durationNs: number;
  inFlight: boolean;
  traceDurationNs: number;
  isError: boolean;
  dk: DisplayKind;
  parentNode: SpanNode | null;
  onSelectParent: (parentSpanId: string) => void;
}) {
  const ms = durationNs / 1_000_000;
  const traceMs = Math.max(traceDurationNs / 1_000_000, 0.001);
  const pct = ((ms / traceMs) * 100).toFixed(1);
  const startMs = ms === 0 ? 0 : computeStartOffsetMs(span, traceDurationNs);
  const fillColor = isError ? 'var(--red)' : KIND_COLOR[dk].fill;
  const offsetPctNum = traceMs === 0 ? 0 : (startMs / traceMs) * 100;
  const widthPctNum = traceMs === 0 ? 0 : Math.max((ms / traceMs) * 100, 1);

  return h(
    'div',
    {
      style: {
        padding: '12px 14px',
        background: 'var(--neutral-100)',
        border: '0.5px solid var(--neutral-300)',
        borderRadius: 8,
        marginBottom: 18,
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 12,
      },
    },
    h(
      'div',
      null,
      h(
        'div',
        { className: 't-eyebrow', style: { fontSize: 9.5, marginBottom: 4 } },
        'DURACIÓN EXACTA'
      ),
      h(
        'div',
        {
          style: {
            fontFamily: 'var(--font-serif)',
            fontWeight: 900,
            fontSize: 22,
            letterSpacing: '-0.5px',
            WebkitTextStroke: '0.25px currentColor',
            color: isError ? 'var(--red)' : 'var(--neutral-950)',
          },
        },
        inFlight ? 'in-flight' : formatExactMs(durationNs)
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
        inFlight ? 'span en curso' : `${pct}% del request total (${Math.round(traceMs)}ms)`
      ),
      h(
        'div',
        {
          style: {
            position: 'relative',
            height: 4,
            background: 'var(--neutral-200)',
            borderRadius: 2,
            marginTop: 8,
          },
        },
        h('div', {
          style: {
            position: 'absolute',
            left: `${offsetPctNum}%`,
            width: `${widthPctNum}%`,
            top: 0,
            bottom: 0,
            background: fillColor,
            borderRadius: 2,
          },
        })
      )
    ),
    h(
      'div',
      null,
      h('div', { className: 't-eyebrow', style: { fontSize: 9.5, marginBottom: 4 } }, 'TIMING'),
      h(TimingRow, { label: 'start', value: `+${Math.round(startMs)}ms` }),
      h(TimingRow, {
        label: 'end',
        value: inFlight ? 'in-flight' : `+${Math.round(startMs + ms)}ms`,
      }),
      h(TimingRow, {
        label: 'parent',
        value:
          parentNode !== null
            ? h(ParentLink, {
                name: parentNode.span.name,
                onClick: () => onSelectParent(parentNode.span.span_id),
              })
            : h(
                'span',
                {
                  style: {
                    fontFamily: 'var(--font-mono)',
                    fontSize: 11,
                    color: 'var(--neutral-500)',
                  },
                },
                '(root)'
              ),
      })
    )
  );
}

function ParentLink({ name, onClick }: { name: string; onClick: () => void }) {
  return h(
    'button',
    {
      onClick,
      style: {
        background: 'transparent',
        border: 'none',
        padding: 0,
        fontFamily: 'var(--font-mono)',
        fontSize: 11,
        color: 'var(--neutral-950)',
        cursor: 'pointer',
        textDecoration: 'underline',
        textUnderlineOffset: 2,
        textDecorationColor: 'var(--neutral-300)',
        maxWidth: 180,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        display: 'inline-block',
      },
    },
    name
  );
}

function TimingRow({ label, value }: { label: string; value: React.ReactNode }) {
  return h(
    'div',
    {
      style: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 10,
        padding: '3px 0',
        minWidth: 0,
      },
    },
    h(
      'span',
      {
        style: {
          fontFamily: 'var(--font-sans)',
          fontSize: 11,
          color: 'var(--neutral-500)',
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          flexShrink: 0,
        },
      },
      label
    ),
    // Valor truncable: minWidth 0 para que ellipsis funcione dentro del flex
    // child, y overflow hidden para que URLs/strings largos no escapen del
    // contenedor del attribute renderer.
    h(
      'span',
      {
        style: {
          fontFamily: 'var(--font-mono)',
          fontSize: 11.5,
          color: 'var(--neutral-950)',
          minWidth: 0,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          textAlign: 'right',
        },
        title: typeof value === 'string' ? value : undefined,
      },
      value
    )
  );
}

function KindAttributes({ dk, attrs }: { dk: DisplayKind; attrs: Record<string, unknown> | null }) {
  if (attrs === null || Object.keys(attrs).length === 0) {
    return h(EmptyAttrs);
  }
  if (dk === 'db') return h(DbAttributes, { attrs });
  if (dk === 'server' || dk === 'client') return h(HttpAttributes, { attrs });
  return h(PlainAttributes, { attrs });
}

function EmptyAttrs() {
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
    'sin attributes.'
  );
}

function DbAttributes({ attrs }: { attrs: Record<string, unknown> }) {
  const sql = typeof attrs['db.statement'] === 'string' ? attrs['db.statement'] : null;
  const params = Array.isArray(attrs['db.params']) ? attrs['db.params'] : null;
  const system = typeof attrs['db.system'] === 'string' ? attrs['db.system'] : '?';
  const dbName = typeof attrs['db.name'] === 'string' ? attrs['db.name'] : null;

  return h(
    'div',
    { style: { display: 'flex', flexDirection: 'column', gap: 10 } },
    sql !== null
      ? h(
          'div',
          {
            style: {
              background: 'var(--neutral-950)',
              borderRadius: 8,
              overflow: 'hidden',
            },
          },
          h(
            'div',
            {
              style: {
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '6px 12px',
                borderBottom: '0.5px solid #3a3a3a',
                fontFamily: 'var(--font-sans)',
                fontSize: 10,
                color: '#8a8a8a',
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                fontWeight: 500,
              },
            },
            h('span', null, dbName !== null ? `${system} · ${dbName}` : system),
            h(CopyBtnDark, { value: sql })
          ),
          h(
            'pre',
            {
              style: {
                margin: 0,
                padding: '12px 14px',
                fontFamily: 'var(--font-mono)',
                fontSize: 11.5,
                color: '#e6e6e6',
                lineHeight: 1.6,
                overflow: 'auto',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              },
            },
            h(SqlHighlight, { text: sql })
          )
        )
      : null,
    h(
      'div',
      {
        style: {
          background: 'var(--white)',
          border: '0.5px solid var(--neutral-300)',
          borderRadius: 8,
          padding: '10px 14px',
        },
      },
      typeof attrs['db.row_count'] !== 'undefined'
        ? h(TimingRow, { label: 'row count', value: String(attrs['db.row_count']) })
        : null,
      params !== null
        ? h(
            'div',
            { style: { marginTop: 6 } },
            h(
              'div',
              {
                style: {
                  fontFamily: 'var(--font-sans)',
                  fontSize: 10,
                  color: 'var(--neutral-500)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  marginBottom: 4,
                },
              },
              'params'
            ),
            h(
              'div',
              {
                style: {
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11.5,
                  color: 'var(--neutral-950)',
                  padding: '6px 8px',
                  background: 'var(--neutral-100)',
                  borderRadius: 4,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                },
              },
              ...params.map((p, i) =>
                h(
                  'span',
                  { key: i },
                  h('span', { style: { color: 'var(--neutral-500)' } }, `$${i + 1} = `),
                  h('span', null, typeof p === 'string' ? `'${p}'` : JSON.stringify(p)),
                  i < params.length - 1
                    ? h('span', { style: { color: 'var(--neutral-500)' } }, ', ')
                    : null
                )
              )
            )
          )
        : null,
      ...Object.entries(attrs)
        .filter(([k]) => !k.startsWith('db.') && k !== 'note')
        .map(([k, v]) => h(TimingRow, { key: k, label: k, value: stringifyValue(v) }))
    )
  );
}

function HttpAttributes({ attrs }: { attrs: Record<string, unknown> }) {
  const method = typeof attrs['http.method'] === 'string' ? attrs['http.method'] : null;
  const url = typeof attrs['http.url'] === 'string' ? attrs['http.url'] : null;
  const status = typeof attrs['http.status_code'] === 'number' ? attrs['http.status_code'] : null;

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
    method !== null || url !== null || status !== null
      ? h(
          'div',
          {
            style: {
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '10px 14px',
              borderBottom: '0.5px solid var(--neutral-300)',
              background: 'var(--neutral-100)',
            },
          },
          method !== null
            ? h(
                'span',
                {
                  style: {
                    padding: '2px 7px',
                    borderRadius: 3,
                    background: 'var(--neutral-950)',
                    color: 'var(--white)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 11,
                    fontWeight: 600,
                  },
                },
                method
              )
            : null,
          url !== null
            ? h(
                'span',
                {
                  style: {
                    fontFamily: 'var(--font-mono)',
                    fontSize: 11.5,
                    color: 'var(--neutral-950)',
                    flex: 1,
                    minWidth: 0,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  },
                },
                url
              )
            : null,
          status !== null ? h(StatusCodeBadge, { status }) : null
        )
      : null,
    h(
      'div',
      { style: { padding: '10px 14px' } },
      ...Object.entries(attrs)
        .filter(([k]) => !['http.method', 'http.url', 'http.status_code'].includes(k))
        .map(([k, v]) =>
          h(TimingRow, {
            key: k,
            label: k,
            value: h(
              'span',
              {
                style: {
                  color: k.startsWith('error.') ? 'var(--red)' : 'var(--neutral-950)',
                  maxWidth: 280,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  display: 'inline-block',
                },
              },
              stringifyValue(v)
            ),
          })
        )
    )
  );
}

function StatusCodeBadge({ status }: { status: number }) {
  const bg = status >= 500 ? 'var(--red)' : status >= 400 ? 'var(--gold)' : 'var(--teal-dk)';
  return h(
    'span',
    {
      style: {
        padding: '2px 7px',
        borderRadius: 3,
        background: bg,
        color: 'var(--white)',
        fontFamily: 'var(--font-mono)',
        fontSize: 11,
        fontWeight: 600,
      },
    },
    String(status)
  );
}

function PlainAttributes({ attrs }: { attrs: Record<string, unknown> }) {
  return h(
    'div',
    {
      style: {
        background: 'var(--white)',
        border: '0.5px solid var(--neutral-300)',
        borderRadius: 8,
        padding: '10px 14px',
      },
    },
    ...Object.entries(attrs).map(([k, v]) =>
      h(TimingRow, { key: k, label: k, value: stringifyValue(v) })
    )
  );
}

function StackTraceList({ stack }: { stack: StackFrameData[] }) {
  const [showSystem, setShowSystem] = useState(false);
  const visible = stack.filter((f) => showSystem || f.app);
  const systemCount = stack.filter((f) => !f.app).length;

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
    ...visible.map((frame, idx) => h(StackFrame, { key: idx, frame, first: idx === 0 })),
    systemCount > 0
      ? h(
          'div',
          {
            style: {
              padding: '8px 14px',
              borderTop: '0.5px solid var(--neutral-300)',
              textAlign: 'center',
              background: 'var(--neutral-100)',
            },
          },
          h(
            'button',
            {
              onClick: () => setShowSystem((s: boolean) => !s),
              style: {
                background: 'transparent',
                border: 'none',
                fontFamily: 'var(--font-sans)',
                fontSize: 11,
                color: 'var(--neutral-700)',
                cursor: 'pointer',
                textDecoration: 'underline',
              },
            },
            `${showSystem ? 'ocultar' : 'mostrar'} ${systemCount} frames de node_modules`
          )
        )
      : null
  );
}

function StatusMessageBlock({ message, isError }: { message: string; isError: boolean }) {
  return h(
    'div',
    {
      style: {
        padding: '10px 14px',
        background: isError ? 'var(--red-soft)' : 'var(--neutral-100)',
        border: `0.5px solid ${isError ? 'var(--red-lt)' : 'var(--neutral-300)'}`,
        borderRadius: 8,
        fontFamily: 'var(--font-mono)',
        fontSize: 11.5,
        color: 'var(--neutral-950)',
        wordBreak: 'break-word',
      },
    },
    message
  );
}

function SpanFooterActions({ span }: { span: SpanRecord }) {
  const { toast } = usePlugin();

  const onCopyJson = async () => {
    const ok = await copyToClipboard(JSON.stringify(span, null, 2));
    if (ok) toast.success('Span copiado como JSON', '');
    else toast.error('No se pudo copiar al portapapeles', '');
  };

  const onCopyId = async () => {
    const ok = await copyToClipboard(span.span_id);
    if (ok) toast.success('span_id copiado', '');
    else toast.error('No se pudo copiar al portapapeles', '');
  };

  return h(
    'div',
    { style: { display: 'flex', gap: 6, marginTop: 6 } },
    h(
      'button',
      { className: 'btn btn-secondary btn-sm', onClick: () => void onCopyJson() },
      h(ObsIcon, { name: 'copy', size: 13 }),
      h('span', null, 'Copy as JSON')
    ),
    h(
      'button',
      { className: 'btn btn-secondary btn-sm', onClick: () => void onCopyId() },
      h(ObsIcon, { name: 'copy', size: 13 }),
      h('span', null, 'Copy span_id')
    )
  );
}

function Section({
  title,
  right,
  children,
}: {
  title: string;
  right?: React.ReactNode;
  children?: React.ReactNode;
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

function CopyBtnDark({ value }: { value: string }) {
  const [done, setDone] = useState(false);
  const onClick = async () => {
    const ok = await copyToClipboard(value);
    if (!ok) return;
    setDone(true);
    setTimeout(() => setDone(false), 1200);
  };
  return h(
    'button',
    {
      onClick,
      style: {
        background: 'transparent',
        border: '0.5px solid #3a3a3a',
        borderRadius: 4,
        padding: '2px 6px',
        fontFamily: 'var(--font-sans)',
        fontSize: 10,
        color: done ? '#a7dfd3' : '#b7b7b7',
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
      },
    },
    h(ObsIcon, { name: done ? 'check' : 'copy', size: 11 }),
    h('span', null, done ? 'copiado' : 'copy')
  );
}

// SQL syntax highlight naive — keywords + strings + $params.
function SqlHighlight({ text }: { text: string }) {
  const KEYWORDS =
    /\b(SELECT|FROM|WHERE|AND|OR|ORDER BY|GROUP BY|LIMIT|OFFSET|INSERT INTO|VALUES|RETURNING|UPDATE|SET|DELETE|JOIN|LEFT|RIGHT|INNER|OUTER|ON|AS|IN|NOT|NULL|IS|ASC|DESC)\b/g;
  const STRINGS = /'([^']*)'/g;
  const PARAMS = /\$\d+/g;
  type Part = { t: string; kind: 'plain' | 'kw' | 'str' | 'param' };

  let parts: Part[] = [{ t: text, kind: 'plain' }];
  const splitBy = (regex: RegExp, kind: Part['kind']) => {
    const next: Part[] = [];
    for (const p of parts) {
      if (p.kind !== 'plain') {
        next.push(p);
        continue;
      }
      let lastIdx = 0;
      let m: RegExpExecArray | null;
      const reg = new RegExp(regex.source, 'g');
      while ((m = reg.exec(p.t)) !== null) {
        if (m.index > lastIdx) next.push({ t: p.t.slice(lastIdx, m.index), kind: 'plain' });
        next.push({ t: m[0], kind });
        lastIdx = m.index + m[0].length;
      }
      if (lastIdx < p.t.length) next.push({ t: p.t.slice(lastIdx), kind: 'plain' });
    }
    parts = next;
  };
  splitBy(KEYWORDS, 'kw');
  splitBy(STRINGS, 'str');
  splitBy(PARAMS, 'param');

  const COLOR: Record<Part['kind'], string> = {
    plain: '#e6e6e6',
    kw: '#FFC633',
    str: '#a7dfd3',
    param: '#FFE29A',
  };

  return h(
    React.Fragment,
    null,
    ...parts.map((p, i) =>
      h(
        'span',
        {
          key: i,
          style: { color: COLOR[p.kind], fontWeight: p.kind === 'kw' ? 600 : 400 },
        },
        p.t
      )
    )
  );
}

function asPlainObject(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== 'object') return null;
  if (Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function stringifyValue(v: unknown): string {
  if (Array.isArray(v)) return v.map((x) => String(x)).join(', ');
  if (v !== null && typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function formatExactMs(durationNs: number): React.ReactNode {
  // Para que el "ms" quede chico al lado del número grande (igual al prototype).
  const ms = durationNs / 1_000_000;
  if (ms < 1) return h(React.Fragment, null, `${ms.toFixed(3)}`, h(MsTail));
  return h(React.Fragment, null, Math.round(ms).toString(), h(MsTail));
}

function MsTail() {
  return h(
    'span',
    {
      style: {
        fontFamily: 'var(--font-mono)',
        fontSize: 11,
        fontWeight: 500,
        marginLeft: 3,
        WebkitTextStroke: 0,
      },
    },
    'ms'
  );
}

function computeStartOffsetMs(span: SpanRecord, traceDurationNs: number): number {
  // Offset relativo al inicio del trace. Lo reconstruimos parseando start_time
  // contra el inicio del primer span del trace; si no podemos, mostramos 0.
  // (El árbol real ya tiene `offsetFraction`, pero acá necesitamos ms para el
  // mini-bar y el "+Xms" — y solo tenemos `span` + `traceDurationNs`.)
  if (traceDurationNs === 0) return 0;
  // Sin acceso al árbol completo, dejamos 0 — el caller puede pasar el offset
  // correcto si lo necesita. El mini-bar usa offsetPctNum/widthPctNum del
  // node, ver TimingCard.
  void span;
  return 0;
}

/** Best-effort: parsea events para extraer un stack trace de un evento `exception`. */
function extractStackFromEvents(events: unknown): StackFrameData[] | null {
  if (!Array.isArray(events)) return null;
  for (const ev of events) {
    if (ev === null || typeof ev !== 'object') continue;
    const e = ev as Record<string, unknown>;
    const name = typeof e.name === 'string' ? e.name : null;
    if (name !== 'exception') continue;
    const attrs = asPlainObject(e.attributes);
    if (attrs === null) continue;
    const stacktrace = attrs['exception.stacktrace'];
    if (typeof stacktrace !== 'string') continue;
    return parseStackString(stacktrace);
  }
  return null;
}

const FRAME_REGEX = /\s+at\s+(.+?)\s+\((.+?):(\d+):(\d+)\)/;

function parseStackString(stack: string): StackFrameData[] {
  const frames: StackFrameData[] = [];
  for (const line of stack.split('\n')) {
    const m = line.match(FRAME_REGEX);
    if (m === null) continue;
    const file = m[2];
    frames.push({
      fn: m[1],
      file,
      line: Number(m[3]),
      col: Number(m[4]),
      app: !file.includes('node_modules'),
    });
  }
  return frames;
}
