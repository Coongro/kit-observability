// Stub mínimo de `@coongro/plugin-sdk` para tests unitarios. Los views
// (.tsx) importan `getHostReact()` y `usePlugin()` — los tests no
// ejercitan render, pero Vite igual procesa el archivo contenedor cuando
// los tests están en el mismo dir. Sin este stub, Vite tira `Failed to
// load url @coongro/plugin-sdk` durante la resolución.
//
// Solo se aplica vía alias en `vitest.config.ts` (NO en runtime real ni
// en integration tests).

/* eslint-disable @typescript-eslint/no-explicit-any */

export function getHostReact(): any {
  throw new Error(
    '[plugin-sdk stub] getHostReact() invoked in unit test — extract pure logic to a non-tsx file or mock the React-using component.'
  );
}

export function getHostReactDOM(): any {
  throw new Error('[plugin-sdk stub] getHostReactDOM() invoked in unit test');
}

export function getHostUI(): any {
  throw new Error('[plugin-sdk stub] getHostUI() invoked in unit test');
}

export function usePlugin(): any {
  throw new Error('[plugin-sdk stub] usePlugin() invoked in unit test');
}

export function useViewContributions(): any {
  return { sections: [], actions: [], loading: false };
}

export function useSettings(): any {
  return { settings: {}, loading: false };
}

export function useBreakpoint(): string {
  return 'desktop';
}

export function useIsMobile(): boolean {
  return false;
}

export const actions = {
  execute: () => Promise.resolve({ success: false, error: 'stubbed' }),
};

export const events = { on: () => () => undefined, emit: () => undefined };
export const notifications = {};
export const utilityActions = {};
export const settings = {};
export const views = { open: () => undefined };

export function showToast(): void {
  // noop
}

export function unwrapToastResponse<T>(r: T): T {
  return r;
}
