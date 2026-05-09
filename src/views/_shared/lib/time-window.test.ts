import { describe, expect, it } from 'vitest';

import { computeWindow } from './time-window.js';

describe('computeWindow', () => {
  it('arma una ventana simétrica en ms', () => {
    const w = computeWindow('2026-05-07T01:20:59.000Z', 60_000);
    expect(w).toEqual({
      from: '2026-05-07T01:19:59.000Z',
      to: '2026-05-07T01:21:59.000Z',
    });
  });

  it('usa default 2min cuando no se pasa margin', () => {
    const w = computeWindow('2026-05-07T01:20:59.000Z');
    expect(w).not.toBeNull();
    if (w === null) return;
    const fromMs = Date.parse(w.from);
    const toMs = Date.parse(w.to);
    expect(toMs - fromMs).toBe(4 * 60 * 1000);
  });

  it('clamp margin negativo a 0', () => {
    const w = computeWindow('2026-05-07T01:20:59.000Z', -1000);
    expect(w).toEqual({
      from: '2026-05-07T01:20:59.000Z',
      to: '2026-05-07T01:20:59.000Z',
    });
  });

  it('devuelve null para input inválido', () => {
    expect(computeWindow(null)).toBeNull();
    expect(computeWindow(undefined)).toBeNull();
    expect(computeWindow('not-a-date')).toBeNull();
    expect(computeWindow('')).toBeNull();
  });
});
