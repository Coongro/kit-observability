import { describe, expect, it } from 'vitest';

import type { SpanRecord } from '../../_shared/api.js';

import { applyFilters, buildTraceTree, collectExpandableIds, flattenTree } from './build-tree.js';

function makeSpan(
  partial: Partial<SpanRecord> & { span_id: string; start_time: string }
): SpanRecord {
  return {
    span_id: partial.span_id,
    trace_id: 'trace-1',
    parent_span_id: partial.parent_span_id ?? null,
    name: partial.name ?? 'op',
    kind: partial.kind ?? null,
    start_time: partial.start_time,
    end_time: partial.end_time ?? null,
    duration_ns: partial.duration_ns ?? null,
    status_code: partial.status_code ?? null,
    status_message: partial.status_message ?? null,
    service_name: partial.service_name ?? null,
    tenant_id: partial.tenant_id ?? null,
    request_id: partial.request_id ?? null,
    attributes: partial.attributes ?? null,
    resource: partial.resource ?? null,
    events: partial.events ?? null,
  };
}

describe('buildTraceTree', () => {
  it('returns empty tree for empty input', () => {
    const tree = buildTraceTree([]);
    expect(tree.roots).toEqual([]);
    expect(tree.originalSpanCount).toBe(0);
    expect(tree.visibleSpanCount).toBe(0);
    expect(tree.traceDurationMs).toBe(0);
  });

  it('builds a single-root linear tree with correct depths', () => {
    const spans = [
      makeSpan({ span_id: 'a', start_time: '2026-01-01T00:00:00.000Z', duration_ns: '100000000' }),
      makeSpan({
        span_id: 'b',
        parent_span_id: 'a',
        start_time: '2026-01-01T00:00:00.020Z',
        duration_ns: '50000000',
      }),
      makeSpan({
        span_id: 'c',
        parent_span_id: 'b',
        start_time: '2026-01-01T00:00:00.040Z',
        duration_ns: '10000000',
      }),
    ];
    const tree = buildTraceTree(spans);
    expect(tree.roots).toHaveLength(1);
    expect(tree.roots[0].span.span_id).toBe('a');
    expect(tree.roots[0].depth).toBe(0);
    expect(tree.roots[0].children[0].depth).toBe(1);
    expect(tree.roots[0].children[0].children[0].depth).toBe(2);
  });

  it('promotes orphan spans (parent missing from input) to root', () => {
    const spans = [
      makeSpan({
        span_id: 'orphan',
        parent_span_id: 'not-in-input',
        start_time: '2026-01-01T00:00:00.000Z',
        duration_ns: '10000000',
      }),
    ];
    const tree = buildTraceTree(spans);
    expect(tree.roots).toHaveLength(1);
    expect(tree.roots[0].span.span_id).toBe('orphan');
  });

  it('uses end_time fallback when duration_ns is null', () => {
    const spans = [
      makeSpan({
        span_id: 'a',
        start_time: '2026-01-01T00:00:00.000Z',
        end_time: '2026-01-01T00:00:00.100Z',
        duration_ns: null,
      }),
    ];
    const tree = buildTraceTree(spans);
    expect(tree.roots[0].durationNs).toBe(100_000_000);
    expect(tree.roots[0].inFlight).toBe(false);
  });

  it('marks spans without end_time as in-flight with zero duration', () => {
    const spans = [
      makeSpan({
        span_id: 'a',
        start_time: '2026-01-01T00:00:00.000Z',
        end_time: null,
        duration_ns: null,
      }),
    ];
    const tree = buildTraceTree(spans);
    expect(tree.roots[0].inFlight).toBe(true);
    expect(tree.roots[0].durationNs).toBe(0);
  });

  it('computes offset and width fractions relative to trace bounds', () => {
    const spans = [
      makeSpan({ span_id: 'a', start_time: '2026-01-01T00:00:00.000Z', duration_ns: '100000000' }),
      makeSpan({
        span_id: 'b',
        parent_span_id: 'a',
        start_time: '2026-01-01T00:00:00.050Z',
        duration_ns: '25000000',
      }),
    ];
    const tree = buildTraceTree(spans);
    const a = tree.roots[0];
    const b = a.children[0];
    expect(a.offsetFraction).toBeCloseTo(0, 4);
    expect(a.widthFraction).toBeCloseTo(1, 4);
    expect(b.offsetFraction).toBeCloseTo(0.5, 2);
    expect(b.widthFraction).toBeCloseTo(0.25, 2);
  });

  it('enforces minimum width fraction so zero-duration spans are still visible', () => {
    const spans = [
      makeSpan({ span_id: 'a', start_time: '2026-01-01T00:00:00.000Z', duration_ns: '100000000' }),
      makeSpan({
        span_id: 'b',
        parent_span_id: 'a',
        start_time: '2026-01-01T00:00:00.000Z',
        duration_ns: '0',
      }),
    ];
    const tree = buildTraceTree(spans);
    expect(tree.roots[0].children[0].widthFraction).toBeGreaterThan(0);
  });
});

describe('applyFilters', () => {
  const buildSample = () =>
    buildTraceTree([
      makeSpan({ span_id: 'a', start_time: '2026-01-01T00:00:00.000Z', duration_ns: '100000000' }),
      makeSpan({
        span_id: 'b',
        parent_span_id: 'a',
        start_time: '2026-01-01T00:00:00.010Z',
        duration_ns: '500000', // 0.5 ms
      }),
      makeSpan({
        span_id: 'c',
        parent_span_id: 'a',
        start_time: '2026-01-01T00:00:00.020Z',
        duration_ns: '20000000', // 20 ms
        status_code: 2,
      }),
    ]);

  it('returns the original tree when no filters are active', () => {
    const tree = buildSample();
    const filtered = applyFilters(tree, { minDurationMs: 0, errorsOnly: false });
    expect(filtered).toBe(tree);
  });

  it('drops spans below minDurationMs but keeps their ancestors', () => {
    const tree = buildSample();
    const filtered = applyFilters(tree, { minDurationMs: 1, errorsOnly: false });
    const ids = flattenTree(filtered).map((n) => n.span.span_id);
    expect(ids).toContain('a');
    expect(ids).not.toContain('b');
    expect(ids).toContain('c');
  });

  it('keeps only error spans (and their ancestors) when errorsOnly is true', () => {
    const tree = buildSample();
    const filtered = applyFilters(tree, { minDurationMs: 0, errorsOnly: true });
    const ids = flattenTree(filtered).map((n) => n.span.span_id);
    expect(ids).toEqual(['a', 'c']);
  });

  it('preserves originalSpanCount and only updates visibleSpanCount', () => {
    const tree = buildSample();
    expect(tree.originalSpanCount).toBe(3);
    expect(tree.visibleSpanCount).toBe(3);
    const filtered = applyFilters(tree, { minDurationMs: 1, errorsOnly: false });
    expect(filtered.originalSpanCount).toBe(3);
    expect(filtered.visibleSpanCount).toBe(2);
  });

  it('sorts children locally by start_time even if input is shuffled', () => {
    const tree = buildTraceTree([
      makeSpan({
        span_id: 'a',
        start_time: '2026-01-01T00:00:00.000Z',
        duration_ns: '100000000',
      }),
      makeSpan({
        span_id: 'late',
        parent_span_id: 'a',
        start_time: '2026-01-01T00:00:00.030Z',
        duration_ns: '5000000',
      }),
      makeSpan({
        span_id: 'early',
        parent_span_id: 'a',
        start_time: '2026-01-01T00:00:00.010Z',
        duration_ns: '5000000',
      }),
    ]);
    expect(tree.roots[0].children.map((c) => c.span.span_id)).toEqual(['early', 'late']);
  });
});

describe('collectExpandableIds', () => {
  it('returns ids of nodes with children', () => {
    const tree = buildTraceTree([
      makeSpan({ span_id: 'a', start_time: '2026-01-01T00:00:00.000Z', duration_ns: '100000000' }),
      makeSpan({
        span_id: 'b',
        parent_span_id: 'a',
        start_time: '2026-01-01T00:00:00.010Z',
        duration_ns: '5000000',
      }),
    ]);
    expect(collectExpandableIds(tree)).toEqual(['a']);
  });
});

describe('flattenTree with collapsedIds', () => {
  it('skips children of collapsed nodes', () => {
    const tree = buildTraceTree([
      makeSpan({ span_id: 'a', start_time: '2026-01-01T00:00:00.000Z', duration_ns: '100000000' }),
      makeSpan({
        span_id: 'b',
        parent_span_id: 'a',
        start_time: '2026-01-01T00:00:00.010Z',
        duration_ns: '5000000',
      }),
    ]);
    const ids = flattenTree(tree, new Set(['a'])).map((n) => n.span.span_id);
    expect(ids).toEqual(['a']);
  });
});

describe('flattenTree', () => {
  it('returns spans in DFS order matching depth-first traversal', () => {
    const spans = [
      makeSpan({ span_id: 'a', start_time: '2026-01-01T00:00:00.000Z', duration_ns: '100000000' }),
      makeSpan({
        span_id: 'b',
        parent_span_id: 'a',
        start_time: '2026-01-01T00:00:00.010Z',
        duration_ns: '20000000',
      }),
      makeSpan({
        span_id: 'c',
        parent_span_id: 'a',
        start_time: '2026-01-01T00:00:00.030Z',
        duration_ns: '20000000',
      }),
      makeSpan({
        span_id: 'b1',
        parent_span_id: 'b',
        start_time: '2026-01-01T00:00:00.012Z',
        duration_ns: '5000000',
      }),
    ];
    const tree = buildTraceTree(spans);
    const flat = flattenTree(tree);
    expect(flat.map((n) => n.span.span_id)).toEqual(['a', 'b', 'b1', 'c']);
  });
});
