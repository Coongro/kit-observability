import { describe, expect, it } from 'vitest';
import { computeFingerprint } from './compute-fingerprint.js';

describe('computeFingerprint', () => {
  it('devuelve un sha1 hex (40 chars)', () => {
    const fp = computeFingerprint({ level: 40, source: 'app', message: 'hello' });
    expect(fp).toMatch(/^[0-9a-f]{40}$/);
  });

  it('mismo input ⇒ mismo fingerprint (determinismo)', () => {
    const a = computeFingerprint({ level: 40, source: 'app', message: 'hello' });
    const b = computeFingerprint({ level: 40, source: 'app', message: 'hello' });
    expect(a).toBe(b);
  });

  it('mensajes que normalizan al mismo valor → mismo fingerprint', () => {
    const a = computeFingerprint({
      level: 40,
      source: 'app',
      message: 'tenant 11111111-2222-3333-4444-555555555555 not found',
    });
    const b = computeFingerprint({
      level: 40,
      source: 'app',
      message: 'tenant aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee not found',
    });
    expect(a).toBe(b);
  });

  it('cambiar level → fingerprint distinto', () => {
    const a = computeFingerprint({ level: 30, source: 'app', message: 'x' });
    const b = computeFingerprint({ level: 40, source: 'app', message: 'x' });
    expect(a).not.toBe(b);
  });

  it('cambiar source → fingerprint distinto', () => {
    const a = computeFingerprint({ level: 40, source: 'app', message: 'x' });
    const b = computeFingerprint({ level: 40, source: 'plugin', message: 'x' });
    expect(a).not.toBe(b);
  });

  it('cambiar topFrame → fingerprint distinto', () => {
    const a = computeFingerprint({
      level: 40,
      source: 'app',
      message: 'x',
      topFrame: 'foo (a.ts:1)',
    });
    const b = computeFingerprint({
      level: 40,
      source: 'app',
      message: 'x',
      topFrame: 'foo (b.ts:2)',
    });
    expect(a).not.toBe(b);
  });

  it('topFrame undefined y null tratan igual (treated as empty)', () => {
    const a = computeFingerprint({ level: 40, source: 'app', message: 'x' });
    const b = computeFingerprint({ level: 40, source: 'app', message: 'x', topFrame: null });
    expect(a).toBe(b);
  });
});
