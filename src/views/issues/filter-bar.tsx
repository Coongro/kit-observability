import { getHostReact } from '@coongro/plugin-sdk';

import type { IssueStatus } from '../_shared/api.js';
import { ObsIcon } from '../_shared/components/icons.js';
import { MultiSelectChip } from '../_shared/components/multi-select-chip.js';
import { SingleSelectChip } from '../_shared/components/single-select-chip.js';
import { SourceFilterChip } from '../_shared/components/source-filter-chip.js';
import { TenantFilterChip } from '../_shared/components/tenant-filter-chip.js';
import { LEVEL, LEVEL_LABEL, type LevelValue } from '../_shared/lib/levels.js';

const React = getHostReact();
const h = React.createElement;

export interface IssuesFilters {
  levels: LevelValue[];
  statuses: IssueStatus[];
  tenantId: string | null;
  source: string | null;
  range: '1h' | '24h' | '7d' | '30d' | 'all';
}

export const DEFAULT_FILTERS: IssuesFilters = {
  levels: [LEVEL.WARN, LEVEL.ERROR, LEVEL.FATAL],
  statuses: ['open'],
  tenantId: null,
  source: null,
  range: '24h',
};

export interface IssuesFilterBarProps {
  filters: IssuesFilters;
  setFilters: (next: IssuesFilters) => void;
}

const ALL_LEVELS: LevelValue[] = [LEVEL.DEBUG, LEVEL.INFO, LEVEL.WARN, LEVEL.ERROR, LEVEL.FATAL];
const ALL_STATUSES: IssueStatus[] = ['open', 'resolved', 'muted'];
const RANGE_LABELS: Record<IssuesFilters['range'], string> = {
  '1h': 'última hora',
  '24h': 'últimas 24h',
  '7d': 'últimos 7d',
  '30d': 'últimos 30d',
  all: 'todo',
};

/**
 * Barra de filtros densa para Issues. Cada chip vive en `_shared/components/`
 * porque Stream/Auditoría usan los mismos primitivos — la barra de Issues
 * es solo composición. La identidad del valor activo de cada filtro la
 * controla el parent (state de la view).
 */
export function IssuesFilterBar({ filters, setFilters }: IssuesFilterBarProps) {
  const setLevels = (levels: LevelValue[]) => setFilters({ ...filters, levels });
  const setStatuses = (statuses: IssueStatus[]) => setFilters({ ...filters, statuses });
  const setSource = (source: string | null) => setFilters({ ...filters, source });
  const setRange = (range: IssuesFilters['range']) => setFilters({ ...filters, range });
  const setTenantId = (tenantId: string | null) => setFilters({ ...filters, tenantId });

  return h(
    'div',
    {
      style: {
        position: 'relative',
        zIndex: 10,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '10px 22px',
        background: 'var(--white)',
        borderBottom: '0.5px solid var(--neutral-300)',
        flexWrap: 'wrap',
      },
    },
    h(TenantFilterChip, { tenantId: filters.tenantId, setTenantId }),
    h(MultiSelectChip, {
      label: 'LEVEL',
      values: filters.levels,
      options: ALL_LEVELS,
      labelOf: (v) => LEVEL_LABEL[v as LevelValue],
      onChange: (next) => setLevels(next as LevelValue[]),
    }),
    h(SourceFilterChip, {
      value: filters.source,
      setValue: setSource,
    }),
    h(MultiSelectChip, {
      label: 'STATUS',
      values: filters.statuses,
      options: ALL_STATUSES,
      labelOf: (v) => v as string,
      onChange: (next) => setStatuses(next as IssueStatus[]),
    }),
    h(SingleSelectChip, {
      label: 'RANGE',
      value: filters.range,
      options: Object.keys(RANGE_LABELS) as IssuesFilters['range'][],
      labelOf: (v) => RANGE_LABELS[v as IssuesFilters['range']],
      onChange: (next) => setRange(next as IssuesFilters['range']),
    }),
    h('div', { style: { flex: 1 } }),
    h(
      'button',
      {
        onClick: () => setFilters(DEFAULT_FILTERS),
        style: {
          height: 26,
          padding: '0 8px',
          background: 'transparent',
          border: 'none',
          fontFamily: 'var(--font-sans)',
          fontSize: 11.5,
          color: 'var(--neutral-700)',
          cursor: 'pointer',
        },
      },
      'limpiar'
    ),
    h('div', { style: { width: 0.5, height: 18, background: 'var(--neutral-300)' } }),
    h(
      'button',
      {
        style: {
          display: 'inline-flex',
          alignItems: 'center',
          gap: 5,
          height: 26,
          padding: '0 8px',
          background: 'transparent',
          border: 'none',
          fontFamily: 'var(--font-sans)',
          fontSize: 11.5,
          color: 'var(--neutral-700)',
          cursor: 'pointer',
        },
      },
      h(ObsIcon, { name: 'filter', size: 12 }),
      h('span', null, '+ filtro')
    )
  );
}
