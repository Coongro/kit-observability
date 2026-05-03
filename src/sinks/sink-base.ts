import type { FailsafeWriter } from './failsafe-writer.js';

export interface SinkHealth {
  /** Cantidad de entries actualmente en cola esperando flush. */
  queueLag: number;
  /** Acumulado de fallos de flush a destino principal (cada batch fallido cuenta 1). */
  insertFailures: number;
  /** ISO timestamp del último flush exitoso, o null si nunca hubo. */
  lastFlushAt: string | null;
  /** Acumulado de entries que el flush principal falló y SÍ pudieron escribirse al fail-safe. */
  divertedToFailsafe: number;
  /**
   * Acumulado de entries genuinamente perdidos: el flush principal falló Y el fail-safe
   * tampoco pudo escribirlos (disco lleno, permisos), o el sink estaba cerrado al
   * recibir la entry. Cualquier valor > 0 acá es señal de pérdida real de data.
   */
  permanentlyLost: number;
  /** Acumulado de errores del fail-safe writer (disco lleno, permisos, fs.appendFileSync throws). */
  failsafeWriteErrors: number;
}

export interface SinkBaseOptions {
  /** ID del sink — usado para logging y para identificarlo en el registry. */
  id: string;
  /** Tamaño del buffer antes de flush automático. Debe ser >= 1. */
  batchSize: number;
  /** Intervalo en ms entre flushes automáticos del buffer. Debe ser >= 1. */
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
 * Implementa los 5 robustness requirements de la spec:
 *   1. Buffer + batch insert (configurable: batchSize, batchIntervalMs).
 *   2. Flush sincrónico para entries específicas (override `shouldFlushSync`).
 *   3. Pool dedicado: NO se maneja acá — la subclase recibe el `Sql` del
 *      `systemDatabase` del plugin, que ya viene con pool dedicado por diseño.
 *   4. Fail-safe a archivo local cuando el flush a DB falla.
 *   5. Health check via `getHealth()`.
 *
 * Diseñado como base abstracta para que SpanSink (COONG-143) la extienda
 * implementando solo `flushBatch()`, `serializeForFailsafe()` y opcionalmente
 * `shouldFlushSync()`.
 *
 * Concurrencia: `enqueue()` puede disparar `flushNow()` mientras otro flush
 * está en vuelo. Cada flush toma su batch del queue y procesa independiente
 * en su propia conexión del pool. Para que `close()` no pierda data,
 * trackeamos las promises in-flight y las awaiteamos al cerrar.
 */
export abstract class SinkBase<T> {
  protected readonly id: string;
  private readonly batchSize: number;
  private readonly batchIntervalMs: number;
  private readonly failsafe: FailsafeWriter | null;

  private queue: T[] = [];
  private timer: NodeJS.Timeout | null = null;
  private closed = false;
  private readonly inFlight = new Set<Promise<void>>();

  private insertFailures = 0;
  private lastFlushAt: string | null = null;
  private divertedToFailsafe = 0;
  private permanentlyLost = 0;
  private failsafeWriteErrors = 0;

  constructor(options: SinkBaseOptions) {
    if (!Number.isFinite(options.batchSize) || options.batchSize < 1) {
      throw new Error(
        `[kit-observability] SinkBase: batchSize must be >= 1, got ${options.batchSize}`
      );
    }
    if (!Number.isFinite(options.batchIntervalMs) || options.batchIntervalMs < 1) {
      throw new Error(
        `[kit-observability] SinkBase: batchIntervalMs must be >= 1, got ${options.batchIntervalMs}`
      );
    }
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
   *
   * Post-close, las entries se intentan escribir al fail-safe directamente
   * (en vez de descartarlas silenciosamente). Si tampoco hay failsafe, se
   * cuentan como `permanentlyLost`.
   */
  enqueue(entry: T): void {
    if (this.closed) {
      this.handlePostCloseEntry(entry);
      return;
    }
    this.queue.push(entry);

    if (this.shouldFlushSync(entry) || this.queue.length >= this.batchSize) {
      void this.flushNow();
      return;
    }
    this.startTimer();
  }

  private handlePostCloseEntry(entry: T): void {
    if (this.failsafe === null) {
      this.permanentlyLost += 1;
      return;
    }
    try {
      this.failsafe.write(this.serializeForFailsafe(entry));
      this.divertedToFailsafe += 1;
    } catch (err) {
      this.failsafeWriteErrors += 1;
      this.permanentlyLost += 1;
      logFailsafeError(this.id, err, 1, this.failsafeWriteErrors);
    }
  }

  /**
   * Flush inmediato del buffer actual. Concurrent flushes están permitidos:
   * cada uno toma su batch del queue y los procesa en su propia conexión del
   * pool. La promise queda registrada en `inFlight` para que `close()` la
   * pueda awaitear y no perder data.
   */
  async flushNow(): Promise<void> {
    if (this.queue.length === 0) return;
    const batch = this.queue;
    this.queue = [];
    this.stopTimer();

    const promise = this.executeFlush(batch);
    this.inFlight.add(promise);
    try {
      await promise;
    } finally {
      this.inFlight.delete(promise);
    }
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
      this.permanentlyLost += batch.length;
      // eslint-disable-next-line no-console
      console.error(
        `[kit-observability] sink "${this.id}" flush failed and fail-safe is disabled, ${batch.length} entries permanently lost`,
        err
      );
      return;
    }

    let writtenToFailsafe = 0;
    let writeErrors = 0;
    let firstWriteError: unknown = null;
    for (const entry of batch) {
      try {
        this.failsafe.write(this.serializeForFailsafe(entry));
        writtenToFailsafe += 1;
      } catch (writeErr) {
        writeErrors += 1;
        if (firstWriteError === null) firstWriteError = writeErr;
      }
    }
    this.divertedToFailsafe += writtenToFailsafe;
    this.permanentlyLost += writeErrors;
    this.failsafeWriteErrors += writeErrors;
    // eslint-disable-next-line no-console
    console.error(
      `[kit-observability] sink "${this.id}" flush failed: ${writtenToFailsafe} diverted to fail-safe, ${writeErrors} permanently lost (failsafe also failed)`,
      err
    );
    if (firstWriteError !== null) {
      logFailsafeError(this.id, firstWriteError, writeErrors, this.failsafeWriteErrors);
    }
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
      divertedToFailsafe: this.divertedToFailsafe,
      permanentlyLost: this.permanentlyLost,
      failsafeWriteErrors: this.failsafeWriteErrors,
    };
  }

  /**
   * Cierra el sink. Drainea la cola con un flush final, awaitea cualquier
   * flush in-flight (para no perder data en shutdown), detiene el timer y
   * cierra el fail-safe writer. Idempotente.
   */
  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    this.stopTimer();
    await this.flushNow();
    // Drenar cualquier flush previo que arrancó por shouldFlushSync/batchSize
    // antes de close() y todavía no terminó. Sin esto, su INSERT puede quedar
    // colgado si Node sale antes de que la promise resuelva.
    if (this.inFlight.size > 0) {
      await Promise.allSettled([...this.inFlight]);
    }
    if (this.failsafe !== null) {
      this.failsafe.close();
    }
  }
}

/**
 * Console.error con prefijo del plugin para errores del fail-safe writer.
 * Centralizado para que el formato sea consistente entre el path post-close
 * (1 entry) y el path de divert masivo.
 */
function logFailsafeError(
  sinkId: string,
  err: unknown,
  affectedEntries: number,
  totalErrors: number
): void {
  // eslint-disable-next-line no-console
  console.error(
    `[kit-observability] sink "${sinkId}" failsafe write error (#${totalErrors}, affected ${affectedEntries} entries)`,
    err
  );
}
