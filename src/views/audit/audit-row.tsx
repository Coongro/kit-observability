import { getHostReact, type usePlugin } from '@coongro/plugin-sdk';

import type { AuditEvent } from '../_shared/api.js';
import { CopyBtn } from '../_shared/components/copy-btn.js';
import { ObsIcon } from '../_shared/components/icons.js';
import { shortenId } from '../_shared/lib/format-id.js';
import { absTime, relTime } from '../_shared/lib/format-time.js';
import { openStream } from '../_shared/lib/open-stream.js';

import { getActionVerbColors, getVerbColorsIfMeaningful } from './lib/action-verb.js';
import { MetaSummary } from './meta-summary.js';

const React = getHostReact();
const h = React.createElement;
const { useState } = React;

export interface AuditRowProps {
  event: AuditEvent;
  /**
   * Resolver `tenantId → tenant name` provisto por el view padre. Devolver
   * `undefined` para tenants no conocidos — la celda cae al UUID corto.
   * Pasarlo como prop (en vez de fetchear per-row) evita N peticiones a
   * `/tenants` por cada repaint de la tabla.
   */
  resolveTenantName: (tenantId: string) => string | undefined;
  /**
   * API de navegación entre vistas del plugin. Se inyecta desde el padre
   * (un solo `usePlugin()` en `AuditView`) para que las N filas de la
   * tabla no llamen el hook cada una.
   */
  views: ReturnType<typeof usePlugin>['views'];
}

export function AuditRow({ event, resolveTenantName, views }: AuditRowProps) {
  const [hover, setHover] = useState(false);
  const verbColors = getActionVerbColors(event.action);
  const targetLabel = formatTarget(event.entityType, event.entityId);
  // Color del target chip: si el entityId termina en un verbo conocido
  // (`calendar.events.create`, `appointments.update`), pintamos el chip
  // según ese verbo. Esto cubre el caso de auto-wired repos donde la
  // action genérica `plugin.action.executed` no comunica la operación
  // real — la información de "qué se hizo" vive en el entityId.
  // Si el entityId no tiene verbo identificable (`user:123`, refs puros),
  // dejamos el chip en su styling neutral default.
  const targetVerbColors = event.entityId ? getVerbColorsIfMeaningful(event.entityId) : null;
  const tenantName = event.tenantId ? resolveTenantName(event.tenantId) : undefined;

  return h(
    'tr',
    {
      onMouseEnter: () => setHover(true),
      onMouseLeave: () => setHover(false),
      style: {
        background: hover ? 'var(--neutral-100)' : 'var(--white)',
        borderBottom: '0.5px solid var(--neutral-300)',
      },
    },
    // ── timestamp ────────────────────────────────────────────────────
    h(
      'td',
      { style: cell() },
      h(
        'div',
        { style: { fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--neutral-950)' } },
        absTime(event.timestamp, true)
      ),
      h(
        'div',
        {
          style: {
            fontFamily: 'var(--font-sans)',
            fontSize: 10.5,
            color: 'var(--neutral-500)',
            marginTop: 2,
          },
        },
        relTime(event.timestamp)
      )
    ),
    // ── actor (con tenant name como contexto secundario) ────────────
    h(
      'td',
      { style: cell() },
      event.actorId
        ? h(ActorCell, {
            actorId: event.actorId,
            tenantName,
          })
        : h(
            'span',
            {
              style: { fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--neutral-500)' },
            },
            'system'
          )
    ),
    // ── action (con color por verbo) ─────────────────────────────────
    h(
      'td',
      { style: cell() },
      h(
        'span',
        {
          style: {
            display: 'inline-flex',
            padding: '3px 8px',
            borderRadius: 4,
            background: verbColors.bg,
            color: verbColors.fg,
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            fontWeight: 500,
            // Permite que actions largas wrappen sin desbordar el chip.
            wordBreak: 'break-all',
          },
        },
        event.action
      )
    ),
    // ── target (wrap permitido, sin elipsis, color por verbo del entityId) ─
    h(
      'td',
      { style: cell() },
      targetLabel
        ? h(
            'span',
            {
              style: {
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '2px 6px',
                borderRadius: 3,
                // Si el entityId tiene un verbo identificable
                // (`...create`, `...update`, `...delete`), pintamos
                // el chip; sino default neutral.
                background: targetVerbColors?.bg ?? 'var(--neutral-200)',
                color: targetVerbColors?.fg ?? 'var(--neutral-950)',
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                maxWidth: '100%',
                // Multi-line wrap para entityIds largos (UUIDs, slug+id):
                // `wordBreak: break-all` permite cortar dentro de la
                // palabra; sin esto las strings sin espacios desbordan
                // el ancho del chip.
                whiteSpace: 'normal',
                wordBreak: 'break-all',
              },
            },
            targetLabel,
            hover ? h(CopyBtn, { value: targetLabel, label: 'copiar target', size: 10 }) : null
          )
        : h(
            'span',
            {
              style: { fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--neutral-500)' },
            },
            '—'
          )
    ),
    // ── tenant (nombre arriba, UUID corto abajo) ────────────────────
    h(
      'td',
      { style: cell() },
      event.tenantId
        ? h(TenantCell, { tenantId: event.tenantId, tenantName })
        : h(
            'span',
            {
              style: { fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--neutral-500)' },
            },
            'system'
          )
    ),
    // ── meta (chips con +N expandible) ──────────────────────────────
    h('td', { style: cell() }, h(MetaSummary, { metadata: event.metadata })),
    // ── acciones row (cross-link a Stream + copy, on hover) ────────
    // El audit event y los logs operacionales del mismo request comparten
    // `request_id` (cls.getId) — cliquear "abrir en Stream" carga la
    // vista filtrada por requestId+tenantId, dando el contexto de "qué
    // más pasó en el mismo request" que un investigador típicamente
    // quiere después de ver un evento de auditoría.
    //
    // NOTA: la vista Trace usa el `trace_id` de OTel (hex de 32 chars),
    // que NO coincide con el `request_id` del cls (UUID con guiones).
    // Por eso NO exponemos "abrir Trace" desde audit todavía — sería un
    // link roto. Cuando bridgemos cls.idGenerator con OTel context,
    // sumar acá un segundo botón y openTrace(views, event.requestId).
    h(
      'td',
      { style: { ...cell(), textAlign: 'right' } },
      h(
        'div',
        {
          style: { display: 'inline-flex', gap: 4, opacity: hover ? 1 : 0 },
        },
        event.requestId
          ? h(
              'button',
              {
                type: 'button',
                onClick: () =>
                  openStream(views, {
                    requestId: event.requestId,
                    tenantId: event.tenantId,
                  }),
                title: 'abrir en Stream (mismo request_id)',
                style: iconButtonStyle(),
              },
              h(ObsIcon, { name: 'external', size: 12 })
            )
          : null,
        h(CopyBtn, { value: event, label: 'copiar evento', size: 12 })
      )
    )
  );
}

function iconButtonStyle(): React.CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 4,
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    color: 'var(--neutral-700)',
    borderRadius: 3,
  };
}

interface ActorCellProps {
  actorId: string;
  tenantName: string | undefined;
}

function ActorCell({ actorId, tenantName }: ActorCellProps) {
  return h(
    'div',
    { style: { display: 'flex', alignItems: 'center', gap: 8 } },
    h(
      'span',
      {
        style: {
          width: 26,
          height: 26,
          borderRadius: '50%',
          background: 'var(--gold-soft)',
          color: 'var(--gold-deep)',
          fontSize: 10.5,
          fontWeight: 700,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          fontFamily: 'var(--font-sans)',
        },
      },
      // Iniciales placeholder hasta que tengamos un endpoint de users; los
      // primeros 2 chars del id son visualmente distintivos para UUIDs
      // y para numeric ids (WP user_id `1001` → `10`).
      actorId.slice(0, 2).toUpperCase()
    ),
    h(
      'div',
      // minWidth: 0 evita que el grid hijo desborde el flex container
      // cuando el tenant name es largo.
      { style: { minWidth: 0 } },
      h(
        'div',
        {
          style: {
            fontFamily: 'var(--font-mono)',
            fontSize: 11.5,
            color: 'var(--neutral-950)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          },
        },
        shortenId(actorId)
      ),
      // Línea secundaria: nombre del tenant si existe (contexto del actor).
      // Con esto, "user 1001 acting on tenant Acme Vet" queda claro de
      // un vistazo aunque el sub del JWT sea solo numeric.
      tenantName
        ? h(
            'div',
            {
              style: {
                fontFamily: 'var(--font-sans)',
                fontSize: 10.5,
                color: 'var(--neutral-500)',
                marginTop: 1,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              },
              title: tenantName,
            },
            tenantName
          )
        : null
    )
  );
}

interface TenantCellProps {
  tenantId: string;
  tenantName: string | undefined;
}

function TenantCell({ tenantId, tenantName }: TenantCellProps) {
  // Si no resolvemos el name, mostramos solo UUID corto — fallback honesto
  // mientras /tenants carga o si el tenant fue borrado.
  if (!tenantName) {
    return h(
      'span',
      {
        style: { fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--neutral-700)' },
        title: tenantId,
      },
      shortenId(tenantId)
    );
  }
  return h(
    'div',
    { style: { display: 'flex', flexDirection: 'column', minWidth: 0 } },
    h(
      'div',
      {
        style: {
          fontFamily: 'var(--font-sans)',
          fontSize: 12.5,
          color: 'var(--neutral-950)',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        },
        title: tenantName,
      },
      tenantName
    ),
    h(
      'div',
      {
        style: {
          fontFamily: 'var(--font-mono)',
          fontSize: 10.5,
          color: 'var(--neutral-500)',
          marginTop: 1,
        },
        title: tenantId,
      },
      shortenId(tenantId)
    )
  );
}

function formatTarget(entityType: string | null, entityId: string | null): string | null {
  if (!entityType && !entityId) return null;
  if (entityType && entityId) return `${entityType}:${entityId}`;
  return entityType ?? entityId;
}

function cell() {
  return {
    padding: '12px 14px',
    fontFamily: 'var(--font-sans)',
    fontSize: 12.5,
    color: 'var(--neutral-950)',
    verticalAlign: 'middle' as const,
  };
}
