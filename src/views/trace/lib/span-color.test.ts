import { describe, expect, it } from 'vitest';

import type { SpanRecord } from '../../_shared/api.js';

import { OTEL_STATUS_CODE_ERROR } from './otel.js';
import { spanBarBackgroundColor, spanBarColor } from './span-color.js';

function makeSpan(partial: Partial<SpanRecord> = {}): SpanRecord {
  return {
    span_id: 's1',
    trace_id: 't1',
    parent_span_id: null,
    name: 'op',
    kind: null,
    start_time: '2026-01-01T00:00:00.000Z',
    end_time: null,
    duration_ns: null,
    status_code: null,
    status_message: null,
    service_name: null,
    tenant_id: null,
    request_id: null,
    attributes: null,
    resource: null,
    events: null,
    ...partial,
  };
}

describe('spanBarColor', () => {
  it('returns red for error status_code regardless of kind', () => {
    expect(spanBarColor(makeSpan({ status_code: OTEL_STATUS_CODE_ERROR, kind: 'SERVER' }))).toBe(
      'var(--red)'
    );
    expect(spanBarColor(makeSpan({ status_code: OTEL_STATUS_CODE_ERROR, kind: 'CLIENT' }))).toBe(
      'var(--red)'
    );
  });

  it('maps each kind to the documented token', () => {
    expect(spanBarColor(makeSpan({ kind: 'CLIENT' }))).toBe('var(--teal-deep)');
    expect(spanBarColor(makeSpan({ kind: 'SERVER' }))).toBe('var(--teal)');
    expect(spanBarColor(makeSpan({ kind: 'PRODUCER' }))).toBe('var(--gold)');
    expect(spanBarColor(makeSpan({ kind: 'CONSUMER' }))).toBe('var(--gold)');
  });

  it('falls back to neutral for INTERNAL or unknown kind', () => {
    expect(spanBarColor(makeSpan({ kind: 'INTERNAL' }))).toBe('var(--neutral-700)');
    expect(spanBarColor(makeSpan({ kind: null }))).toBe('var(--neutral-700)');
    expect(spanBarColor(makeSpan({ kind: 'WHATEVER' }))).toBe('var(--neutral-700)');
  });
});

describe('spanBarBackgroundColor', () => {
  it('returns red-soft for error spans', () => {
    expect(spanBarBackgroundColor(makeSpan({ status_code: OTEL_STATUS_CODE_ERROR }))).toBe(
      'var(--red-soft)'
    );
  });

  it('returns neutral-200 otherwise', () => {
    expect(spanBarBackgroundColor(makeSpan({ kind: 'SERVER' }))).toBe('var(--neutral-200)');
    expect(spanBarBackgroundColor(makeSpan({ status_code: 1 }))).toBe('var(--neutral-200)');
  });
});
