// Hook genérico de data fetching para los views del plugin.
//
// Cubre el patrón loading/error/data + AbortController + cleanup + polling
// opt-in. Las 4 vistas (Issues, Stream, Auditoría, Salud) consumen este
// hook para no reimplementar el boilerplate y los bugs sutiles de cleanup
// (setState después de unmount, race conditions cuando los deps cambian).
//
// El callback `fetcher` recibe un `AbortSignal` que se cancela cuando:
//   - los deps cambian (request anterior se vuelve stale),
//   - el componente se desmonta,
//   - el caller invoca `refetch` consecutivamente.
//
// El `signal` se debe pasar al cliente HTTP (`api.queryLogs({ signal })`)
// para que la petición en vuelo se aborte real, no solo se ignore el
// resultado.

import { getHostReact } from '@coongro/plugin-sdk';

const React = getHostReact();
const { useCallback, useEffect, useRef, useState } = React;

import { ApiError } from './api.js';

export interface UseFetchOptions {
  /**
   * Si está definido, refetchea automáticamente cada N ms mientras el
   * componente esté montado. El polling resetea su timer cuando los deps
   * cambian o cuando el caller invoca `refetch` manualmente, así que dos
   * requests nunca se solapan.
   */
  refreshInterval?: number;
  /**
   * Si es false, NO se dispara fetch automático al montar ni al cambiar
   * deps — el caller debe invocar `refetch` manualmente. Útil para views
   * que muestran resultados solo después de un submit (ej: trace detail).
   */
  enabled?: boolean;
}

export interface UseFetchResult<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
  /** Refetch manual: cancela cualquier request en vuelo y dispara uno nuevo. */
  refetch: () => Promise<void>;
}

/**
 * Hook genérico de fetch.
 *
 * @param fetcher Función que recibe un `AbortSignal` y devuelve una Promise.
 *                Debe pasar el signal al cliente HTTP para soporte real de
 *                cancelación.
 * @param deps Dependencias que disparan refetch cuando cambian (igual que
 *             `useEffect`). El caller controla la identidad de los objetos
 *             de filtro (ej: useMemo) para evitar refetches innecesarios.
 * @param options Refresh interval y enabled flag.
 */
export function useFetch<T>(
  fetcher: (signal: AbortSignal) => Promise<T>,
  deps: ReadonlyArray<unknown>,
  options: UseFetchOptions = {}
): UseFetchResult<T> {
  const { refreshInterval, enabled = true } = options;

  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Refs porque no queremos que cambios en el fetcher disparen efecto:
  // el caller controla deps explícitamente.
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
    };
  }, []);

  const run = useCallback(async (): Promise<void> => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);
    try {
      const result = await fetcherRef.current(controller.signal);
      if (!mountedRef.current || controller.signal.aborted) return;
      setData(result);
    } catch (err) {
      if (!mountedRef.current || controller.signal.aborted) return;
      // AbortError no es un error de UI — solo significa que el caller pidió
      // cancelar, ya sea por unmount, deps cambiados o refetch manual.
      if (err instanceof DOMException && err.name === 'AbortError') return;
      const normalized =
        err instanceof Error ? err : new Error(typeof err === 'string' ? err : 'Unknown error');
      setError(normalized);
    } finally {
      if (mountedRef.current && !controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, []);

  // Disparo inicial + cuando cambian deps. El polling se monta sobre ESTE
  // efecto (mismo deps) para que el ciclo polling reinicie limpio cuando
  // los filtros cambian.
  useEffect(() => {
    if (!enabled) return;
    void run();
    if (!refreshInterval || refreshInterval <= 0) return;

    const id = setInterval(() => {
      void run();
    }, refreshInterval);
    return () => {
      clearInterval(id);
    };
  }, [...deps, refreshInterval, enabled]);

  return { data, loading, error, refetch: run };
}

/**
 * Helper para mostrar un mensaje legible cuando `error` es un `ApiError`.
 * Los views pueden usarlo en JSX directo: `{error && <p>{formatError(error)}</p>}`.
 */
export function formatError(err: Error): string {
  if (err instanceof ApiError) {
    return `${err.message} (status ${err.status})`;
  }
  return err.message;
}
