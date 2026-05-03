import type { FailsafeWriter } from './failsafe-writer.js';

export interface SinkHealth {
  /** Cantidad de entries actualmente en cola esperando flush. */
  queueLag: number;
  /** Acumulado de fallos de flush (cada batch fallido cuenta 1). */
  insertFailures: number;
  /** ISO timestamp del último flush exitoso, o null si nunca hubo. */
  lastFlushAt: string | null;
  /** Acumulado de entries que terminaron en el archivo fail-safe. */
  lostInFailsafe: number;
}

export interface SinkBaseOptions {
  /** ID del sink — usado para logging y para identificarlo en el registry. */
  id: string;
  /** Tamaño del buffer antes de flush automático. */
  batchSize: number;
  /** Intervalo en ms entre flushes automáticos del buffer. */
  batchIntervalMs: number;
  /**
   * Writer del fail-safe. `null` lo deshabilita (útil en tests donde
   * confirmamos que el flush principal recibe el batch sin escribir disco).
   */
  failsafe: FailsafeWriter | null;
}

/**
 * Buffer + batch + retry + fail-safe + health para sinks de observability.
 *
 * Implementa los 5 robustness requirements (HTML spec sec. 11/9):
 *   1. Buffer + batch insert (configurable: batchSize, batchIntervalMs).
 *   2. Flush sincrónico para entries específicas (override `shouldFlushSync`).
 *   3. Pool dedicado: NO se maneja acá — la subclase recibe el `Sql` del
 *      `systemDatabase` del plugin, que ya viene con pool dedicado por diseño.
 *   4. Fail-safe a archivo local cuando el flush a DB falla.
 *   5. Health check via `getHealth()`.
 *
 * Diseñado como base abstracta para que SpanSink (COONG-143/G2) la extienda
 * implementando solo `flushBatch()` y `serializeForFailsafe()`.
 */
export abstract class SinkBase<T> {
  protected readonly id: string;
  private readonly batchSize: number;
  private readonly batchIntervalMs: number;
  private readonly failsafe: FailsafeWriter | null;

  private queue: T[] = [];
  private timer: NodeJS.Timeout | null = null;
  private closed = false;

  private insertFailures = 0;
  private lastFlushAt: string | null = null;
  private lostInFailsafe = 0;

  constructor(options: SinkBaseOptions) {
    this.id = options.id;
    this.batchSize = options.batchSize;
    this.batchIntervalMs = options.batchIntervalMs;
    this.failsafe = options.failsafe;
  }

  /**
   * Implementado por la subclase: hace la escritura real (ej: bulk INSERT).
   * Si rechaza la promise, SinkBase escribe el batch al fail-safe y bumpea
   * `insertFailures`.
   */
  protected abstract flushBatch(batch: readonly T[]): Promise<void>;

  /**
   * Implementado por la subclase: serializa una entry a 1 línea para el
   * fail-safe. Generalmente JSON.stringify(entry).
   */
  protected abstract serializeForFailsafe(entry: T): string;

  /**
   * Override opcional: decide si una entry específica debe flushear sincrónicamente
   * (no esperar batch ni timer). Default: nunca.
   * En DBSink el override es `entry.level >= LogLevel.ERROR`.
   */
  protected shouldFlushSync(_entry: T): boolean {
    return false;
  }

  /**
   * Encola una entry. Dispara flush si:
   *   - shouldFlushSync(entry) → true, o
   *   - el buffer alcanzó batchSize.
   * Sino arranca/mantiene el timer de batch interval.
   */
  enqueue(entry: T): void {
    if (this.closed) return;
    this.queue.push(entry);

    if (this.shouldFlushSync(entry)) {
      void this.flushNow();
      return;
    }
    if (this.queue.length >= this.batchSize) {
      void this.flushNow();
      return;
    }
    this.startTimer();
  }

  /**
   * Flush inmediato del buffer actual. Concurrent flushes están permitidos:
   * cada uno toma su batch del queue y los procesa en su propia conexión del
   * pool. Esto evita stampedes de flush sincrónico bajo bursts de errores.
   */
  async flushNow(): Promise<void> {
    if (this.queue.length === 0) return;
    const batch = this.queue;
    this.queue = [];
    this.stopTimer();
    await this.executeFlush(batch);
  }

  private async executeFlush(batch: readonly T[]): Promise<void> {
    try {
      await this.flushBatch(batch);
      this.lastFlushAt = new Date().toISOString();
    } catch (err) {
      this.insertFailures += 1;
      this.divertToFailsafe(batch, err);
    }
  }

  private divertToFailsafe(batch: readonly T[], err: unknown): void {
    if (this.failsafe === null) {
      // eslint-disable-next-line no-console
      console.error(
        `[kit-observability] sink "${this.id}" flush failed and fail-safe is disabled, ${batch.length} entries lost`,
        err
      );
      return;
    }
    let writtenToFailsafe = 0;
    for (const entry of batch) {
      try {
        this.failsafe.write(this.serializeForFailsafe(entry));
        writtenToFailsafe += 1;
      } catch {
        // Último recurso — no podemos hacer más. Los siguientes entries del batch
        // tampoco se van a poder escribir, pero seguimos intentando para que el
        // error reportado abajo refleje el estado correcto.
      }
    }
    this.lostInFailsafe += writtenToFailsafe;
    // eslint-disable-next-line no-console
    console.error(
      `[kit-observability] sink "${this.id}" flush failed, ${writtenToFailsafe}/${batch.length} entries written to fail-safe`,
      err
    );
  }

  private startTimer(): void {
    if (this.timer !== null || this.closed) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flushNow();
    }, this.batchIntervalMs);
  }

  private stopTimer(): void {
    if (this.timer === null) return;
    clearTimeout(this.timer);
    this.timer = null;
  }

  getHealth(): SinkHealth {
    return {
      queueLag: this.queue.length,
      insertFailures: this.insertFailures,
      lastFlushAt: this.lastFlushAt,
      lostInFailsafe: this.lostInFailsafe,
    };
  }

  /**
   * Cierra el sink. Drainea la cola con un flush final, detiene el timer y
   * cierra el fail-safe writer. Idempotente.
   */
  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    this.stopTimer();
    await this.flushNow();
    if (this.failsafe !== null) {
      this.failsafe.close();
    }
  }
}
