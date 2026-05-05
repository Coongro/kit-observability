import { getHostReact } from '@coongro/plugin-sdk';

import { ObsIcon } from '../_shared/components/icons.js';
import { MultiSelectChip } from '../_shared/components/multi-select-chip.js';
import { SingleSelectChip } from '../_shared/components/single-select-chip.js';
import { TenantFilterChip } from '../_shared/components/tenant-filter-chip.js';
import { TextInputChip } from '../_shared/components/text-input-chip.js';
import { LEVEL, LEVEL_LABEL, type LevelValue } from '../_shared/lib/levels.js';

const React = getHostReact();
const h = React.createElement;

export interface StreamFilters {
  levels: LevelValue[];
  tenantId: string | null;
  source: string | null;
  /**
   * Búsqueda full-text en el campo `message`. Se manda al backend via el
   * query param `q` (ILIKE %search%). El request_id NO va por acá — tiene
   * su propio hero filter en el header de la view.
   */
  search: string | null;
  range: '15m' | '1h' | '6h' | '24h';
}

export const DEFAULT_STREAM_FILTERS: StreamFilters = {
  levels: [LEVEL.DEBUG, LEVEL.INFO, LEVEL.WARN, LEVEL.ERROR, LEVEL.FATAL],
  tenantId: null,
  source: null,
  search: null,
  range: '1h',
};

const ALL_LEVELS: LevelValue[] = [LEVEL.DEBUG, LEVEL.INFO, LEVEL.WARN, LEVEL.ERROR, LEVEL.FATAL];
const RANGE_LABELS: Record<StreamFilters['range'], string> = {
  '15m': 'últimos 15m',
  '1h': 'última hora',
  '6h': 'últimas 6h',
  '24h': 'últimas 24h',
};

export interface StreamFilterBarProps {
  filters: StreamFilters;
  setFilters: (next: StreamFilters) => void;
}

/**
 * Barra de filtros del Stream view. Reusa los chips del `_shared/` (mismos
 * que Issues) — si en algún momento esta barra y la de Issues convergen
 * 100%, se puede unificar en un único `LogsFilterBar` paramétrico. Hoy
 * difieren en STATUS (solo Issues) y rangos (Stream usa más cortos porque
 * mira eventos vivos).
 */
export function StreamFilterBar({ filters, setFilters }: StreamFilterBarProps) {
  const setLevels = (levels: LevelValue[]) => setFilters({ ...filters, levels });
  const setTenantId = (tenantId: string | null) => setFilters({ ...filters, tenantId });
  const setSource = (source: string | null) => setFilters({ ...filters, source });
  const setSearch = (search: string | null) => setFilters({ ...filters, search });
  const setRange = (range: StreamFilters['range']) => setFilters({ ...filters, range });

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
    h(TextInputChip, {
      label: 'BUSCAR',
      value: filters.search,
      placeholder: 'full-text en mensaje…',
      popoverWidth: 320,
      inputFontFamily: 'var(--font-sans)',
      onChange: setSearch,
    }),
    h(TenantFilterChip, { tenantId: filters.tenantId, setTenantId }),
    h(MultiSelectChip, {
      label: 'LEVEL',
      values: filters.levels,
      options: ALL_LEVELS,
      labelOf: (v) => LEVEL_LABEL[v as LevelValue],
      onChange: (next) => setLevels(next as LevelValue[]),
    }),
    h(TextInputChip, {
      label: 'SOURCE',
      value: filters.source,
      placeholder: 'plugin:billing-afip',
      onChange: setSource,
    }),
    h(SingleSelectChip, {
      label: 'RANGE',
      value: filters.range,
      options: Object.keys(RANGE_LABELS) as StreamFilters['range'][],
      labelOf: (v) => RANGE_LABELS[v as StreamFilters['range']],
      onChange: (next) => setRange(next as StreamFilters['range']),
    }),
    h('div', { style: { flex: 1 } }),
    h(
      'span',
      {
        style: {
          fontFamily: 'var(--font-mono)',
          fontSize: 10.5,
          color: 'var(--neutral-500)',
        },
      },
      'orden: ts ↓'
    ),
    h('div', { style: { width: 0.5, height: 18, background: 'var(--neutral-300)' } }),
    h(
      'button',
      {
        onClick: () => setFilters(DEFAULT_STREAM_FILTERS),
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
      h(ObsIcon, { name: 'refresh', size: 12 }),
      h('span', null, 'limpiar')
    )
  );
}
