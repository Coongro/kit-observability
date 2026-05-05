import { getHostReact } from '@coongro/plugin-sdk';

import type { IssueStatus } from '../_shared/api.js';
import { FilterChip } from '../_shared/components/filter-chip.js';
import { ObsIcon } from '../_shared/components/icons.js';
import { TenantFilterChip } from '../_shared/components/tenant-filter-chip.js';
import { LEVEL, LEVEL_LABEL, type LevelValue } from '../_shared/lib/levels.js';

const React = getHostReact();
const h = React.createElement;
const { useEffect, useRef, useState } = React;

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
 * Barra de filtros densa para Issues. Cada chip abre un popover con sus
 * opciones (multi-select para level/status, single-select para range,
 * input libre para source). El estado lo controla el parent — la barra es
 * presentation only.
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
      // `position: relative` + `zIndex: 10` para que los popovers absolutos
      // de los chips queden por encima del área de la tabla (que tiene
      // `overflow: auto` y crea su propio stacking context). `flexWrap:
      // wrap` evita un `overflow-x: auto` que clipearía los popovers
      // verticalmente — preferimos que los chips wrappeen a varias filas.
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
    h(SourceInputChip, { value: filters.source, onChange: setSource }),
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

// =============================================================================
// MultiSelectChip / SingleSelectChip — popovers con opciones.
//
// Por qué NO son genéricos sobre T: `React.createElement(Component, props)`
// no preserva el genérico al ser invocado con `h()`, y el patrón del
// proyecto es h() en todas las views (ver contacts/, patients/). Para
// mantener type safety en los call-sites, las props usan `unknown[]` y los
// callers castean en `labelOf` y `onChange`. El cast vive en el límite
// (call-site) y NO se filtra al resto del código.
// =============================================================================

interface MultiSelectChipProps {
  label: string;
  values: readonly unknown[];
  options: readonly unknown[];
  labelOf: (v: unknown) => string;
  onChange: (next: unknown[]) => void;
}

function MultiSelectChip({ label, values, options, labelOf, onChange }: MultiSelectChipProps) {
  const [open, setOpen] = useState(false);
  const ref = usePopover(open, () => setOpen(false));
  const display = values.length === 0 ? 'todos' : values.map(labelOf).join(', ');

  const toggle = (v: unknown) => {
    onChange(values.includes(v) ? values.filter((x) => x !== v) : [...values, v]);
  };

  return h(
    'div',
    { ref, style: { position: 'relative' } },
    h(FilterChip, {
      label,
      value: display,
      active: values.length > 0,
      onClick: () => setOpen((o) => !o),
    }),
    open
      ? h(
          'div',
          { style: popoverStyle() },
          ...options.map((o) =>
            h(
              'button',
              {
                key: String(o),
                onClick: () => toggle(o),
                style: optionRow(values.includes(o)),
              },
              h(
                'span',
                { style: { fontFamily: 'var(--font-mono)', fontSize: 11, width: 18 } },
                values.includes(o) ? '✓' : ''
              ),
              h('span', null, labelOf(o))
            )
          )
        )
      : null
  );
}

interface SingleSelectChipProps {
  label: string;
  value: unknown;
  options: readonly unknown[];
  labelOf: (v: unknown) => string;
  onChange: (next: unknown) => void;
}

function SingleSelectChip({ label, value, options, labelOf, onChange }: SingleSelectChipProps) {
  const [open, setOpen] = useState(false);
  const ref = usePopover(open, () => setOpen(false));

  return h(
    'div',
    { ref, style: { position: 'relative' } },
    h(FilterChip, {
      label,
      value: labelOf(value),
      active: false,
      onClick: () => setOpen((o) => !o),
    }),
    open
      ? h(
          'div',
          { style: popoverStyle() },
          ...options.map((o) =>
            h(
              'button',
              {
                key: String(o),
                onClick: () => {
                  onChange(o);
                  setOpen(false);
                },
                style: optionRow(value === o),
              },
              h(
                'span',
                { style: { fontFamily: 'var(--font-mono)', fontSize: 11, width: 18 } },
                value === o ? '●' : ''
              ),
              h('span', null, labelOf(o))
            )
          )
        )
      : null
  );
}

interface SourceInputChipProps {
  value: string | null;
  onChange: (next: string | null) => void;
}

function SourceInputChip({ value, onChange }: SourceInputChipProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value ?? '');
  const ref = usePopover(open, () => setOpen(false));

  useEffect(() => {
    setDraft(value ?? '');
  }, [value]);

  return h(
    'div',
    { ref, style: { position: 'relative' } },
    h(FilterChip, {
      label: 'SOURCE',
      value: value ?? 'todos',
      active: !!value,
      onClick: () => setOpen((o) => !o),
    }),
    open
      ? h(
          'div',
          { style: { ...popoverStyle(), width: 260, padding: 10 } },
          h('input', {
            value: draft,
            onChange: (e: { target: { value: string } }) => setDraft(e.target.value),
            onKeyDown: (e: { key: string }) => {
              if (e.key === 'Enter') {
                onChange(draft.trim().length > 0 ? draft.trim() : null);
                setOpen(false);
              }
            },
            placeholder: 'plugin:billing-afip',
            autoFocus: true,
            className: 'input',
            style: { fontFamily: 'var(--font-mono)', fontSize: 12 },
          }),
          h(
            'div',
            {
              style: { display: 'flex', justifyContent: 'flex-end', gap: 6, marginTop: 8 },
            },
            value
              ? h(
                  'button',
                  {
                    className: 'btn btn-ghost btn-sm',
                    onClick: () => {
                      onChange(null);
                      setOpen(false);
                    },
                  },
                  'limpiar'
                )
              : null,
            h(
              'button',
              {
                className: 'btn btn-primary btn-sm',
                onClick: () => {
                  onChange(draft.trim().length > 0 ? draft.trim() : null);
                  setOpen(false);
                },
              },
              'aplicar'
            )
          )
        )
      : null
  );
}

// =============================================================================
// Helpers internos del filter-bar
// =============================================================================

function popoverStyle() {
  return {
    position: 'absolute' as const,
    top: 30,
    left: 0,
    zIndex: 31,
    minWidth: 180,
    background: 'var(--white)',
    border: '0.5px solid var(--neutral-300)',
    borderRadius: 8,
    boxShadow: 'var(--shadow-pop)',
    overflow: 'hidden',
  };
}

function optionRow(active: boolean) {
  return {
    display: 'flex' as const,
    alignItems: 'center' as const,
    gap: 8,
    width: '100%',
    padding: '8px 12px',
    background: active ? 'var(--neutral-100)' : 'transparent',
    border: 'none' as const,
    borderBottom: '0.5px solid var(--neutral-300)',
    cursor: 'pointer' as const,
    fontFamily: 'var(--font-sans)',
    fontSize: 12,
    color: 'var(--neutral-950)',
    textAlign: 'left' as const,
  };
}

/** Click-outside hook compartido entre los chips con popover. */
function usePopover(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open, onClose]);
  return ref;
}
