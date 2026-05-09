// Hook que fetchea el listado de tenants una vez y expone un resolver
// `id → name`. Usado por la tabla de auditoría para renderizar nombres
// legibles en lugar de UUIDs en columnas Tenant y Actor.
//
// Decisiones:
//   - Una sola petición al mount, NO refetch en cada cambio de filtro.
//     La tabla puede tener cientos de filas todas referenciando los
//     mismos pocos tenants — un fetcher per-row sería gasto innecesario.
//     Si el tenant cambia de nombre durante la sesión (raro), el caller
//     puede llamar `refetch()` manualmente.
//   - Devuelve un `Map` real, no un objeto. Lookups O(1) y semántica
//     clara para callers (`map.get(id) ?? fallback`).
//   - Errors en el fetch caen al fallback (id corto) — no rompen la
//     vista de auditoría. La auditoría debe ser usable aunque el
//     endpoint /tenants esté caído (es un nice-to-have de display).

import { getHostReact } from '@coongro/plugin-sdk';

import { listTenants } from '../../_shared/api.js';

const React = getHostReact();
const { useEffect, useMemo, useState } = React;

export interface TenantNameMap {
  /** Resuelve `id → name`, o `undefined` si no se conoce. */
  readonly get: (tenantId: string) => string | undefined;
  readonly loading: boolean;
  readonly error: Error | null;
  /** Re-fetch manual (raro: cambio de nombre durante la sesión). */
  readonly refetch: () => void;
}

const EMPTY_MAP: ReadonlyMap<string, string> = new Map<string, string>();

export function useTenantNameMap(): TenantNameMap {
  const [data, setData] = useState<ReadonlyMap<string, string>>(EMPTY_MAP);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    listTenants({ signal: controller.signal })
      .then((result) => {
        if (cancelled) return;
        const map = new Map<string, string>();
        for (const t of result.rows) {
          if (t.id && t.name) map.set(t.id, t.name);
        }
        setData(map);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        // AbortError no se reporta — es cleanup esperado.
        if (err instanceof Error && err.name === 'AbortError') return;
        setError(err instanceof Error ? err : new Error(String(err)));
        setLoading(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [tick]);

  return useMemo<TenantNameMap>(
    () => ({
      get: (tenantId) => data.get(tenantId),
      loading,
      error,
      refetch: () => setTick((n) => n + 1),
    }),
    [data, loading, error]
  );
}
