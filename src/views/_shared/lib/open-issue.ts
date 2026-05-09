// Punto único de navegación a la vista Issues con un fingerprint
// preseleccionado. Pareja de `open-trace.ts` — cualquier vista que
// quiera ofrecer "Abrir issue X" pasa por acá.

export const ISSUES_VIEW_ID = 'kit-observability.issues.open';

export interface PluginViewsApi {
  open: (viewId: string, params?: Record<string, unknown>) => void;
}

/**
 * Abre la vista Issues. Si se pasa un `fingerprint`, la vista Issues lo
 * usa para auto-seleccionar el issue correspondiente. Acepta null/empty
 * para ser robusto: si no hay fingerprint, abre Issues sin selección.
 */
export function openIssue(views: PluginViewsApi, fingerprint: string | null | undefined): void {
  const params: Record<string, unknown> = {};
  if (typeof fingerprint === 'string') {
    const trimmed = fingerprint.trim();
    if (trimmed.length > 0) params.fingerprint = trimmed;
  }
  views.open(ISSUES_VIEW_ID, params);
}
