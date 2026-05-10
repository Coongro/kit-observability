import { describe, expect, it, vi } from 'vitest';

import { parseStackFromError } from './parse-stack.js';

/**
 * Cubre el regex parser de stacks V8 — históricamente bug-prone porque las
 * variantes (anonymous, eval, native) y los formatos por runtime (Node vs
 * navegador vs runtimes raros) cambian. El parser tiene que sobrevivir a
 * input desconocido sin tirar y, cuando hay un stack que no matchea,
 * loggear para no perder información en silencio.
 */
describe('parseStackFromError', () => {
  it('devuelve null si error es null/undefined/no-objeto', () => {
    expect(parseStackFromError(null)).toBeNull();
    expect(parseStackFromError(undefined)).toBeNull();
    expect(parseStackFromError('not an object')).toBeNull();
    expect(parseStackFromError(42)).toBeNull();
  });

  it('parsea frames `at fn (file:line:col)` (formato V8 estándar)', () => {
    const frames = parseStackFromError({
      stack: [
        'TypeError: oops',
        '    at AfipClient.fetchInvoice (src/client.ts:142:18)',
        '    at BillingService.emit (src/service.ts:87:4)',
      ].join('\n'),
    });
    expect(frames).toEqual([
      { fn: 'AfipClient.fetchInvoice', file: 'src/client.ts', line: 142, col: 18, app: true },
      { fn: 'BillingService.emit', file: 'src/service.ts', line: 87, col: 4, app: true },
    ]);
  });

  it('marca frames de node_modules como app=false', () => {
    const frames = parseStackFromError({
      stack: [
        'Error: x',
        '    at Worker.process (src/queue/worker.ts:220:9)',
        '    at tx.run (node_modules/@coongro/db/tx.js:41:12)',
      ].join('\n'),
    });
    expect(frames).toHaveLength(2);
    expect(frames?.[0].app).toBe(true);
    expect(frames?.[1].app).toBe(false);
  });

  it('marca frames de node:internal como app=false', () => {
    const frames = parseStackFromError({
      stack: ['Error: x', '    at Promise.all (node:internal/promise:0:0)'].join('\n'),
    });
    expect(frames?.[0].file).toBe('node:internal/promise');
    expect(frames?.[0].app).toBe(false);
  });

  it('acepta frames sin función nombrada (`at file:line:col`)', () => {
    // Variante donde no hay nombre de función — el regex secundario aplica.
    const frames = parseStackFromError({
      stack: ['Error', '    at /app/src/anonymous.ts:5:10'].join('\n'),
    });
    expect(frames).toEqual([
      { fn: '/app/src/anonymous.ts', file: '<anonymous>', line: 5, col: 10, app: true },
    ]);
  });

  it('prefiere `error.frames` ya parseado si está presente y es válido', () => {
    const frames = parseStackFromError({
      frames: [{ fn: 'foo', file: 'a.ts', line: 1, col: 1, app: true }],
    });
    expect(frames).toEqual([{ fn: 'foo', file: 'a.ts', line: 1, col: 1, app: true }]);
  });

  it('filtra entries inválidos en `error.frames` (no se cuela basura)', () => {
    const frames = parseStackFromError({
      frames: [
        { fn: 'foo', file: 'a.ts', line: 1, col: 1, app: true },
        { fn: 'bad' }, // inválido — falta file/line/col/app
        null,
      ],
    });
    expect(frames).toEqual([{ fn: 'foo', file: 'a.ts', line: 1, col: 1, app: true }]);
  });

  it('devuelve null si el stack no es string ni hay frames', () => {
    expect(parseStackFromError({ stack: 42 })).toBeNull();
    expect(parseStackFromError({})).toBeNull();
  });

  it('loggea warning cuando hay stack string pero ningún frame matcheó (formato desconocido)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const result = parseStackFromError({
      stack: 'WeirdRuntimeError\n  > some.unknown.format()\n  > foo[42]',
    });
    expect(result).toBeNull();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('parseStackFromError'),
      expect.any(String)
    );
    warn.mockRestore();
  });

  it('NO loggea warning si el stack es vacío (legítimo "sin stack")', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const result = parseStackFromError({ stack: '' });
    expect(result).toBeNull();
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
