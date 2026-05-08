import { getHostReact, usePlugin } from '@coongro/plugin-sdk';

import type { LogEntry } from '../_shared/api.js';
import { CopyBtn } from '../_shared/components/copy-btn.js';
import { ObsIcon } from '../_shared/components/icons.js';
import { JsonTree } from '../_shared/components/json-tree.js';
import { LevelBadge } from '../_shared/components/level-badge.js';
import { copyToClipboard } from '../_shared/lib/clipboard.js';
import { shortenId } from '../_shared/lib/format-id.js';
import { absTime } from '../_shared/lib/format-time.js';
import { LEVEL } from '../_shared/lib/levels.js';
import { openIssue } from '../_shared/lib/open-issue.js';
import { openTrace } from '../_shared/lib/open-trace.js';

const React = getHostReact();
const h = React.createElement;
const { useState } = React;

export interface StreamRowProps {
  entry: LogEntry;
  expanded: boolean;
  onToggle: () => void;
  /** Callback para "seguir request_id" — setea el hero filter del Stream. */
  onFollowRequest: () => void;
}

/**
 * Row del Stream — versión densa (height 30) con click-to-expand para ver
 * el LogEntry completo en JsonTree. La acción "seguir request_id" se
 * propaga al hero filter del view (no es un toggle local).
 */
export function StreamRow({ entry, expanded, onToggle, onFollowRequest }: StreamRowProps) {
  const { views, toast } = usePlugin();
  const [hover, setHover] = useState(false);
  const isError = entry.level >= LEVEL.ERROR;

  const onCopyJson = (): void => {
    void (async () => {
      const ok = await copyToClipboard(JSON.stringify(buildExpandedJson(entry), null, 2));
      if (ok) toast.success('Entry copiado como JSON', '');
      else toast.error('No se pudo copiar al portapapeles', '');
    })();
  };

  return h(
    React.Fragment,
    null,
    h(
      'tr',
      {
        onClick: onToggle,
        onMouseEnter: () => setHover(true),
        onMouseLeave: () => setHover(false),
        style: {
          borderBottom: '0.5px solid var(--neutral-300)',
          background: expanded || hover ? 'var(--neutral-100)' : 'var(--white)',
          cursor: 'pointer',
          height: 30,
        },
      },
      h(
        'td',
        { style: tightTd() },
        h(ObsIcon, {
          name: expanded ? 'chevDown' : 'chevRight',
          size: 11,
          style: { color: 'var(--neutral-500)', marginLeft: 4 },
        })
      ),
      h(
        'td',
        { style: tightTd() },
        h(
          'span',
          { style: { fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--neutral-700)' } },
          absTime(entry.timestamp)
        )
      ),
      h('td', { style: tightTd() }, h(LevelBadge, { level: entry.level, size: 'sm' })),
      h(
        'td',
        { style: tightTd() },
        h(
          'span',
          { style: { fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--neutral-700)' } },
          entry.source
        )
      ),
      h(
        'td',
        { style: { ...tightTd(), overflow: 'hidden' } },
        h(
          'span',
          {
            style: {
              fontFamily: 'var(--font-sans)',
              fontSize: 12,
              color: isError ? 'var(--red-deep)' : 'var(--neutral-950)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              display: 'block',
            },
          },
          entry.message
        )
      ),
      h(
        'td',
        { style: tightTd() },
        entry.request_id
          ? h(
              'button',
              {
                onClick: (ev: { stopPropagation: () => void }) => {
                  ev.stopPropagation();
                  onFollowRequest();
                },
                title: 'ver toda la cadena del request',
                style: {
                  background: 'transparent',
                  border: 'none',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11,
                  color: 'var(--teal-deep)',
                  cursor: 'pointer',
                  padding: 0,
                  textAlign: 'left',
                  textDecoration: 'underline',
                  maxWidth: '100%',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                },
              },
              entry.request_id
            )
          : h(
              'span',
              {
                style: {
                  color: 'var(--neutral-500)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11,
                },
              },
              '—'
            )
      ),
      h(
        'td',
        { style: tightTd() },
        entry.tenant_id
          ? h(
              'span',
              {
                style: {
                  display: 'inline-block',
                  padding: '1px 6px',
                  borderRadius: 3,
                  background: 'var(--neutral-200)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 10.5,
                  color: 'var(--neutral-700)',
                  maxWidth: 110,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                },
              },
              shortenId(entry.tenant_id)
            )
          : h(
              'span',
              {
                style: {
                  color: 'var(--neutral-500)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 10.5,
                },
              },
              'system'
            )
      ),
      h(
        'td',
        { style: { ...tightTd(), textAlign: 'right' } },
        h(
          'div',
          { style: { display: 'inline-flex', gap: 1, opacity: hover ? 1 : 0 } },
          entry.request_id
            ? h(
                'button',
                {
                  onClick: (ev: { stopPropagation: () => void }) => {
                    ev.stopPropagation();
                    onFollowRequest();
                  },
                  title: 'filtrar log_entries por este request_id',
                  style: miniBtn(),
                },
                h(ObsIcon, { name: 'link', size: 11 })
              )
            : null,
          entry.request_id
            ? h(
                'button',
                {
                  onClick: (ev: { stopPropagation: () => void }) => {
                    ev.stopPropagation();
                    openTrace(views, entry.request_id);
                  },
                  title: 'ver waterfall del trace',
                  style: miniBtn(),
                },
                h(ObsIcon, { name: 'chevRight', size: 11 })
              )
            : null,
          h(CopyBtn, { value: entry, label: 'copiar entry como JSON', size: 11 })
        )
      )
    ),
    expanded
      ? h(
          'tr',
          {
            style: {
              background: 'var(--neutral-100)',
              borderBottom: '0.5px solid var(--neutral-300)',
            },
          },
          h(
            'td',
            { colSpan: 8, style: { padding: '8px 14px 12px 38px' } },
            h(JsonTree, { obj: buildExpandedJson(entry) }),
            h(ExpandedActions, {
              entry,
              onCopyJson,
              onFollowRequest,
              onOpenTrace:
                entry.request_id !== null ? () => openTrace(views, entry.request_id) : null,
              onOpenIssue:
                entry.fingerprint !== null ? () => openIssue(views, entry.fingerprint) : null,
            })
          )
        )
      : null
  );
}

function ExpandedActions({
  entry,
  onCopyJson,
  onFollowRequest,
  onOpenTrace,
  onOpenIssue,
}: {
  entry: LogEntry;
  onCopyJson: () => void;
  onFollowRequest: () => void;
  onOpenTrace: (() => void) | null;
  onOpenIssue: (() => void) | null;
}) {
  return h(
    'div',
    {
      style: { display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' },
    },
    h(
      'button',
      { className: 'btn btn-dark btn-sm', onClick: onCopyJson },
      h(ObsIcon, { name: 'copy', size: 12 }),
      h('span', null, 'Copiar como JSON')
    ),
    entry.request_id !== null
      ? h(
          'button',
          {
            className: 'btn btn-secondary btn-sm',
            onClick: onFollowRequest,
            title: 'filtrar log_entries por este request_id',
          },
          h(ObsIcon, { name: 'link', size: 12 }),
          h('span', null, 'Ver cadena completa del request_id')
        )
      : null,
    onOpenTrace !== null
      ? h(
          'button',
          {
            className: 'btn btn-dark btn-sm',
            onClick: onOpenTrace,
            title: 'abrir el waterfall del request',
          },
          h(ObsIcon, { name: 'activity', size: 12 }),
          h('span', null, 'Abrir trace')
        )
      : null,
    onOpenIssue !== null && entry.fingerprint !== null
      ? h(
          'button',
          {
            className: 'btn btn-secondary btn-sm',
            onClick: onOpenIssue,
            title: 'abrir el issue agrupado por este fingerprint',
          },
          h(ObsIcon, { name: 'bug', size: 12 }),
          h('span', null, `Abrir issue ${entry.fingerprint.slice(0, 8)}`)
        )
      : null
  );
}

/**
 * Devuelve un objeto compacto con los campos del `LogEntry` que vale la
 * pena ver expandido. Se mantiene en este archivo (no en json-tree.tsx)
 * porque la selección y el orden son específicos del Stream view.
 */
function buildExpandedJson(entry: LogEntry): Record<string, unknown> {
  const out: Record<string, unknown> = {
    id: entry.id,
    timestamp: entry.timestamp,
    level: entry.level,
    source: entry.source,
    message: entry.message,
    request_id: entry.request_id,
    tenant_id: entry.tenant_id,
    fingerprint: entry.fingerprint,
  };
  // Solo incluimos los freeform si tienen contenido — evita "context: null"
  // ruidoso cuando el caller no envió esos campos.
  if (entry.context !== null && entry.context !== undefined) out.context = entry.context;
  if (entry.metadata !== null && entry.metadata !== undefined) out.metadata = entry.metadata;
  if (entry.error !== null && entry.error !== undefined) out.error = entry.error;
  return out;
}

function tightTd() {
  return {
    padding: '5px 10px',
    fontFamily: 'var(--font-sans)',
    fontSize: 11.5,
    color: 'var(--neutral-950)',
    verticalAlign: 'middle' as const,
    overflow: 'hidden',
  };
}

function miniBtn() {
  return {
    width: 22,
    height: 22,
    display: 'inline-flex' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    background: 'transparent',
    border: '0.5px solid var(--neutral-300)',
    borderRadius: 4,
    cursor: 'pointer' as const,
    color: 'var(--neutral-700)',
  };
}
