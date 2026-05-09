// Paleta de colores y derivación del "display kind" de un span.
//
// El display kind no es 1:1 con `span.kind` de OTel — derivamos `db` cuando
// `attributes['db.system']` está presente, porque visualmente queremos
// distinguir queries de SQL del resto del client-side. Lo demás se mapea
// directo: SERVER→server, CLIENT→client, INTERNAL/PRODUCER/CONSUMER→internal.

import type { SpanRecord } from '../../_shared/api.js';

import { OTEL_STATUS_CODE_ERROR } from './otel.js';

export type DisplayKind = 'server' | 'client' | 'db' | 'internal';

export interface KindStyle {
  /** Color sólido de la barra del waterfall. */
  fill: string;
  /** Background del KindBadge (lt soft variant). */
  soft: string;
  /** Foreground del KindBadge sobre `soft` (deep variant). */
  deep: string;
  /** Variante dk para hover/active. */
  dk: string;
  /** Label visible en el badge. */
  label: string;
}

export const KIND_COLOR: Record<DisplayKind, KindStyle> = {
  server: {
    fill: 'var(--teal)',
    soft: 'var(--teal-soft)',
    deep: 'var(--teal-deep)',
    dk: 'var(--teal-dk)',
    label: 'server',
  },
  client: {
    fill: 'var(--sky-dk)',
    soft: 'var(--sky-soft)',
    deep: 'var(--sky-deep)',
    dk: 'var(--sky-dk)',
    label: 'client',
  },
  db: {
    fill: 'var(--gold-dk)',
    soft: 'var(--gold-soft)',
    deep: 'var(--gold-deep)',
    dk: 'var(--gold-dk)',
    label: 'db',
  },
  internal: {
    fill: 'var(--neutral-700)',
    soft: 'var(--neutral-200)',
    deep: 'var(--neutral-950)',
    dk: 'var(--neutral-700)',
    label: 'internal',
  },
};

export const DISPLAY_KIND_ORDER: readonly DisplayKind[] = [
  'server',
  'client',
  'db',
  'internal',
] as const;

/**
 * Devuelve el display kind del span. `db.system` en attributes gana sobre
 * el kind de OTel — un span CLIENT que ejecuta SQL se renderea como `db`.
 */
export function displayKind(span: SpanRecord): DisplayKind {
  if (hasDbSystem(span.attributes)) return 'db';
  switch (span.kind) {
    case 'SERVER':
      return 'server';
    case 'CLIENT':
      return 'client';
    default:
      return 'internal';
  }
}

/** Color de la barra: rojo si error, sino paleta del display kind. */
export function spanBarColor(span: SpanRecord): string {
  if (span.status_code === OTEL_STATUS_CODE_ERROR) return 'var(--red)';
  return KIND_COLOR[displayKind(span)].fill;
}

function hasDbSystem(attributes: unknown): boolean {
  if (attributes === null || typeof attributes !== 'object') return false;
  return 'db.system' in (attributes as Record<string, unknown>);
}
