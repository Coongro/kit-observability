// Punto único de navegación a la vista Trace. Cualquier vista del plugin
// que quiera abrir el waterfall (Issues "eventos similares", Stream "ver
// trace", futura Auditoría) usa este helper. Si mañana cambia el viewId
// del Trace o el shape de los params, hay un único lugar para tocar.
//
// El parámetro se llama `trace_id` (snake_case) intencionalmente: es el
// nombre de la columna en `log_spans` y del query string permalinkeable
// (`?view=trace&trace_id=...`). Mantenerlo idéntico evita un mapeo
// innecesario en el receiver del view.
//
// Según el spec del kit-observability: "request_id / trace_id (mismo
// valor; en log_entries se llama request_id, en log_spans se llama
// trace_id)". Por eso aceptamos cualquiera de los dos como input.

export const TRACE_VIEW_ID = 'kit-observability.trace.open';

export interface PluginViewsApi {
  open: (viewId: string, params?: Record<string, unknown>) => void;
}

/**
 * Abre la vista Trace con el id dado. Acepta `null`/`undefined`/empty para
 * ser robusto cuando el caller no validó previamente — en esos casos no
 * hace nada (mejor que abrir el Trace sin id y dejar al user con la vista
 * vacía).
 */
export function openTrace(views: PluginViewsApi, traceId: string | null | undefined): void {
  if (traceId === null || traceId === undefined) return;
  const trimmed = traceId.trim();
  if (trimmed.length === 0) return;
  views.open(TRACE_VIEW_ID, { trace_id: trimmed });
}
