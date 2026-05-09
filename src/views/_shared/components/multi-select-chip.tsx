// Chip de filtro multi-select: label + valor compactado + popover con
// checkboxes. Compartido por las views (Issues, Stream, Auditoría) — vive
// en `_shared/components/` desde el día que el segundo consumer apareció
// (Stream view) en lugar de quedar pegado al primero.
//
// Por qué NO es genérico sobre T: `React.createElement(Component, props)`
// no preserva el genérico al ser invocado con `h()`, y el patrón del
// proyecto es h() en todas las views (ver contacts/, patients/). Para
// mantener type safety en los call-sites, las props usan `unknown[]` y los
// callers castean en `labelOf` y `onChange`. El cast vive en el límite
// (call-site) y NO se filtra al resto del código.

import { getHostReact } from '@coongro/plugin-sdk';

import { FilterChip } from './filter-chip.js';
import { optionRow, popoverStyle, usePopover } from './popover.js';

const React = getHostReact();
const h = React.createElement;
const { useState } = React;

export interface MultiSelectChipProps {
  label: string;
  values: readonly unknown[];
  options: readonly unknown[];
  labelOf: (v: unknown) => string;
  onChange: (next: unknown[]) => void;
}

export function MultiSelectChip({
  label,
  values,
  options,
  labelOf,
  onChange,
}: MultiSelectChipProps) {
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
