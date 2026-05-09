// Chip de filtro single-select: label + valor + popover con radio-style
// items. Pareja del MultiSelectChip; vive separado para que cada uno
// tenga su signature clara (1 valor vs N valores) sin un genérico que el
// patrón `h()` de este codebase no preserva.

import { getHostReact } from '@coongro/plugin-sdk';

import { FilterChip } from './filter-chip.js';
import { optionRow, popoverStyle, usePopover } from './popover.js';

const React = getHostReact();
const h = React.createElement;
const { useState } = React;

export interface SingleSelectChipProps {
  label: string;
  value: unknown;
  options: readonly unknown[];
  labelOf: (v: unknown) => string;
  onChange: (next: unknown) => void;
}

export function SingleSelectChip({
  label,
  value,
  options,
  labelOf,
  onChange,
}: SingleSelectChipProps) {
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
