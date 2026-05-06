// Construye el árbol de spans para el waterfall y precomputa todo lo
// que la UI necesita (offset/width relativos al trace, depth, has-children).
// Se mantiene puro y testeable — el componente de render no hace ningún
// cálculo de tiempos.
//
// Decisiones:
//   - Si un span no tiene end_time (in-flight), se usa start_time como
//     end (width 0). Esto permite que el waterfall se renderice durante
//     un trace en vivo sin crashear. La UI lo distingue marcándolo como
//     "in-flight" en SpanRow (status === 'pending').
//   - Si parent_span_id apunta a un span no presente en el array (huérfanos
//     por sampling parcial), se promueve a root para que la cascada los
//     muestre — perderíamos data si los descartáramos.
//   - El orden de los nodos en cada nivel se mantiene por start_time ASC,
//     que ya viene así del backend (ORDER BY start_time ASC).

import type { SpanRecord } from '../../_shared/api.js';

export interface SpanNode {
  span: SpanRecord;
  /** Profundidad en el árbol del trace. Root = 0. */
  depth: number;
  /** Offset relativo al inicio del trace, en [0..1]. */
  offsetFraction: number;
  /** Ancho relativo a la duración total del trace, en [0..1]. Mínimo 0.001 para visibilidad. */
  widthFraction: number;
  /** Duración en nanosegundos, ya calculada (incluye fallback start_time→end_time). */
  durationNs: number;
  /** Si el span está in-flight (sin end_time). */
  inFlight: boolean;
  children: SpanNode[];
}

export interface TraceTree {
  /** Spans root (parent ausente o null), en orden de start_time. */
  roots: SpanNode[];
  /** Inicio del trace en epoch ms. */
  traceStartMs: number;
  /** Duración total del trace en nanosegundos. */
  traceDurationNs: number;
  /** Duración total en milisegundos (UI helper). */
  traceDurationMs: number;
  /** Cantidad total de spans (incluye descendientes). */
  totalSpans: number;
}

const NS_PER_MS = 1_000_000;
const MIN_WIDTH_FRACTION = 0.001;

/**
 * Convierte string|null|number a number. Devuelve 0 para null/inválido —
 * los call-sites no deben crashear con int8 strings.
 */
function toNs(value: string | number | null): number {
  if (value === null || value === undefined) return 0;
  const n = typeof value === 'string' ? Number(value) : value;
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function timestampMs(iso: string): number {
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : 0;
}

/**
 * Calcula la duración real del span — usa duration_ns si está, sino cae a
 * end_time - start_time, y por último 0 (in-flight).
 */
function deriveDurationNs(span: SpanRecord): { durationNs: number; inFlight: boolean } {
  const explicit = toNs(span.duration_ns);
  if (explicit > 0) {
    return { durationNs: explicit, inFlight: false };
  }
  if (span.end_time !== null) {
    const startMs = timestampMs(span.start_time);
    const endMs = timestampMs(span.end_time);
    return { durationNs: Math.max(0, (endMs - startMs) * NS_PER_MS), inFlight: false };
  }
  return { durationNs: 0, inFlight: true };
}

export function buildTraceTree(spans: SpanRecord[]): TraceTree {
  if (spans.length === 0) {
    return {
      roots: [],
      traceStartMs: 0,
      traceDurationNs: 0,
      traceDurationMs: 0,
      totalSpans: 0,
    };
  }

  // Bounds del trace.
  let minStartMs = Number.POSITIVE_INFINITY;
  let maxEndMs = Number.NEGATIVE_INFINITY;
  const enriched = spans.map((span) => {
    const startMs = timestampMs(span.start_time);
    const { durationNs, inFlight } = deriveDurationNs(span);
    const endMs = startMs + durationNs / NS_PER_MS;
    if (startMs < minStartMs) minStartMs = startMs;
    if (endMs > maxEndMs) maxEndMs = endMs;
    return { span, startMs, durationNs, inFlight };
  });

  const traceStartMs = minStartMs === Number.POSITIVE_INFINITY ? 0 : minStartMs;
  const traceDurationMs = Math.max(0, maxEndMs - traceStartMs);
  const traceDurationNs = traceDurationMs * NS_PER_MS;

  // Index para resolver parents en O(1).
  const presentIds = new Set(spans.map((s) => s.span_id));

  // Crear nodos sin children y agruparlos por parent.
  const nodeById = new Map<string, SpanNode>();
  for (const e of enriched) {
    const offsetFraction = traceDurationMs === 0 ? 0 : (e.startMs - traceStartMs) / traceDurationMs;
    const widthFraction =
      traceDurationNs === 0
        ? MIN_WIDTH_FRACTION
        : Math.max(MIN_WIDTH_FRACTION, e.durationNs / traceDurationNs);
    nodeById.set(e.span.span_id, {
      span: e.span,
      depth: 0,
      offsetFraction,
      widthFraction,
      durationNs: e.durationNs,
      inFlight: e.inFlight,
      children: [],
    });
  }

  const roots: SpanNode[] = [];
  for (const node of nodeById.values()) {
    const parentId = node.span.parent_span_id;
    if (parentId !== null && presentIds.has(parentId)) {
      const parent = nodeById.get(parentId);
      // El check de presentIds garantiza que parent existe; el `!` no tiene
      // riesgo, pero usamos un fallback defensivo por si el index se rompe.
      if (parent !== undefined) {
        parent.children.push(node);
        continue;
      }
    }
    roots.push(node);
  }

  // Asignar depth a partir de roots (BFS-ish recursivo, no hay ciclos en
  // un trace bien formado).
  function assignDepth(node: SpanNode, depth: number): void {
    node.depth = depth;
    for (const child of node.children) {
      assignDepth(child, depth + 1);
    }
  }
  for (const root of roots) {
    assignDepth(root, 0);
  }

  return {
    roots,
    traceStartMs,
    traceDurationNs,
    traceDurationMs,
    totalSpans: spans.length,
  };
}

/**
 * Aplana el árbol en orden de visualización (DFS) — la UI renderea filas
 * lineales con `depth` para indentación. Se hace en este módulo (y no en
 * el componente) para que sea testeable y deterministico. Si se pasa
 * `collapsedIds`, se omiten los descendientes de esos nodos.
 */
export function flattenTree(tree: TraceTree, collapsedIds?: Set<string>): SpanNode[] {
  const out: SpanNode[] = [];
  function walk(node: SpanNode): void {
    out.push(node);
    if (collapsedIds?.has(node.span.span_id) === true) return;
    for (const child of node.children) {
      walk(child);
    }
  }
  for (const root of tree.roots) {
    walk(root);
  }
  return out;
}

const NS_PER_MS_FILTER = 1_000_000;
const OTEL_STATUS_CODE_ERROR = 2;

export interface WaterfallFilters {
  /** Si > 0, esconde spans cuya durationNs sea menor (reducir ruido). */
  minDurationMs: number;
  /** Si true, deja solo los spans con status_code === ERROR (2) y sus ancestros. */
  errorsOnly: boolean;
}

export const DEFAULT_WATERFALL_FILTERS: WaterfallFilters = {
  minDurationMs: 0,
  errorsOnly: false,
};

/**
 * Aplica filtros al árbol devolviendo un árbol nuevo. Mantiene siempre
 * los ancestros de los nodos que pasan el filtro — sin esto perderíamos
 * el contexto jerárquico (ver el span de DB sin saber qué request lo
 * disparó). Operación pura: no muta el input.
 */
export function applyFilters(tree: TraceTree, filters: WaterfallFilters): TraceTree {
  const minNs = Math.max(0, filters.minDurationMs) * NS_PER_MS_FILTER;
  const filterErrors = filters.errorsOnly;

  if (minNs === 0 && !filterErrors) return tree;

  const keptIds = new Set<string>();

  const shouldKeep = (node: SpanNode): boolean =>
    !(filterErrors && node.span.status_code !== OTEL_STATUS_CODE_ERROR) && node.durationNs >= minNs;

  function visit(node: SpanNode, ancestorChain: SpanNode[]): void {
    if (shouldKeep(node)) {
      for (const a of ancestorChain) keptIds.add(a.span.span_id);
      keptIds.add(node.span.span_id);
    }
    const nextChain = [...ancestorChain, node];
    for (const child of node.children) visit(child, nextChain);
  }
  for (const root of tree.roots) visit(root, []);

  function clone(node: SpanNode): SpanNode | null {
    if (!keptIds.has(node.span.span_id)) return null;
    const children: SpanNode[] = [];
    for (const child of node.children) {
      const c = clone(child);
      if (c !== null) children.push(c);
    }
    return { ...node, children };
  }
  const newRoots: SpanNode[] = [];
  for (const root of tree.roots) {
    const c = clone(root);
    if (c !== null) newRoots.push(c);
  }
  return { ...tree, roots: newRoots, totalSpans: keptIds.size };
}

/**
 * IDs de todos los nodos del árbol que tienen al menos un hijo. Se usa
 * para implementar "expandir/colapsar todo" sin re-recorrer el árbol en
 * el view.
 */
export function collectExpandableIds(tree: TraceTree): string[] {
  const out: string[] = [];
  function walk(node: SpanNode): void {
    if (node.children.length > 0) out.push(node.span.span_id);
    for (const child of node.children) walk(child);
  }
  for (const root of tree.roots) walk(root);
  return out;
}
