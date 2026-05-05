import { getHostReact } from '@coongro/plugin-sdk';

import { ObsIcon } from '../_shared/components/icons.js';
import { SingleSelectChip } from '../_shared/components/single-select-chip.js';
import { TenantFilterChip } from '../_shared/components/tenant-filter-chip.js';
import { TextInputChip } from '../_shared/components/text-input-chip.js';

const React = getHostReact();
const h = React.createElement;

export interface AuditFilters {
  tenantId: string | null;
  actorId: string | null;
  action: string | null;
  /** entity_type — el "tipo" de recurso afectado (issue, plugin, etc). */
  entityType: string | null;
  /** entity_id — el identificador del recurso afectado. */
  entityId: string | null;
  range: '24h' | '7d' | '30d' | '90d' | 'all';
}

export const DEFAULT_AUDIT_FILTERS: AuditFilters = {
  tenantId: null,
  actorId: null,
  action: null,
  entityType: null,
  entityId: null,
  range: '7d',
};

const RANGE_LABELS: Record<AuditFilters['range'], string> = {
  '24h': 'últimas 24h',
  '7d': 'últimos 7 días',
  '30d': 'últimos 30 días',
  '90d': 'últimos 90 días',
  all: 'todo',
};

export interface AuditFilterBarProps {
  filters: AuditFilters;
  setFilters: (next: AuditFilters) => void;
}

/**
 * Barra de filtros de Auditoría. Por ahora ACTOR / ACTION / ENTITY son
 * inputs libres — más adelante podemos exponer endpoints `/audit/actions`
 * (similar a `/sources`) y promoverlos a `DropdownFilterChip` con
 * autocomplete. Para internal-only es aceptable empezar sin descubrimiento.
 */
export function AuditFilterBar({ filters, setFilters }: AuditFilterBarProps) {
  const setTenantId = (tenantId: string | null) => setFilters({ ...filters, tenantId });
  const setActorId = (actorId: string | null) => setFilters({ ...filters, actorId });
  const setAction = (action: string | null) => setFilters({ ...filters, action });
  const setEntityType = (entityType: string | null) => setFilters({ ...filters, entityType });
  const setEntityId = (entityId: string | null) => setFilters({ ...filters, entityId });
  const setRange = (range: AuditFilters['range']) => setFilters({ ...filters, range });

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
    h(TextInputChip, {
      label: 'ACTOR',
      value: filters.actorId,
      placeholder: 'actor_id (UUID)',
      onChange: setActorId,
    }),
    h(TextInputChip, {
      label: 'ACTION',
      value: filters.action,
      placeholder: 'ej: issue.status_updated',
      onChange: setAction,
    }),
    h(TextInputChip, {
      label: 'ENTITY TYPE',
      value: filters.entityType,
      placeholder: 'ej: log_issue',
      onChange: setEntityType,
    }),
    h(TextInputChip, {
      label: 'ENTITY ID',
      value: filters.entityId,
      placeholder: 'id del recurso',
      onChange: setEntityId,
    }),
    h(SingleSelectChip, {
      label: 'RANGE',
      value: filters.range,
      options: Object.keys(RANGE_LABELS) as AuditFilters['range'][],
      labelOf: (v) => RANGE_LABELS[v as AuditFilters['range']],
      onChange: (next) => setRange(next as AuditFilters['range']),
    }),
    h('div', { style: { flex: 1 } }),
    h(
      'button',
      {
        onClick: () => setFilters(DEFAULT_AUDIT_FILTERS),
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
