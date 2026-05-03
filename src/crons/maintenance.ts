import { PartitionManager } from '@coongro/database-core';
import type { ScheduledTaskContext } from '@coongro/module-core/types/index.js';
import { getRuntimeState } from '../runtime/state.js';

/**
 * Handler del scheduledTask `maintenance`. Corre `partman.run_maintenance_proc()`
 * cada hora para:
 *   - pre-crear las próximas N particiones (donde N = `partitionPremake`),
 *     evitando que un INSERT caiga fuera de rango (sin default partition,
 *     eso falla la query — ver ticket COONG-117/G1, sec. 11/9).
 *   - dropear particiones más viejas que `retention` (si está configurado;
 *     null por defecto en G1, agresivo en G4 = COONG-145).
 *
 * G4 puede sumar métricas de fallos del maintenance (run-time, error-rate)
 * sin tocar este archivo: solo wrapping con telemetría.
 */
export async function runMaintenance({ logger }: ScheduledTaskContext): Promise<void> {
  const { systemDb } = getRuntimeState();
  const manager = new PartitionManager(systemDb.raw);
  await manager.initialize();
  await manager.runMaintenance();
  logger.info('partition maintenance completed');
}
