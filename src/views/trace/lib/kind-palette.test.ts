import { describe, expect, it } from 'vitest';

import type { SpanRecord } from '../../_shared/api.js';

import { displayKind, KIND_COLOR, spanBarColor } from './kind-palette.js';
import { OTEL_STATUS_CODE_ERROR } from './otel.js';

function makeSpan(overrides: Partial<SpanRecord> = {}): SpanRecord {
  return {
    span_id: 's',
    trace_id: 't',
    parent_span_id: null,
    name: 'op',
    kind: null,
    start_time: '2026-05-05T00:00:00Z',
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
    ...overrides,
  };
}

describe('displayKind', () => {
  it('mapea SERVER → server', () => {
    expect(displayKind(makeSpan({ kind: 'SERVER' }))).toBe('server');
  });
  it('mapea CLIENT → client', () => {
    expect(displayKind(makeSpan({ kind: 'CLIENT' }))).toBe('client');
  });
  it('attributes db.system tiene prioridad sobre kind', () => {
    expect(
      displayKind(makeSpan({ kind: 'CLIENT', attributes: { 'db.system': 'postgresql' } }))
    ).toBe('db');
  });
  it('INTERNAL/PRODUCER/CONSUMER caen a internal', () => {
    expect(displayKind(makeSpan({ kind: 'INTERNAL' }))).toBe('internal');
    expect(displayKind(makeSpan({ kind: 'PRODUCER' }))).toBe('internal');
    expect(displayKind(makeSpan({ kind: 'CONSUMER' }))).toBe('internal');
  });
  it('kind null cae a internal', () => {
    expect(displayKind(makeSpan({ kind: null }))).toBe('internal');
  });
});

describe('spanBarColor', () => {
  it('error gana sobre kind', () => {
    expect(spanBarColor(makeSpan({ kind: 'SERVER', status_code: OTEL_STATUS_CODE_ERROR }))).toBe(
      'var(--red)'
    );
  });
  it('SERVER → teal', () => {
    expect(spanBarColor(makeSpan({ kind: 'SERVER' }))).toBe(KIND_COLOR.server.fill);
  });
  it('db.system → gold-dk', () => {
    expect(spanBarColor(makeSpan({ attributes: { 'db.system': 'postgresql' } }))).toBe(
      KIND_COLOR.db.fill
    );
  });
});
