import type { ModuleActivationContext } from '@coongro/module-core';
import { addSink } from '@coongro/core-logging';
import { loadConfig } from '../config.js';
import { runBootstrap } from '../bootstrap/run-bootstrap.js';
import { registerPartitions } from '../partitions/register.js';
import { DBSink } from '../sinks/db-sink.js';
import { FileFailsafeWriter } from '../sinks/failsafe-writer.js';
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
 *   3. Bootstrap idempotente del schema observability + tablas + version row.
 *   4. Registrar tablas particionadas con pg_partman.
 *   5. Crear el FailsafeWriter (mkdir + sync size).
 *   6. Instanciar DBSink con todo lo de arriba.
 *   7. addSink(dbSink) en el registry global de core-logging.
 *   8. Guardar runtime state para que el cron handler (maintenance) acceda.
 */
export async function activate(context: ModuleActivationContext): Promise<void> {
  const logger = context.api.logger;

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

  const dbSink = new DBSink(
    { raw: systemDb.raw },
    {
      batchSize: config.batchSize,
      batchIntervalMs: config.batchIntervalMs,
      failsafe,
    }
  );

  const added = addSink(dbSink);
  if (!added) {
    // El sink ya estaba registrado (re-activación eager). El registry mantiene
    // el original; descartamos este nuevo y dejamos el state apuntando al mismo
    // por idempotencia. NO crashear — es esperable durante hot-reload.
    logger.warn(`DBSink already registered, reusing existing instance`);
  }

  setRuntimeState({ systemDb, config, dbSink });
  logger.info('kit-observability activated', {
    sinkId: dbSink.id,
    batchSize: config.batchSize,
    batchIntervalMs: config.batchIntervalMs,
  });
}
