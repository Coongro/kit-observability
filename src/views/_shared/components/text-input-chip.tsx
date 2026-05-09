// Chip de filtro con input de texto libre — usado por filtros que el
// backend acepta como string libre (ej: SOURCE, request_id). El popover
// trae un input + botón "limpiar" cuando hay valor activo + "aplicar".
//
// Generalizado desde `SourceInputChip` cuando Stream view necesitó la
// misma forma para `request_id`. Si en el futuro un filtro necesita
// validación específica del valor antes de aplicar (ej: UUID), agregar
// `validate?: (raw: string) => string | null` con error visible en el
// popover.

import { getHostReact } from '@coongro/plugin-sdk';

import { FilterChip } from './filter-chip.js';
import { popoverStyle, usePopover } from './popover.js';

const React = getHostReact();
const h = React.createElement;
const { useEffect, useState } = React;

export interface TextInputChipProps {
  label: string;
  /** Valor actual; null = no hay filtro aplicado. */
  value: string | null;
  /** Texto que se muestra en el chip cuando `value` es null. Default 'todos'. */
  emptyDisplay?: string;
  /** Placeholder dentro del input del popover. */
  placeholder?: string;
  /** Ancho del popover en px. Default 260. */
  popoverWidth?: number;
  /** Tipografía del input. Default mono (útil para IDs y paths). */
  inputFontFamily?: string;
  onChange: (next: string | null) => void;
}

export function TextInputChip({
  label,
  value,
  emptyDisplay = 'todos',
  placeholder,
  popoverWidth = 260,
  inputFontFamily = 'var(--font-mono)',
  onChange,
}: TextInputChipProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value ?? '');
  const ref = usePopover(open, () => setOpen(false));

  useEffect(() => {
    setDraft(value ?? '');
  }, [value]);

  const apply = () => {
    onChange(draft.trim().length > 0 ? draft.trim() : null);
    setOpen(false);
  };

  return h(
    'div',
    { ref, style: { position: 'relative' } },
    h(FilterChip, {
      label,
      value: value ?? emptyDisplay,
      active: !!value,
      onClick: () => setOpen((o) => !o),
    }),
    open
      ? h(
          'div',
          { style: { ...popoverStyle(), width: popoverWidth, padding: 10 } },
          h('input', {
            value: draft,
            onChange: (e: { target: { value: string } }) => setDraft(e.target.value),
            onKeyDown: (e: { key: string }) => {
              if (e.key === 'Enter') apply();
            },
            placeholder,
            autoFocus: true,
            className: 'input',
            style: { fontFamily: inputFontFamily, fontSize: 12 },
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
            h('button', { className: 'btn btn-primary btn-sm', onClick: apply }, 'aplicar')
          )
        )
      : null
  );
}
