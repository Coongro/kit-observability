// Parser puro de stacks de error. Vive separado de `stack-frame.tsx` (que
// trae React via `getHostReact`) para que el regex sea unit-testeable sin
// necesidad de levantar el host de plugin-sdk.

export interface StackFrameData {
  /** Nombre de la función. */
  fn: string;
  /** Path del archivo, idealmente relativo al repo. */
  file: string;
  line: number;
  col: number;
  /** False para frames de node_modules / Node internals — se renderean colapsables. */
  app: boolean;
}

/**
 * Parsea un campo `error` de un LogEntry (objeto JSON freeform) intentando
 * extraer un stack array compatible con `StackFrameData[]`. Si el formato
 * no matchea, devuelve null para que el caller pueda renderear un mensaje
 * genérico en lugar de fallar.
 *
 * Soporta:
 *   - `error.stack` como string (formato V8: `at fn (file:line:col)`).
 *   - `error.frames` ya parseado como `StackFrameData[]`.
 */
export function parseStackFromError(error: unknown): StackFrameData[] | null {
  if (!error || typeof error !== 'object') return null;
  const e = error as { stack?: unknown; frames?: unknown };

  if (Array.isArray(e.frames)) {
    return e.frames.filter(isStackFrameData);
  }

  if (typeof e.stack !== 'string') return null;

  const lines = e.stack.split('\n').slice(1);
  const frames: StackFrameData[] = [];
  for (const raw of lines) {
    const m = /at\s+(.+?)\s+\((.+?):(\d+):(\d+)\)/.exec(raw) ?? /at\s+(.+?):(\d+):(\d+)/.exec(raw);
    if (!m) continue;
    const fn = m[1];
    const file = m.length === 5 ? m[2] : '<anonymous>';
    const line = parseInt(m[m.length - 2], 10);
    const col = parseInt(m[m.length - 1], 10);
    frames.push({
      fn,
      file,
      line,
      col,
      app: !file.includes('node_modules') && !file.startsWith('node:'),
    });
  }
  // Si había un stack string pero ningún frame matcheó el regex, eso es
  // formato desconocido (V8 cambiando shape, runtime distinto, framework
  // pre-procesando). Loggeamos para que la próxima vez que pase haya
  // rastro inspectable en lugar de un panel "sin stack" mudo.
  if (frames.length === 0 && e.stack.trim().length > 0) {
    // eslint-disable-next-line no-console
    console.warn('[kit-observability] parseStackFromError: no frames matched, raw stack:', e.stack);
  }
  return frames.length > 0 ? frames : null;
}

function isStackFrameData(v: unknown): v is StackFrameData {
  if (!v || typeof v !== 'object') return false;
  const f = v as Record<string, unknown>;
  return (
    typeof f.fn === 'string' &&
    typeof f.file === 'string' &&
    typeof f.line === 'number' &&
    typeof f.col === 'number' &&
    typeof f.app === 'boolean'
  );
}
