import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { FailsafeWriter } from './failsafe-writer.js';
import { SinkBase, type SinkBaseOptions } from './sink-base.js';

/**
 * Concrete subclass usado solo para testing de SinkBase.
 * `onFlush` permite controlar el comportamiento de flushBatch desde el test
 * (resolver, rechazar, contar invocaciones).
 */
class TestSink extends SinkBase<string> {
  flushed: string[][] = [];

  constructor(
    options: Omit<SinkBaseOptions, 'id'>,
    private onFlush: (batch: readonly string[]) => Promise<void> = () => Promise.resolve(),
    private syncOn?: (entry: string) => boolean
  ) {
    super({ ...options, id: 'test-sink' });
  }

  protected override shouldFlushSync(entry: string): boolean {
    return this.syncOn?.(entry) ?? false;
  }

  protected serializeForFailsafe(entry: string): string {
    return entry;
  }

  protected async flushBatch(batch: readonly string[]): Promise<void> {
    await this.onFlush(batch);
    this.flushed.push([...batch]);
  }
}

class RecordingFailsafe implements FailsafeWriter {
  lines: string[] = [];
  closed = false;
  shouldThrow = false;

  write(line: string): void {
    if (this.shouldThrow) throw new Error('failsafe disk full');
    this.lines.push(line);
  }

  close(): void {
    this.closed = true;
  }
}

const baseOpts = (
  overrides: Partial<Omit<SinkBaseOptions, 'id'>> = {}
): Omit<SinkBaseOptions, 'id'> => ({
  batchSize: 10,
  batchIntervalMs: 100,
  failsafe: null,
  ...overrides,
});

describe('SinkBase', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('batching', () => {
    it('flushea cuando se alcanza batchSize', async () => {
      const sink = new TestSink(baseOpts({ batchSize: 3 }));
      sink.enqueue('a');
      sink.enqueue('b');
      expect(sink.flushed).toHaveLength(0);

      sink.enqueue('c');
      await vi.runAllTimersAsync();
      // dejar microtasks resolverse
      await Promise.resolve();
      expect(sink.flushed).toEqual([['a', 'b', 'c']]);
    });

    it('flushea cuando expira el timer aunque no se alcance batchSize', async () => {
      const sink = new TestSink(baseOpts({ batchSize: 100, batchIntervalMs: 50 }));
      sink.enqueue('only-one');
      expect(sink.flushed).toHaveLength(0);

      await vi.advanceTimersByTimeAsync(50);
      expect(sink.flushed).toEqual([['only-one']]);
    });

    it('múltiples flushes consecutivos: cada uno toma su propio batch', async () => {
      const sink = new TestSink(baseOpts({ batchSize: 2 }));
      sink.enqueue('a');
      sink.enqueue('b'); // dispara flush 1
      sink.enqueue('c');
      sink.enqueue('d'); // dispara flush 2

      await vi.runAllTimersAsync();
      await Promise.resolve();
      await Promise.resolve();
      expect(sink.flushed).toEqual([
        ['a', 'b'],
        ['c', 'd'],
      ]);
    });

    it('flushNow() drainea el queue actual (sin esperar batch ni timer)', async () => {
      const sink = new TestSink(baseOpts({ batchSize: 100, batchIntervalMs: 10000 }));
      sink.enqueue('x');
      sink.enqueue('y');
      await sink.flushNow();
      expect(sink.flushed).toEqual([['x', 'y']]);
    });

    it('flushNow() con queue vacío es no-op', async () => {
      const sink = new TestSink(baseOpts());
      await sink.flushNow();
      expect(sink.flushed).toHaveLength(0);
    });
  });

  describe('flush sync via shouldFlushSync', () => {
    it('una entry que dispara shouldFlushSync flushea inmediatamente', async () => {
      const sink = new TestSink(
        baseOpts({ batchSize: 100 }),
        () => Promise.resolve(),
        (e) => e === 'PANIC'
      );
      sink.enqueue('normal');
      sink.enqueue('PANIC');
      await vi.runAllTimersAsync();
      await Promise.resolve();
      expect(sink.flushed).toEqual([['normal', 'PANIC']]);
    });
  });

  describe('fail-safe behavior', () => {
    it('cuando flushBatch rechaza, el batch va al failsafe writer', async () => {
      const failsafe = new RecordingFailsafe();
      const sink = new TestSink(baseOpts({ batchSize: 2, failsafe }), () =>
        Promise.reject(new Error('db down'))
      );
      // silenciamos console.error que SinkBase emite en el path de error
      vi.spyOn(console, 'error').mockImplementation(() => {});

      sink.enqueue('a');
      sink.enqueue('b');
      await vi.runAllTimersAsync();
      await Promise.resolve();
      await Promise.resolve();

      expect(failsafe.lines).toEqual(['a', 'b']);
      const h = sink.getHealth();
      expect(h.insertFailures).toBe(1);
      expect(h.divertedToFailsafe).toBe(2);
      expect(h.permanentlyLost).toBe(0);
      expect(h.failsafeWriteErrors).toBe(0);
    });

    it('si no hay failsafe configurado y flushBatch rechaza, los entries se cuentan como permanentlyLost', async () => {
      const sink = new TestSink(baseOpts({ batchSize: 1, failsafe: null }), () =>
        Promise.reject(new Error('db down'))
      );
      vi.spyOn(console, 'error').mockImplementation(() => {});

      sink.enqueue('a');
      await vi.runAllTimersAsync();
      await Promise.resolve();
      await Promise.resolve();

      const h = sink.getHealth();
      expect(h.insertFailures).toBe(1);
      expect(h.divertedToFailsafe).toBe(0);
      expect(h.permanentlyLost).toBe(1);
    });

    it('si el failsafe writer tira, los entries van a permanentlyLost + failsafeWriteErrors', async () => {
      const failsafe = new RecordingFailsafe();
      failsafe.shouldThrow = true;
      const sink = new TestSink(baseOpts({ batchSize: 2, failsafe }), () =>
        Promise.reject(new Error('db down'))
      );
      vi.spyOn(console, 'error').mockImplementation(() => {});

      sink.enqueue('a');
      sink.enqueue('b');
      await vi.runAllTimersAsync();
      await Promise.resolve();
      await Promise.resolve();

      const h = sink.getHealth();
      expect(h.insertFailures).toBe(1);
      expect(h.divertedToFailsafe).toBe(0);
      expect(h.permanentlyLost).toBe(2);
      expect(h.failsafeWriteErrors).toBe(2);
    });
  });

  describe('post-close behavior', () => {
    it('enqueue post-close va al fail-safe en vez de descartar silenciosamente', async () => {
      const failsafe = new RecordingFailsafe();
      const sink = new TestSink(baseOpts({ failsafe }));
      await sink.close();

      sink.enqueue('post-close');
      expect(failsafe.lines).toEqual(['post-close']);
      expect(sink.getHealth().divertedToFailsafe).toBe(1);
      expect(sink.getHealth().permanentlyLost).toBe(0);
    });

    it('enqueue post-close sin failsafe se cuenta como permanentlyLost', async () => {
      const sink = new TestSink(baseOpts({ failsafe: null }));
      await sink.close();

      sink.enqueue('lost');
      expect(sink.getHealth().permanentlyLost).toBe(1);
    });
  });

  describe('getHealth', () => {
    it('reporta todos los counters', async () => {
      const sink = new TestSink(baseOpts({ batchSize: 100, batchIntervalMs: 10000 }));
      sink.enqueue('a');
      sink.enqueue('b');
      let h = sink.getHealth();
      expect(h.queueLag).toBe(2);
      expect(h.insertFailures).toBe(0);
      expect(h.lastFlushAt).toBeNull();
      expect(h.divertedToFailsafe).toBe(0);
      expect(h.permanentlyLost).toBe(0);
      expect(h.failsafeWriteErrors).toBe(0);

      await sink.flushNow();
      h = sink.getHealth();
      expect(h.queueLag).toBe(0);
      expect(h.lastFlushAt).not.toBeNull();
      expect(h.lastFlushAt).toMatch(/^\d{4}-\d{2}-\d{2}T/); // ISO
    });
  });

  describe('constructor validation', () => {
    it('throwa si batchSize < 1', () => {
      expect(() => new TestSink(baseOpts({ batchSize: 0 }))).toThrow(/batchSize/);
    });
    it('throwa si batchIntervalMs < 1', () => {
      expect(() => new TestSink(baseOpts({ batchIntervalMs: 0 }))).toThrow(/batchIntervalMs/);
    });
  });

  describe('close', () => {
    it('drainea el queue final', async () => {
      const sink = new TestSink(baseOpts({ batchSize: 100, batchIntervalMs: 10000 }));
      sink.enqueue('drain-me');
      await sink.close();
      expect(sink.flushed).toEqual([['drain-me']]);
    });

    it('cierra el failsafe writer', async () => {
      const failsafe = new RecordingFailsafe();
      const sink = new TestSink(baseOpts({ failsafe }));
      await sink.close();
      expect(failsafe.closed).toBe(true);
    });

    it('idempotente: llamar close() dos veces no rompe', async () => {
      const sink = new TestSink(baseOpts());
      await sink.close();
      await expect(sink.close()).resolves.not.toThrow();
    });

    it('después de close() los enqueue son no-op', async () => {
      const sink = new TestSink(baseOpts());
      await sink.close();
      sink.enqueue('ignored');
      await vi.runAllTimersAsync();
      expect(sink.flushed).toHaveLength(0);
    });
  });
});
