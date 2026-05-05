import { getHostReact } from '@coongro/plugin-sdk';

import type { AuditEvent } from '../_shared/api.js';
import { CopyBtn } from '../_shared/components/copy-btn.js';
import { shortenId } from '../_shared/lib/format-id.js';
import { absTime, relTime } from '../_shared/lib/format-time.js';

import { getActionVerbColors } from './lib/action-verb.js';

const React = getHostReact();
const h = React.createElement;
const { useState } = React;

export interface AuditRowProps {
  event: AuditEvent;
}

export function AuditRow({ event }: AuditRowProps) {
  const [hover, setHover] = useState(false);
  const verbColors = getActionVerbColors(event.action);
  const targetLabel = formatTarget(event.entityType, event.entityId);

  return h(
    'tr',
    {
      onMouseEnter: () => setHover(true),
      onMouseLeave: () => setHover(false),
      style: {
        background: hover ? 'var(--neutral-100)' : 'var(--white)',
        borderBottom: '0.5px solid var(--neutral-300)',
      },
    },
    h(
      'td',
      { style: cell() },
      h(
        'div',
        { style: { fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--neutral-950)' } },
        absTime(event.timestamp, true)
      ),
      h(
        'div',
        {
          style: {
            fontFamily: 'var(--font-sans)',
            fontSize: 10.5,
            color: 'var(--neutral-500)',
            marginTop: 2,
          },
        },
        relTime(event.timestamp)
      )
    ),
    h(
      'td',
      { style: cell() },
      event.actorId
        ? h(ActorCell, { actorId: event.actorId })
        : h(
            'span',
            {
              style: { fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--neutral-500)' },
            },
            'system'
          )
    ),
    h(
      'td',
      { style: cell() },
      h(
        'span',
        {
          style: {
            display: 'inline-flex',
            padding: '3px 8px',
            borderRadius: 4,
            background: verbColors.bg,
            color: verbColors.fg,
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            fontWeight: 500,
          },
        },
        event.action
      )
    ),
    h(
      'td',
      { style: cell() },
      targetLabel
        ? h(
            'span',
            {
              style: {
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '2px 6px',
                borderRadius: 3,
                background: 'var(--neutral-200)',
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                color: 'var(--neutral-950)',
                maxWidth: '100%',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              },
            },
            targetLabel,
            hover ? h(CopyBtn, { value: targetLabel, label: 'copiar target', size: 10 }) : null
          )
        : h(
            'span',
            {
              style: { fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--neutral-500)' },
            },
            '—'
          )
    ),
    h(
      'td',
      { style: cell() },
      event.tenantId
        ? h(
            'span',
            {
              style: { fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--neutral-700)' },
            },
            shortenId(event.tenantId)
          )
        : h(
            'span',
            {
              style: { fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--neutral-500)' },
            },
            'system'
          )
    ),
    h('td', { style: cell() }, h(MetaSummary, { metadata: event.metadata })),
    h(
      'td',
      { style: { ...cell(), textAlign: 'right' } },
      h(
        'div',
        { style: { opacity: hover ? 1 : 0 } },
        h(CopyBtn, { value: event, label: 'copiar evento', size: 12 })
      )
    )
  );
}

function ActorCell({ actorId }: { actorId: string }) {
  return h(
    'div',
    { style: { display: 'flex', alignItems: 'center', gap: 8 } },
    h(
      'span',
      {
        style: {
          width: 26,
          height: 26,
          borderRadius: '50%',
          background: 'var(--gold-soft)',
          color: 'var(--gold-deep)',
          fontSize: 10.5,
          fontWeight: 700,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          fontFamily: 'var(--font-sans)',
        },
      },
      // Iniciales placeholder hasta que tengamos un endpoint de users; los
      // primeros 2 hex chars del UUID son visualmente distintivos.
      actorId.slice(0, 2).toUpperCase()
    ),
    h(
      'div',
      null,
      h(
        'div',
        { style: { fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--neutral-950)' } },
        shortenId(actorId)
      )
    )
  );
}

function MetaSummary({ metadata }: { metadata: unknown }) {
  if (metadata === null || metadata === undefined || typeof metadata !== 'object') {
    return h(
      'span',
      { style: { fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--neutral-500)' } },
      '—'
    );
  }
  const entries = Object.entries(metadata as Record<string, unknown>);
  if (entries.length === 0) {
    return h(
      'span',
      { style: { fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--neutral-500)' } },
      '—'
    );
  }
  return h(
    'div',
    { style: { display: 'flex', flexWrap: 'wrap', gap: 6 } },
    ...entries.slice(0, 3).map(([k, v]) =>
      h(
        'span',
        {
          key: k,
          style: {
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            padding: '1px 6px',
            borderRadius: 3,
            background: 'var(--neutral-100)',
            border: '0.5px solid var(--neutral-300)',
            fontFamily: 'var(--font-mono)',
            fontSize: 10.5,
          },
        },
        h('span', { style: { color: 'var(--neutral-500)' } }, k),
        h('span', { style: { color: 'var(--neutral-950)' } }, formatMetaValue(v))
      )
    ),
    entries.length > 3
      ? h(
          'span',
          {
            style: {
              fontFamily: 'var(--font-mono)',
              fontSize: 10.5,
              color: 'var(--neutral-500)',
            },
          },
          `+${entries.length - 3}`
        )
      : null
  );
}

function formatMetaValue(v: unknown): string {
  if (v === null || v === undefined) return 'null';
  if (Array.isArray(v)) return `[${v.length}]`;
  if (typeof v === 'object') return '{…}';
  if (typeof v === 'string') return v.length > 24 ? `${v.slice(0, 24)}…` : v;
  return String(v);
}

function formatTarget(entityType: string | null, entityId: string | null): string | null {
  if (!entityType && !entityId) return null;
  if (entityType && entityId) return `${entityType}:${entityId}`;
  return entityType ?? entityId;
}

function cell() {
  return {
    padding: '12px 14px',
    fontFamily: 'var(--font-sans)',
    fontSize: 12.5,
    color: 'var(--neutral-950)',
    verticalAlign: 'middle' as const,
  };
}
