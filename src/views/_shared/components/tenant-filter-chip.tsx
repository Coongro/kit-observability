import { getHostReact } from '@coongro/plugin-sdk';

import { listTenants, type TenantOption } from '../api.js';
import { useFetch } from '../use-fetch.js';

import { chipStyle } from './filter-chip.js';
import { ObsIcon } from './icons.js';

const React = getHostReact();
const h = React.createElement;
const { useState, useRef, useEffect, useMemo } = React;

export interface TenantFilterChipProps {
  /** UUID del tenant filtrado, null = "todos". */
  tenantId: string | null;
  setTenantId: (id: string | null) => void;
  /**
   * Lista opcional para sobrescribir el fetch automático (tests / re-uso
   * con lista cacheada). Si no se pasa, el chip pide la lista al backend
   * via `GET /tenants` al montarse.
   */
  knownTenants?: TenantOption[];
}

/**
 * Chip de filtro por tenant. Click abre popover con input UUID + lista de
 * tenants conocidos (si los hay) + botón "todos". Diseñado para que la
 * versión sin lista (UUID a mano) no se sienta degradada — es lo que va a
 * usar el equipo Coongro internamente hasta que se exponga un listado.
 */
export function TenantFilterChip({ tenantId, setTenantId, knownTenants }: TenantFilterChipProps) {
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState(false);
  const [draft, setDraft] = useState(tenantId ?? '');
  const ref = useRef<HTMLDivElement | null>(null);

  // Autocomplete: si el caller no inyectó tenants, los pedimos al backend.
  // `enabled: !knownTenants` evita un fetch innecesario en tests / re-uso
  // donde la lista ya está disponible.
  const { data: fetched } = useFetch((signal) => listTenants({ signal }), [], {
    enabled: !knownTenants,
  });
  const tenants = useMemo<TenantOption[]>(
    () => knownTenants ?? fetched?.rows ?? [],
    [knownTenants, fetched]
  );

  useEffect(() => {
    setDraft(tenantId ?? '');
  }, [tenantId]);

  // Click-outside para cerrar el popover sin agregar listener global cuando
  // está cerrado — micro-optimización pero hace al chip composable en
  // paneles densos sin crear ruido en eventos.
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  const active = !!tenantId;
  const knownMatch = tenants.find((t) => t.id === tenantId);
  const display = active ? (knownMatch?.name ?? shorten(tenantId)) : 'todos';

  const apply = () => {
    const trimmed = draft.trim();
    setTenantId(trimmed.length > 0 ? trimmed : null);
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
        style: { ...chipStyle(active, hover), maxWidth: 220 },
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
        'TENANT'
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
              width: 320,
              background: 'var(--white)',
              border: '0.5px solid var(--neutral-300)',
              borderRadius: 8,
              boxShadow: 'var(--shadow-pop)',
              overflow: 'hidden',
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
              placeholder: 'tenant_id (UUID)',
              autoFocus: true,
              className: 'input',
              style: { fontFamily: 'var(--font-mono)', fontSize: 12 },
            })
          ),
          h(
            'button',
            {
              onClick: () => {
                setTenantId(null);
                setOpen(false);
              },
              style: optStyle(tenantId === null),
            },
            h('span', null, 'todos los tenants'),
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
          tenants.length > 0
            ? h('div', { style: { height: 0.5, background: 'var(--neutral-300)' } })
            : null,
          ...tenants.map((t) =>
            h(
              'button',
              {
                key: t.id,
                onClick: () => {
                  setTenantId(t.id);
                  setOpen(false);
                },
                style: optStyle(tenantId === t.id),
              },
              h('span', null, t.name),
              h(
                'span',
                {
                  style: {
                    color: 'var(--neutral-500)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 10.5,
                  },
                },
                shorten(t.id)
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

/** Acorta un UUID a `xxxxxxxx…yyyy` para chips/listas densas. */
function shorten(id: string): string {
  if (id.length <= 12) return id;
  return `${id.slice(0, 8)}…${id.slice(-4)}`;
}
