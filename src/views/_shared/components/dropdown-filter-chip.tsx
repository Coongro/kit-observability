// Chip de filtro genérico con dropdown poblado por un fetcher async + input
// libre como fallback. Generalización del ex-`TenantFilterChip` cuando
// SOURCE necesitó la misma forma — los wrappers concretos
// (`TenantFilterChip`, `SourceFilterChip`) solo aportan el `fetcher` y los
// labels específicos del dominio.
//
// Diseño:
//   - El caller maneja el estado (`value` / `setValue`) — el chip es
//     controlado.
//   - El `fetcher` recibe un `AbortSignal` y devuelve una lista de items
//     `{id, name, hint?}`. Si no se pasa `fetcher` ni `knownItems`, el
//     dropdown queda vacío y solo funciona el input libre (degraded mode).
//   - `knownItems` permite saltearse el fetch (tests, lista cacheada).
//   - El input libre siempre está disponible — útil para valores que no
//     aparecen en la lista (ej: tenants desinstalados, sources legacy).

import { getHostReact } from '@coongro/plugin-sdk';

import { useFetch } from '../use-fetch.js';

import { chipStyle } from './filter-chip.js';
import { ObsIcon } from './icons.js';

const React = getHostReact();
const h = React.createElement;
const { useEffect, useMemo, useRef, useState } = React;

export interface DropdownFilterChipItem {
  /** Valor que se persiste como filtro (UUID, source string, etc.). */
  id: string;
  /** Etiqueta humana en la lista del popover. */
  name: string;
  /** Texto secundario opcional (UUID corto, count, etc.) renderizado en mono. */
  hint?: string;
}

export interface DropdownFilterChipProps {
  label: string;
  /** Valor actual; null = "todos" (sin filtro). */
  value: string | null;
  setValue: (id: string | null) => void;
  /** Texto del chip cuando `value` es null. Default 'todos'. */
  emptyDisplay?: string;
  /** Texto del botón "todos" en el popover. Default = `emptyDisplay`. */
  allLabel?: string;
  /** Placeholder del input libre. */
  placeholder?: string;
  /**
   * Cuando el `value` actual no aparece en `items`, lo mostramos en el
   * chip aplicado este formatter. Default: identity (mostrar el valor crudo).
   * Útil para acortar UUIDs, etc.
   */
  formatUnknownValue?: (value: string) => string;
  /** Lista pre-cargada — si está, NO se ejecuta el fetcher. */
  knownItems?: DropdownFilterChipItem[];
  /** Async fetcher. Si no está definido y no hay `knownItems`, lista vacía. */
  fetcher?: (signal: AbortSignal) => Promise<DropdownFilterChipItem[]>;
  /** Ancho del popover en px. Default 320. */
  popoverWidth?: number;
}

export function DropdownFilterChip({
  label,
  value,
  setValue,
  emptyDisplay = 'todos',
  allLabel,
  placeholder,
  formatUnknownValue = (v) => v,
  knownItems,
  fetcher,
  popoverWidth = 320,
}: DropdownFilterChipProps) {
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState(false);
  const [draft, setDraft] = useState(value ?? '');
  const ref = useRef<HTMLDivElement | null>(null);

  // Fetch automático si el caller no inyectó items y hay fetcher.
  // `enabled` evita request innecesario en tests / re-uso con lista
  // ya disponible.
  const shouldFetch = !knownItems && !!fetcher;
  const { data: fetched } = useFetch(
    (signal) => (fetcher ? fetcher(signal) : Promise.resolve([])),
    [],
    { enabled: shouldFetch }
  );

  const items = useMemo<DropdownFilterChipItem[]>(
    () => knownItems ?? fetched ?? [],
    [knownItems, fetched]
  );

  useEffect(() => {
    setDraft(value ?? '');
  }, [value]);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  const active = !!value;
  const knownMatch = items.find((i) => i.id === value);
  const display =
    active && value !== null ? (knownMatch?.name ?? formatUnknownValue(value)) : emptyDisplay;

  const apply = () => {
    const trimmed = draft.trim();
    setValue(trimmed.length > 0 ? trimmed : null);
    setOpen(false);
  };

  return h(
    'div',
    { ref, style: { position: 'relative' } },
    h(
      'button',
      {
        onClick: () => setOpen((o) => !o),
        onMouseEnter: () => setHover(true),
        onMouseLeave: () => setHover(false),
        style: { ...chipStyle(active, hover), maxWidth: 240 },
      },
      h(
        'span',
        {
          style: {
            color: active ? 'rgba(255,255,255,0.55)' : 'var(--neutral-500)',
            fontSize: 10.5,
            fontWeight: 500,
            textTransform: 'uppercase',
            letterSpacing: '-0.3px',
          },
        },
        label
      ),
      h(
        'span',
        {
          style: { fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis' },
        },
        display
      ),
      h(ObsIcon, {
        name: 'chevDown',
        size: 11,
        style: { color: active ? 'rgba(255,255,255,0.6)' : 'var(--neutral-500)' },
      })
    ),
    open
      ? h(
          'div',
          {
            style: {
              position: 'absolute',
              top: 30,
              left: 0,
              zIndex: 31,
              width: popoverWidth,
              background: 'var(--white)',
              border: '0.5px solid var(--neutral-300)',
              borderRadius: 8,
              boxShadow: 'var(--shadow-pop)',
              overflow: 'hidden',
              maxHeight: 480,
              display: 'flex',
              flexDirection: 'column',
            },
          },
          h(
            'div',
            { style: { padding: '10px 12px', borderBottom: '0.5px solid var(--neutral-300)' } },
            h('input', {
              value: draft,
              onChange: (e: { target: { value: string } }) => setDraft(e.target.value),
              onKeyDown: (e: { key: string }) => {
                if (e.key === 'Enter') apply();
              },
              placeholder,
              autoFocus: true,
              className: 'input',
              style: { fontFamily: 'var(--font-mono)', fontSize: 12 },
            })
          ),
          h(
            'div',
            { style: { overflowY: 'auto', flex: 1 } },
            h(
              'button',
              {
                onClick: () => {
                  setValue(null);
                  setOpen(false);
                },
                style: optStyle(value === null),
              },
              h('span', null, allLabel ?? emptyDisplay),
              h(
                'span',
                {
                  style: {
                    color: 'var(--neutral-500)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 11,
                  },
                },
                '*'
              )
            ),
            items.length > 0
              ? h('div', { style: { height: 0.5, background: 'var(--neutral-300)' } })
              : null,
            ...items.map((item) =>
              h(
                'button',
                {
                  key: item.id,
                  onClick: () => {
                    setValue(item.id);
                    setOpen(false);
                  },
                  style: optStyle(value === item.id),
                },
                h(
                  'span',
                  {
                    style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
                  },
                  item.name
                ),
                item.hint
                  ? h(
                      'span',
                      {
                        style: {
                          color: 'var(--neutral-500)',
                          fontFamily: 'var(--font-mono)',
                          fontSize: 10.5,
                          flexShrink: 0,
                          marginLeft: 8,
                        },
                      },
                      item.hint
                    )
                  : null
              )
            )
          ),
          h(
            'div',
            {
              style: {
                padding: '8px 12px',
                borderTop: '0.5px solid var(--neutral-300)',
                display: 'flex',
                justifyContent: 'flex-end',
              },
            },
            h('button', { className: 'btn btn-primary btn-sm', onClick: apply }, 'aplicar')
          )
        )
      : null
  );
}

function optStyle(active: boolean) {
  return {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    padding: '8px 12px',
    background: active ? 'var(--neutral-100)' : 'transparent',
    border: 'none',
    borderBottom: '0.5px solid var(--neutral-300)',
    cursor: 'pointer',
    fontFamily: 'var(--font-sans)',
    fontSize: 12,
    color: 'var(--neutral-950)',
    textAlign: 'left' as const,
  };
}
