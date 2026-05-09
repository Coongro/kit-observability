// MetaSummary: render de chips key:value para `metadata` con expand/collapse
// interactivo en el sufijo `+N`.
//
// Por qué componente propio (en vez de quedar inline en audit-row):
//   - Estado local (expanded) — lo que justifica que sea un componente.
//   - Tests unitarios independientes del row.
//   - Reutilizable: si hace falta mostrar metadata en el detalle del log
//     o en otra vista, este es el componente.
//
// Diseño visual del chip y de los colores está alineado con el design
// `Observabilidad/AuditView.jsx` — mismas paletas neutral-100/300/500 y
// tipografía mono.

import { getHostReact } from '@coongro/plugin-sdk';

import { formatMetaValue } from './lib/format-meta.js';

const React = getHostReact();
const h = React.createElement;
const { useState } = React;

export interface MetaSummaryProps {
  metadata: unknown;
  /** Cuántas keys mostrar en estado collapsed. Default 3. */
  collapsedLimit?: number;
}

const DEFAULT_COLLAPSED_LIMIT = 3;

export function MetaSummary({
  metadata,
  collapsedLimit = DEFAULT_COLLAPSED_LIMIT,
}: MetaSummaryProps) {
  const [expanded, setExpanded] = useState(false);

  if (metadata === null || metadata === undefined || typeof metadata !== 'object') {
    return h('span', { style: dimText() }, '—');
  }

  const entries = Object.entries(metadata as Record<string, unknown>);
  if (entries.length === 0) {
    return h('span', { style: dimText() }, '—');
  }

  const overflowCount = Math.max(0, entries.length - collapsedLimit);
  const visibleEntries = expanded ? entries : entries.slice(0, collapsedLimit);

  return h(
    'div',
    { style: { display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' } },
    ...visibleEntries.map(([k, v]) => h(MetaChip, { key: k, k, v })),
    overflowCount > 0
      ? h(MetaToggle, {
          expanded,
          overflowCount,
          onClick: () => setExpanded((prev) => !prev),
        })
      : null
  );
}

function MetaChip({ k, v }: { k: string; v: unknown }) {
  return h(
    'span',
    {
      style: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '1px 6px',
        borderRadius: 3,
        background: 'var(--neutral-100)',
        border: '0.5px solid var(--neutral-300)',
        fontFamily: 'var(--font-mono)',
        fontSize: 10.5,
        // Permite wrap del valor (ej. UUIDs largos en `entityId`) sin
        // explotar el ancho de la celda. break-all es agresivo pero
        // mantiene el chip compacto vs CSS hyphens.
        maxWidth: '100%',
        wordBreak: 'break-all',
      },
    },
    h('span', { style: { color: 'var(--neutral-500)' } }, k),
    h('span', { style: { color: 'var(--neutral-950)' } }, formatMetaValue(v))
  );
}

interface MetaToggleProps {
  expanded: boolean;
  overflowCount: number;
  onClick: () => void;
}

function MetaToggle({ expanded, overflowCount, onClick }: MetaToggleProps) {
  return h(
    'button',
    {
      type: 'button',
      onClick: (event: React.MouseEvent) => {
        // El row entero puede tener un onClick a futuro (drill-down al
        // detalle del audit event); stopPropagation evita que expandir
        // metadata dispare ESE click.
        event.stopPropagation();
        onClick();
      },
      title: expanded
        ? 'colapsar metadata'
        : `expandir ${overflowCount} key${overflowCount === 1 ? '' : 's'} más`,
      style: {
        display: 'inline-flex',
        alignItems: 'center',
        padding: '1px 6px',
        borderRadius: 3,
        background: 'transparent',
        border: '0.5px dashed var(--neutral-500)',
        color: 'var(--neutral-700)',
        cursor: 'pointer',
        fontFamily: 'var(--font-mono)',
        fontSize: 10.5,
        // Tabular para que el `+N` no salte de ancho al expandir/colapsar.
        fontVariantNumeric: 'tabular-nums',
      },
    },
    expanded ? '−' : `+${overflowCount}`
  );
}

function dimText(): React.CSSProperties {
  return { fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--neutral-500)' };
}
