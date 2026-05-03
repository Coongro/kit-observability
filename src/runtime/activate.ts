import { addSink, getSink } from '@coongro/core-logging';
import type { ModuleActivationContext } from '@coongro/module-core';

import { runBootstrap } from '../bootstrap/run-bootstrap.js';
import { loadConfig } from '../config.js';
import { registerPartitions } from '../partitions/register.js';
import { DBSink } from '../sinks/db-sink.js';
import { FileFailsafeWriter } from '../sinks/failsafe-writer.js';

import { adaptLogger } from './compat-logger.js';
import { setRuntimeState } from './state.js';

/**
 * activate() del plugin. Llamado por el plugin loader del API al boot
 * (por `runtime: 'eager'` declarado en el manifest).
 *
 * Orden de operaciones — cada paso hace fail-fast si algo no encaja, así el
 * plugin queda OUT en vez de quedar en estado inconsistente:
 *   1. Validar que `api.systemDatabase` esté disponible. Sin él el plugin
 *      no puede ni hacer bootstrap ni persistir logs — abortar el activate.
 *   2. Cargar config de env vars (puede throwear si una env var es inválida).
 *   3. Bootstrap idempotente del schema observability + tablas + version row
 *      (transaccional — si falla a mitad, rollback completo).
 *   4. Registrar tablas particionadas con pg_partman.
 *   5. Crear el FailsafeWriter (mkdir + sync size).
 *   6. Instanciar DBSink con todo lo de arriba.
 *   7. addSink(dbSink) en el registry global de core-logging.
 *      Si retorna false (sink ya existía), descartamos el nuevo (cerrando su
 *      failsafe writer para evitar FD leak) y reusamos la instancia del
 *      registry — sino el `runtime/state` apuntaría a una instancia que el
 *      registry rechazó y nunca recibe writes.
 *   8. Guardar runtime state para que el cron handler (maintenance) acceda.
 */
export async function activate(context: ModuleActivationContext): Promise<void> {
  const logger = adaptLogger(context.api.logger);

  if (!context.api.systemDatabase) {
    throw new Error(
      '[kit-observability] api.systemDatabase is required but not available in this runtime — plugin cannot bootstrap'
    );
  }
  const systemDb = context.api.systemDatabase;
  const config = loadConfig();

  await runBootstrap(systemDb.raw, logger);
  await registerPartitions(systemDb.raw, config, logger);

  const failsafe = new FileFailsafeWriter(
    config.failsafeDir,
    config.failsafeMaxFileBytes,
    config.failsafeMaxFiles
  );

  const newSink = new DBSink({
    raw: systemDb.raw,
    batchSize: config.batchSize,
    batchIntervalMs: config.batchIntervalMs,
    failsafe,
  });

  const added = addSink(newSink);
  let activeSink: DBSink;
  if (added) {
    activeSink = newSink;
  } else {
    // Sink ya estaba registrado (re-activación durante hot-reload del plugin).
    // El registry mantiene la instancia ORIGINAL — fetcheamos esa para que el
    // runtime state apunte al sink que efectivamente recibe writes.
    // El newSink que recién creamos queda huérfano: cerrarlo libera el FD del
    // FileFailsafeWriter que abrimos arriba, y previene un leak por cada
    // re-activación.
    const existing = getSink(newSink.id);
    if (existing instanceof DBSink) {
      activeSink = existing;
      await newSink.close();
      logger.warn('DBSink already registered, reusing existing instance from registry');
    } else {
      // Caso patológico: un sink con nuestro id existe pero NO es nuestro.
      // No podemos asumir su shape — fail fast.
      await newSink.close();
      throw new Error(
        `[kit-observability] sink id "${newSink.id}" is registered by a non-DBSink instance — cannot continue`
      );
    }
  }

  setRuntimeState({ systemDb, config, dbSink: activeSink });
  logger.info('kit-observability activated', {
    sinkId: activeSink.id,
    batchSize: config.batchSize,
    batchIntervalMs: config.batchIntervalMs,
    reused: !added,
  });
}
