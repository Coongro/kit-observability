import { getHostReact } from '@coongro/plugin-sdk';

import type { IssueStatus, LogIssue } from '../_shared/api.js';
import { CopyBtn } from '../_shared/components/copy-btn.js';
import { ObsIcon, type IconName } from '../_shared/components/icons.js';
import { LevelBadge } from '../_shared/components/level-badge.js';
import { Sparkline } from '../_shared/components/sparkline.js';
import { relTime } from '../_shared/lib/format-time.js';
import { getLevelColors } from '../_shared/lib/levels.js';

const React = getHostReact();
const h = React.createElement;
const { useState } = React;

const STATUS_COLOR: Record<IssueStatus, string> = {
  open: 'var(--red)',
  resolved: 'var(--teal)',
  muted: 'var(--gold-dk)',
};

export interface IssueRowProps {
  issue: LogIssue;
  active: boolean;
  onClick: () => void;
  onResolve: () => void;
  onMute: () => void;
  onReopen: () => void;
}

/**
 * Row densa de la tabla de Issues. Maneja hover state localmente porque las
 * acciones del row se muestran solo en hover (decisión visual del prototype
 * para mantener la grilla limpia).
 */
export function IssueRow({ issue, active, onClick, onResolve, onMute, onReopen }: IssueRowProps) {
  const [hover, setHover] = useState(false);
  const muted = issue.status === 'resolved' || issue.status === 'muted';
  const sparkColor = getLevelColors(issue.level).stroke;

  return h(
    'tr',
    {
      onClick,
      onMouseEnter: () => setHover(true),
      onMouseLeave: () => setHover(false),
      style: {
        borderBottom: '0.5px solid var(--neutral-300)',
        background: active || hover ? 'var(--neutral-100)' : 'var(--white)',
        cursor: 'pointer',
        position: 'relative',
        opacity: muted ? 0.55 : 1,
      },
    },
    active
      ? h('td', {
          style: {
            padding: 0,
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: 2,
            background: 'var(--neutral-950)',
          },
        })
      : null,
    h('td', { style: cell() }, h(LevelBadge, { level: issue.level })),
    h(
      'td',
      { style: { ...cell(), overflow: 'hidden' } },
      h(
        'div',
        {
          style: {
            fontFamily: 'var(--font-sans)',
            fontSize: 12.5,
            fontWeight: 500,
            color: 'var(--neutral-950)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          },
        },
        issue.sample_message
      ),
      h(
        'div',
        { style: { display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 } },
        h(
          'span',
          {
            style: {
              fontFamily: 'var(--font-mono)',
              fontSize: 10.5,
              color: 'var(--neutral-500)',
            },
          },
          issue.fingerprint
        ),
        h('span', {
          style: {
            width: 5,
            height: 5,
            borderRadius: '50%',
            background: STATUS_COLOR[issue.status],
            opacity: 0.8,
          },
        }),
        h(
          'span',
          {
            style: {
              fontSize: 10.5,
              color: 'var(--neutral-500)',
              textTransform: 'lowercase',
            },
          },
          issue.status
        ),
        issue.affected_tenants_count > 0
          ? h(
              'span',
              { style: { fontSize: 10.5, color: 'var(--neutral-500)' } },
              `· ${issue.affected_tenants_count} tenant${issue.affected_tenants_count > 1 ? 's' : ''}`
            )
          : null,
        hover ? h(CopyBtn, { value: issue.fingerprint, label: 'copiar fingerprint' }) : null
      )
    ),
    h(
      'td',
      { style: cell() },
      h(
        'span',
        { style: { fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--neutral-700)' } },
        issue.source
      )
    ),
    h(
      'td',
      { style: { ...cell(), textAlign: 'right' } },
      h(
        'span',
        {
          style: {
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
            fontWeight: 500,
            color: 'var(--neutral-950)',
          },
        },
        Number(issue.occurrence_count).toLocaleString('es-AR')
      )
    ),
    h(
      'td',
      { style: cell() },
      h(
        'span',
        { style: { fontFamily: 'var(--font-sans)', fontSize: 11.5, color: 'var(--neutral-950)' } },
        relTime(issue.last_seen_at)
      )
    ),
    h(
      'td',
      { style: cell() },
      h(
        'span',
        { style: { fontFamily: 'var(--font-sans)', fontSize: 11.5, color: 'var(--neutral-700)' } },
        relTime(issue.first_seen_at)
      )
    ),
    h(
      'td',
      { style: cell() },
      h(Sparkline, {
        data: issue.sparkline_24h,
        width: 92,
        height: 20,
        color: sparkColor,
        fill: true,
      })
    ),
    h(
      'td',
      { style: { ...cell(), textAlign: 'right' } },
      h(
        'div',
        { style: { display: 'inline-flex', gap: 2, opacity: hover ? 1 : 0 } },
        issue.status === 'open'
          ? [
              h(ActionBtn, {
                key: 'resolve',
                icon: 'check',
                title: 'resolver',
                onClick: onResolve,
              }),
              h(ActionBtn, { key: 'mute', icon: 'mute', title: 'silenciar', onClick: onMute }),
            ]
          : h(ActionBtn, { icon: 'refresh', title: 'reabrir', onClick: onReopen })
      )
    )
  );
}

function cell() {
  return {
    padding: '8px 10px',
    borderBottom: '0.5px solid var(--neutral-300)',
    fontFamily: 'var(--font-sans)',
    fontSize: 12,
    color: 'var(--neutral-950)',
    verticalAlign: 'middle' as const,
  };
}

interface ActionBtnProps {
  icon: IconName;
  title: string;
  onClick: () => void;
}

function ActionBtn({ icon, title, onClick }: ActionBtnProps) {
  const [hover, setHover] = useState(false);
  return h(
    'button',
    {
      onClick: (e: { stopPropagation: () => void }) => {
        e.stopPropagation();
        onClick();
      },
      onMouseEnter: () => setHover(true),
      onMouseLeave: () => setHover(false),
      title,
      style: {
        width: 24,
        height: 24,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: hover ? 'var(--neutral-200)' : 'transparent',
        border: '0.5px solid ' + (hover ? 'var(--neutral-300)' : 'transparent'),
        borderRadius: 4,
        cursor: 'pointer',
        color: 'var(--neutral-700)',
      },
    },
    h(ObsIcon, { name: icon, size: 13 })
  );
}
