import { describe, expect, it } from 'vitest';

import { isOtelTraceId } from './request-id-format.js';

describe('isOtelTraceId', () => {
  it('reconoce OTel traceIds (32 hex sin guiones)', () => {
    expect(isOtelTraceId('9d5b62c3e41b0e751bc920c53a38f78b')).toBe(true);
    expect(isOtelTraceId('c477506249544f542a4db34e0f236ad8')).toBe(true);
    expect(isOtelTraceId('FF00FF00FF00FF00FF00FF00FF00FF00')).toBe(true);
  });

  it('rechaza UUIDs (con guiones, formato 8-4-4-4-12)', () => {
    expect(isOtelTraceId('e2438703-af44-4408-ba28-b5ad2cef3f41')).toBe(false);
    expect(isOtelTraceId('00000000-0000-0000-0000-000000000000')).toBe(false);
  });

  it('rechaza null/undefined/empty', () => {
    expect(isOtelTraceId(null)).toBe(false);
    expect(isOtelTraceId(undefined)).toBe(false);
    expect(isOtelTraceId('')).toBe(false);
  });

  it('rechaza largos distintos', () => {
    expect(isOtelTraceId('9d5b62c3')).toBe(false); // muy corto
    expect(isOtelTraceId('9d5b62c3e41b0e751bc920c53a38f78b' + 'extra')).toBe(false);
  });

  it('rechaza non-hex chars', () => {
    expect(isOtelTraceId('zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz')).toBe(false);
    expect(isOtelTraceId('test-MANUAL-1778279900')).toBe(false);
  });
});
