// Construye el árbol de spans para el waterfall y precomputa todo lo
// que la UI necesita (offset/width relativos al trace, depth, hijos).
// Se mantiene puro y testeable — el componente de render no hace ningún
// cálculo de tiempos.
//
// Decisiones:
//   - Si un span no tiene end_time (in-flight), se marca explícito y la UI
//     lo distingue. El waterfall sigue renderizando el trace completo.
//   - Si parent_span_id apunta a un span ausente del array (huérfanos por
//     sampling parcial), se promueve a root: perderíamos data si lo
//     descartáramos.
//   - Children se ordenan localmente por start_time ASC. El backend ya
//     devuelve `ORDER BY start_time ASC`, pero acoplarse implícitamente
//     era frágil — un caller (futuro test, MCP) que pase spans en otro
//     orden vería las cascadas mal armadas. El sort defensivo cuesta
//     O(n log n) sobre listas chicas (1000 spans cap) y es invisible.

import type { SpanRecord } from '../../_shared/api.js';

import { OTEL_STATUS_CODE_ERROR } from './otel.js';

export interface SpanNode {
  readonly span: SpanRecord;
  /** Profundidad en el árbol del trace (root = 0). */
  readonly depth: number;
  /** Offset relativo al inicio del trace, en [0..1]. */
  readonly offsetFraction: number;
  /**
   * Ancho relativo a la duración total del trace, en [0..1] con piso
   * `MIN_WIDTH_FRACTION` para que un span de 0ns siga siendo visible y
   * clickeable en la cascada.
   */
  readonly widthFraction: number;
  /** Duración en nanosegundos, ya calculada (incluye fallback start→end). */
  readonly durationNs: number;
  readonly inFlight: boolean;
  readonly children: ReadonlyArray<SpanNode>;
}

export interface TraceTree {
  readonly roots: ReadonlyArray<SpanNode>;
  readonly traceStartMs: number;
  readonly traceDurationNs: number;
  readonly traceDurationMs: number;
  /**
   * Cantidad de spans en el trace original. NO cambia tras `applyFilters`
   * — los filtros solo afectan `visibleSpanCount`.
   */
  readonly originalSpanCount: number;
  /**
   * Cantidad de spans visibles tras aplicar filtros. Igual a
   * `originalSpanCount` cuando no hay filtros activos.
   */
  readonly visibleSpanCount: number;
}

const NS_PER_MS = 1_000_000;
/** Piso de ancho del bar para que un span de 0ns siga siendo visible/clickeable. */
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

interface EnrichedSpan {
  span: SpanRecord;
  startMs: number;
  durationNs: number;
  inFlight: boolean;
}

export function buildTraceTree(spans: SpanRecord[]): TraceTree {
  if (spans.length === 0) {
    return {
      roots: [],
      traceStartMs: 0,
      traceDurationNs: 0,
      traceDurationMs: 0,
      originalSpanCount: 0,
      visibleSpanCount: 0,
    };
  }

  // Límites del trace.
  let minStartMs = Number.POSITIVE_INFINITY;
  let maxEndMs = Number.NEGATIVE_INFINITY;
  const enriched: EnrichedSpan[] = spans.map((span) => {
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

  // Índice para resolver padres en O(1) y agrupar hijos por parent_span_id.
  const enrichedById = new Map<string, EnrichedSpan>();
  const childrenByParent = new Map<string, EnrichedSpan[]>();
  const rootCandidates: EnrichedSpan[] = [];

  for (const e of enriched) {
    enrichedById.set(e.span.span_id, e);
  }
  for (const e of enriched) {
    const parentId = e.span.parent_span_id;
    if (parentId === null || !enrichedById.has(parentId)) {
      // Sin padre o padre ausente del input (huérfano) → se promueve a root.
      rootCandidates.push(e);
      continue;
    }
    const siblings = childrenByParent.get(parentId);
    if (siblings === undefined) {
      childrenByParent.set(parentId, [e]);
    } else {
      siblings.push(e);
    }
  }

  // Construcción DFS single-pass: cada nodo se crea con su `depth` final
  // (no hay mutación post-construct) para que el tipo `readonly depth`
  // sea verdaderamente inmutable.
  const buildNode = (e: EnrichedSpan, depth: number): SpanNode => {
    const offsetFraction = traceDurationMs === 0 ? 0 : (e.startMs - traceStartMs) / traceDurationMs;
    const widthFraction =
      traceDurationNs === 0
        ? MIN_WIDTH_FRACTION
        : Math.max(MIN_WIDTH_FRACTION, e.durationNs / traceDurationNs);

    const childEnriched = childrenByParent.get(e.span.span_id) ?? [];
    childEnriched.sort((a, b) => a.startMs - b.startMs);
    const children = childEnriched.map((child) => buildNode(child, depth + 1));

    return {
      span: e.span,
      depth,
      offsetFraction,
      widthFraction,
      durationNs: e.durationNs,
      inFlight: e.inFlight,
      children,
    };
  };

  rootCandidates.sort((a, b) => a.startMs - b.startMs);
  const roots = rootCandidates.map((root) => buildNode(root, 0));

  return {
    roots,
    traceStartMs,
    traceDurationNs,
    traceDurationMs,
    originalSpanCount: spans.length,
    visibleSpanCount: spans.length,
  };
}

/**
 * Aplana el árbol en orden de visualización (DFS) — la UI renderea filas
 * lineales con `depth` para indentación. Se hace acá (y no en el componente)
 * para que sea testeable y deterministico. Si se pasa `collapsedIds`, se
 * omiten los descendientes de esos nodos.
 */
export function flattenTree(tree: TraceTree, collapsedIds?: Set<string>): SpanNode[] {
  const out: SpanNode[] = [];
  const walk = (node: SpanNode): void => {
    out.push(node);
    if (collapsedIds?.has(node.span.span_id) === true) return;
    for (const child of node.children) walk(child);
  };
  for (const root of tree.roots) walk(root);
  return out;
}

export interface WaterfallFilters {
  /** Si > 0, esconde spans cuya durationNs sea menor (reducir ruido). */
  minDurationMs: number;
  /** Si true, deja solo los spans con status_code === ERROR (2) y sus ancestros. */
  errorsOnly: boolean;
  /**
   * Toggle visual de "agrupar por kind". El árbol no se reordena (perderíamos
   * la cascada temporal); el flag está exclusivamente para que la toolbar
   * marque el toggle como activo. Reservado para uso futuro de la UI.
   */
  groupByKind: boolean;
}

export const DEFAULT_WATERFALL_FILTERS: WaterfallFilters = {
  minDurationMs: 0,
  errorsOnly: false,
  groupByKind: false,
};

/**
 * Aplica filtros al árbol devolviendo un árbol nuevo. Mantiene siempre
 * los ancestros de los nodos que pasan el filtro — sin esto perderíamos
 * el contexto jerárquico (ver el span de DB sin saber qué request lo
 * disparó). Operación pura: no muta el input.
 *
 * Solo cambia `visibleSpanCount` y `roots`. `originalSpanCount`,
 * `traceStartMs` y `traceDurationNs/Ms` reflejan siempre el trace original
 * — los offsetFraction/widthFraction de los nodos sobrevivientes siguen
 * siendo coherentes con la cascada original.
 */
export function applyFilters(tree: TraceTree, filters: WaterfallFilters): TraceTree {
  const minNs = Math.max(0, filters.minDurationMs) * NS_PER_MS;
  const filterErrors = filters.errorsOnly;

  if (minNs === 0 && !filterErrors) return tree;

  const keptIds = new Set<string>();

  const shouldKeep = (node: SpanNode): boolean =>
    !(filterErrors && node.span.status_code !== OTEL_STATUS_CODE_ERROR) && node.durationNs >= minNs;

  const visit = (node: SpanNode, ancestorChain: SpanNode[]): void => {
    if (shouldKeep(node)) {
      for (const a of ancestorChain) keptIds.add(a.span.span_id);
      keptIds.add(node.span.span_id);
    }
    const nextChain = [...ancestorChain, node];
    for (const child of node.children) visit(child, nextChain);
  };
  for (const root of tree.roots) visit(root, []);

  const clone = (node: SpanNode): SpanNode | null => {
    if (!keptIds.has(node.span.span_id)) return null;
    const children: SpanNode[] = [];
    for (const child of node.children) {
      const c = clone(child);
      if (c !== null) children.push(c);
    }
    return { ...node, children };
  };
  const newRoots: SpanNode[] = [];
  for (const root of tree.roots) {
    const c = clone(root);
    if (c !== null) newRoots.push(c);
  }
  return { ...tree, roots: newRoots, visibleSpanCount: keptIds.size };
}

/**
 * IDs de todos los nodos del árbol que tienen al menos un hijo. Se usa
 * para implementar "expandir/colapsar todo" sin re-recorrer el árbol en
 * el view.
 */
export function collectExpandableIds(tree: TraceTree): string[] {
  const out: string[] = [];
  const walk = (node: SpanNode): void => {
    if (node.children.length > 0) out.push(node.span.span_id);
    for (const child of node.children) walk(child);
  };
  for (const root of tree.roots) walk(root);
  return out;
}
