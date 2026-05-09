// Punto único de navegación a la vista Stream con filtros precargados.
// Hermano de open-trace.ts y open-issue.ts. Cualquier vista que quiera
// "Ver en Stream con filtro X" pasa por acá — si mañana cambia el viewId
// de Stream o el shape de los params, hay un único lugar para tocar.

export const STREAM_VIEW_ID = 'kit-observability.stream.open';

export interface PluginViewsApi {
  open: (viewId: string, params?: Record<string, unknown>) => void;
}

export interface OpenStreamOptions {
  /** Filtra por `source` exacto (ej: 'TenantStateAuditService'). */
  source?: string | null;
  /** Filtra por request_id (mismo comportamiento que "seguir cadena"). */
  requestId?: string | null;
  /** Tenant id explícito para el filtro de tenant. */
  tenantId?: string | null;
  /** Texto libre para el filtro `q` del backend. */
  q?: string | null;
  /** ISO timestamp inicio de ventana custom — override del chip de range. */
  from?: string | null;
  /** ISO timestamp fin de ventana custom — override del chip de range. */
  to?: string | null;
}

/**
 * Abre la vista Stream con los filtros que se pasen. Cualquier campo
 * `null`/`undefined`/empty se ignora (Stream lo trata como "no filtrar
 * por eso"). Si no se pasa ninguno, abre Stream sin filtro pre-cargado.
 *
 * Los filtros componen como AND en el backend: `source + tenantId + q +
 * window` se aplican todos a la vez para que un caller pueda ser
 * quirúrgico (ej: navegar de un Issue del audit y caer exactamente en sus
 * 8 logs sin ruido).
 */
export function openStream(views: PluginViewsApi, opts: OpenStreamOptions = {}): void {
  const params: Record<string, unknown> = {};
  pushIfPresent(params, 'source', opts.source);
  pushIfPresent(params, 'requestId', opts.requestId);
  pushIfPresent(params, 'tenantId', opts.tenantId);
  pushIfPresent(params, 'q', opts.q);
  pushIfPresent(params, 'from', opts.from);
  pushIfPresent(params, 'to', opts.to);
  views.open(STREAM_VIEW_ID, params);
}

function pushIfPresent(
  out: Record<string, unknown>,
  key: string,
  value: string | null | undefined
): void {
  if (typeof value !== 'string') return;
  const trimmed = value.trim();
  if (trimmed.length === 0) return;
  out[key] = trimmed;
}
